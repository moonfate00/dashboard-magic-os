"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createVerifiedEntitlementAdapter } = require("../src/services/ai-entitlement");
const {
  MAX_PROMPT_BYTES,
  PROVIDER_ENDPOINTS,
  createAIProviderSandbox,
  createAIProviderSandboxTransport
} = require("../src/services/ai-provider-sandbox");
const { createPrivateAIRuntimeAdapter, createSecretStorageCapabilities } = require("../src/services/ai-runtime-adapter");
const { createUsageManager } = require("../src/services/ai-usage");

const nowMs = Date.parse("2026-08-12T00:00:00.000Z");

async function createHarness(options = {}) {
  const secret = options.secret || "test-provider-credential";
  const entitlement = await createVerifiedEntitlementAdapter(async () => ({
    status: options.entitlementStatus || "trial",
    features: options.features || ["assistant"],
    trialRemaining: options.signedTrial ?? 1
  })).resolve("signed-test-envelope", { nowMs });
  const runtime = options.runtime || {
    async status() {
      return {
        entitlement,
        interactiveEnabled: true,
        providers: [{ id: "openai", status: options.providerStatus || "ready" }, { id: "deepseek", status: "ready" }]
      };
    },
    async withProviderSecret(providerId, operation) {
      assert.ok(["openai", "deepseek"].includes(providerId));
      const result = await operation(secret);
      assert.equal(JSON.stringify(result).includes(secret), false);
      return result;
    }
  };
  let usageState = { trialRemaining: options.localTrial ?? 1, ledger: [] };
  const usageManager = createUsageManager({
    now: () => new Date(nowMs),
    readState: () => usageState,
    writeState: (next) => { usageState = next; },
    save: options.saveUsage || (async () => {})
  });
  const jobs = [];
  const requests = [];
  const transport = createAIProviderSandboxTransport(options.fetch || (async (url, init) => {
    requests.push({ url, init });
    return {
      status: 200,
      headers: { get: () => "", forEach(callback) { callback("provider-request-1", "x-request-id"); } },
      text: async () => JSON.stringify({
        id: "provider-request-1",
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "{\"ok\":true}" }] }],
        usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 }
      })
    };
  }), { maxResponseBytes: 1024 * 1024 });
  const sandbox = createAIProviderSandbox({
    runtime,
    usageManager,
    transport,
    models: { openai: "gpt-test", deepseek: "deepseek-test" },
    saveJob: options.saveJob || (async (job) => jobs.push(job)),
    now: () => new Date(nowMs),
    setTimer: options.setTimer,
    clearTimer: options.clearTimer
  });
  return { jobs, requests, sandbox, secret, usageState: () => usageState, usageManager };
}

test("Provider sandbox binds OpenAI endpoint, model, secret scope, privacy defaults, and lifecycle", async () => {
  const harness = await createHarness();
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { ok: { type: "boolean" } },
    required: ["ok"]
  };
  const result = await harness.sandbox.execute({
    providerId: "openai",
    featureId: "assistant",
    url: "https://attacker.invalid/collect",
    model: "caller-model",
    apiKey: "caller-key",
    billable: false,
    system: "private system",
    user: "private user",
    schema,
    validate: (data) => data
  });
  assert.deepEqual(result.data, { ok: true });
  assert.deepEqual(result.usage, { input: 4, output: 2, total: 6, cached: 0 });
  assert.equal(result.requestId, "provider-request-1");
  assert.equal(result.outcome, "completed");
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].url, PROVIDER_ENDPOINTS.openai);
  assert.equal(harness.requests[0].init.redirect, "error");
  assert.equal(harness.requests[0].init.headers.Authorization, `Bearer ${harness.secret}`);
  const body = JSON.parse(harness.requests[0].init.body);
  assert.equal(body.model, "gpt-test");
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 12000);
  assert.equal(JSON.stringify(body).includes("caller-model"), false);
  assert.equal(JSON.stringify(body).includes("caller-key"), false);
  assert.deepEqual(harness.jobs.map(({ status }) => status), [
    "queued", "running", "response-received", "validating", "ready", "completed", "archived"
  ]);
  assert.equal(JSON.stringify(harness.jobs).includes("private user"), false);
  assert.equal(JSON.stringify(result.job).includes(harness.secret), false);
  assert.equal(harness.usageState().trialRemaining, 0);
  assert.equal(harness.usageState().ledger[0].billable, true);
  assert.equal(harness.usageState().ledger[0].totalTokens, 6);
});

test("DeepSeek stays on its fixed endpoint and uses its configured model", async () => {
  const requests = [];
  const harness = await createHarness({
    entitlementStatus: "active",
    localTrial: 0,
    fetch: async (url, init) => {
      requests.push({ url, init });
      return {
        status: 200,
        headers: { get: () => "", forEach() {} },
        text: async () => JSON.stringify({
          id: "deepseek-request",
          choices: [{ finish_reason: "stop", message: { content: "answer" } }],
          usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 }
        })
      };
    }
  });
  const result = await harness.sandbox.execute({
    providerId: "deepseek",
    featureId: "assistant",
    system: "system",
    user: "user",
    validate: (text) => ({ text })
  });
  assert.deepEqual(result.data, { text: "answer" });
  assert.equal(requests[0].url, PROVIDER_ENDPOINTS.deepseek);
  assert.equal(JSON.parse(requests[0].init.body).model, "deepseek-test");
});

test("locked entitlement and unready providers fail before secret or network access", async () => {
  let secretCalls = 0;
  let fetchCalls = 0;
  const entitlement = await createVerifiedEntitlementAdapter(async () => ({ status: "locked", features: ["assistant"] }))
    .resolve("signed", { nowMs });
  const runtime = {
    async status() { return { entitlement, interactiveEnabled: true, providers: [{ id: "openai", status: "ready" }] }; },
    async withProviderSecret() { secretCalls += 1; }
  };
  const locked = await createHarness({ runtime, fetch: async () => { fetchCalls += 1; } });
  await assert.rejects(locked.sandbox.execute({ providerId: "openai", featureId: "assistant" }), (error) => error.code === "locked");
  assert.equal(secretCalls, 0);
  assert.equal(fetchCalls, 0);
  assert.deepEqual(locked.jobs, []);

  const unready = await createHarness({ providerStatus: "not-configured", fetch: async () => { fetchCalls += 1; } });
  await assert.rejects(unready.sandbox.execute({ providerId: "openai", featureId: "assistant" }), (error) => error.code === "provider-not-ready");
  assert.equal(fetchCalls, 0);
  assert.deepEqual(unready.jobs, []);
});

test("real private runtime keeps provider credentials inside the request scope", async () => {
  const secret = "test-provider-credential";
  const runtime = createPrivateAIRuntimeAdapter({
    secrets: createSecretStorageCapabilities({ async getSecret() { return secret; } }),
    loadEntitlementEnvelope: async () => "signed-private-envelope",
    verifyEntitlement: async () => ({ status: "active", features: ["assistant"] }),
    executionEnabled: true
  });
  const harness = await createHarness({ runtime, secret, localTrial: 0 });
  const result = await harness.sandbox.execute({ providerId: "openai", featureId: "assistant", user: "hello", validate: (data) => data });
  assert.equal(result.outcome, "completed");
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(harness.jobs).includes(secret), false);
});

test("Provider validation failure archives safely and does not charge trial quota", async () => {
  const harness = await createHarness();
  await assert.rejects(harness.sandbox.execute({
    providerId: "openai",
    featureId: "assistant",
    schema: { type: "object" },
    validate() { throw new Error("private schema detail"); }
  }), (error) => error.code === "validation" && !error.message.includes("private"));
  assert.deepEqual(harness.jobs.map(({ status }) => status), [
    "queued", "running", "response-received", "validating", "invalid", "archived"
  ]);
  assert.equal(harness.usageState().trialRemaining, 1);
  assert.equal(harness.usageState().ledger[0].trialCharged, false);
});

test("only sandbox-issued transports are accepted and model identifiers are constrained", () => {
  const runtime = { status() {}, withProviderSecret() {} };
  const usageManager = createUsageManager();
  assert.throws(() => createAIProviderSandbox({
    runtime,
    usageManager,
    transport: async () => {},
    models: { openai: "gpt-test", deepseek: "deepseek-test" }
  }), (error) => error.code === "transport-unsupported");
  const transport = createAIProviderSandboxTransport(async () => {});
  assert.throws(() => createAIProviderSandbox({
    runtime,
    usageManager,
    transport,
    models: { openai: "https://attacker.invalid", deepseek: "deepseek-test" }
  }), (error) => error.code === "validation");
});

test("runtime execution must be explicitly enabled even with valid entitlement and secrets", async () => {
  let secretCalls = 0;
  const entitlement = await createVerifiedEntitlementAdapter(async () => ({ status: "active", features: ["assistant"] }))
    .resolve("signed", { nowMs });
  const runtime = {
    async status() { return { entitlement, interactiveEnabled: false, providers: [{ id: "openai", status: "ready" }] }; },
    async withProviderSecret() { secretCalls += 1; }
  };
  const harness = await createHarness({ runtime, localTrial: 0 });
  await assert.rejects(harness.sandbox.execute({ providerId: "openai", featureId: "assistant" }), (error) => error.code === "disabled");
  assert.equal(secretCalls, 0);
  assert.equal(harness.requests.length, 0);
});

test("sandbox permits only bounded web search and rejects remote tools, getters, and oversized prompts", async () => {
  const harness = await createHarness({ entitlementStatus: "active", localTrial: 0 });
  await harness.sandbox.execute({
    providerId: "openai",
    featureId: "assistant",
    tools: [{ type: "web_search" }],
    user: "search"
  });
  assert.deepEqual(JSON.parse(harness.requests[0].init.body).tools, [{ type: "web_search" }]);
  for (const tools of [
    [{ type: "mcp", server_url: "https://attacker.invalid" }],
    [{ type: "web_search", extra: true }]
  ]) {
    await assert.rejects(harness.sandbox.execute({ providerId: "openai", featureId: "assistant", tools }), (error) => error.code === "validation");
  }
  let getterCalls = 0;
  const unsafeSchema = Object.defineProperty({}, "type", { enumerable: true, get() { getterCalls += 1; return "object"; } });
  await assert.rejects(harness.sandbox.execute({ providerId: "openai", featureId: "assistant", schema: unsafeSchema }), (error) => error.code === "validation");
  assert.equal(getterCalls, 0);
  await assert.rejects(harness.sandbox.execute({
    providerId: "openai",
    featureId: "assistant",
    user: "x".repeat(MAX_PROMPT_BYTES + 1)
  }), (error) => error.code === "validation");
  assert.equal(harness.usageState().ledger.length, 1);
});

test("HTTP failure is redacted, archived, and does not charge trial quota", async () => {
  const harness = await createHarness({
    fetch: async () => ({
      status: 401,
      headers: { get: () => "", forEach() {} },
      text: async () => "{\"error\":{\"message\":\"bad private credential\"}}"
    })
  });
  await assert.rejects(harness.sandbox.execute({ providerId: "openai", featureId: "assistant" }), (error) => (
    error.code === "http" && !error.message.includes("private")
  ));
  assert.deepEqual(harness.jobs.map(({ status }) => status), ["queued", "running", "failed", "archived"]);
  assert.equal(JSON.stringify(harness.jobs).includes("private credential"), false);
  assert.equal(harness.usageState().trialRemaining, 1);
  assert.equal(harness.usageState().ledger[0].trialCharged, false);
});

test("user cancellation reaches fetch and releases the trial reservation", async () => {
  const controller = new AbortController();
  let fetchSignal;
  const harness = await createHarness({
    fetch: async (_url, init) => {
      fetchSignal = init.signal;
      return new Promise((_, reject) => init.signal.addEventListener("abort", () => {
        reject(Object.assign(new Error("private abort detail"), { code: "cancelled" }));
      }, { once: true }));
    },
    setTimer() { return 17; },
    clearTimer() {}
  });
  const pending = harness.sandbox.execute({ providerId: "openai", featureId: "assistant", signal: controller.signal });
  while (!fetchSignal) await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, (error) => error.code === "cancelled" && !error.message.includes("private"));
  assert.equal(fetchSignal.aborted, true);
  assert.equal(harness.usageManager.reservationCount(), 0);
  assert.equal(harness.usageState().trialRemaining, 1);
  assert.deepEqual(harness.jobs.map(({ status }) => status), ["queued", "running", "cancelled", "archived"]);
});
