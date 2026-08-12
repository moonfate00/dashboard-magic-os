"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PROVIDER_SECRET_IDS,
  createLockedAIRuntimeAdapter,
  createPrivateAIRuntimeAdapter,
  createSecretStorageCapabilities
} = require("../src/services/ai-runtime-adapter");

const nowMs = Date.parse("2026-08-12T00:00:00.000Z");

test("locked runtime adapter exposes no executable or private state", async () => {
  const adapter = createLockedAIRuntimeAdapter();
  const status = await adapter.status();
  assert.equal(status.entitlement.status, "locked");
  assert.equal(status.interactiveEnabled, false);
  assert.deepEqual(status.providers, []);
  assert.deepEqual(status.jobs, []);
  assert.equal("withProviderSecret" in adapter, false);
});

test("SecretStorage capabilities never fall back when Obsidian support is missing", async () => {
  const secrets = createSecretStorageCapabilities(null);
  assert.equal(secrets.available, false);
  assert.equal(await secrets.has(PROVIDER_SECRET_IDS.openai), false);
  await assert.rejects(secrets.withSecret(PROVIDER_SECRET_IDS.openai, async () => "unused"), (error) => (
    error.code === "secret-storage-unavailable"
  ));
});

test("SecretStorage reads only allowlisted provider slots", async () => {
  let reads = 0;
  const secrets = createSecretStorageCapabilities({
    async getSecret() { reads += 1; return "secret"; }
  });
  await assert.rejects(secrets.has("arbitrary-secret-slot"), (error) => error.code === "secret-id");
  await assert.rejects(secrets.withSecret("arbitrary-secret-slot", async () => null), (error) => error.code === "secret-id");
  assert.equal(reads, 0);
});

test("private runtime projects verification, provider, and job state without secrets", async () => {
  const stored = new Map([[PROVIDER_SECRET_IDS.openai, "test-provider-credential"]]);
  const reads = [];
  const secrets = createSecretStorageCapabilities({
    async getSecret(id) {
      reads.push(id);
      return stored.get(id) || "";
    }
  });
  const adapter = createPrivateAIRuntimeAdapter({
    secrets,
    loadEntitlementEnvelope: async () => "private-signed-envelope",
    verifyEntitlement: async (envelope) => {
      assert.equal(envelope, "private-signed-envelope");
      return { status: "active", features: ["assistant"], subject: "private-subject" };
    },
    loadJobs: async () => [{
      id: "job-private-id",
      status: "running",
      providerId: "openai",
      featureId: "assistant",
      prompt: "private health prompt",
      output: "private output"
    }]
  });
  const status = await adapter.status({ nowMs });
  assert.equal(status.entitlement.status, "active");
  assert.deepEqual(status.providers, [
    { id: "openai", status: "ready" },
    { id: "deepseek", status: "not-configured" }
  ]);
  assert.deepEqual(status.jobs, [{
    status: "running",
    providerId: "openai",
    featureId: "assistant",
    attempt: 0,
    errorCode: ""
  }]);
  assert.deepEqual(reads, [PROVIDER_SECRET_IDS.openai, PROVIDER_SECRET_IDS.deepseek]);
  assert.equal(JSON.stringify(status).includes("test-provider-credential"), false);
  assert.equal(JSON.stringify(status).includes("private-signed"), false);
  assert.equal(JSON.stringify(status).includes("private health"), false);
  assert.equal(JSON.stringify(status).includes("private-subject"), false);
});

test("provider secrets exist only inside the supplied operation scope", async () => {
  const secret = "test-provider-credential";
  const secrets = createSecretStorageCapabilities({
    async getSecret() { return secret; }
  });
  const adapter = createPrivateAIRuntimeAdapter({
    secrets,
    verifyEntitlement: async () => ({ status: "locked" })
  });
  const result = await adapter.withProviderSecret("openai", async (received) => {
    assert.equal(received, secret);
    return { authorized: true };
  });
  assert.deepEqual(result, { authorized: true });
  assert.equal(JSON.stringify(adapter).includes(secret), false);
  await assert.rejects(adapter.withProviderSecret("openai", async (received) => ({ leaked: received })), (error) => (
    error.code === "secret-escape" && !error.message.includes(secret)
  ));
  let getterCalls = 0;
  await assert.rejects(adapter.withProviderSecret("openai", async () => Object.defineProperty({}, "unsafe", {
    enumerable: true,
    get() { getterCalls += 1; return secret; }
  })), (error) => error.code === "secret-escape");
  assert.equal(getterCalls, 0);
  await assert.rejects(adapter.withProviderSecret("openai", async () => new TextEncoder().encode(secret)), (error) => (
    error.code === "secret-escape"
  ));
  await assert.rejects(adapter.withProviderSecret("openai", async () => {
    const cyclic = {};
    cyclic.self = cyclic;
    return cyclic;
  }), (error) => error.code === "secret-escape");
  await assert.rejects(adapter.withProviderSecret("openai", async (received) => {
    throw Object.assign(new Error(`provider echoed ${received}`), { code: "auth" });
  }), (error) => error.code === "auth" && !error.message.includes(secret));
  await assert.rejects(adapter.withProviderSecret("unknown", async () => null), (error) => error.code === "provider");
});

test("verification and loader failures fail closed without leaking error details", async () => {
  const adapter = createPrivateAIRuntimeAdapter({
    secrets: createSecretStorageCapabilities({ async getSecret() { throw new Error("private keychain error"); } }),
    loadEntitlementEnvelope: async () => "private-envelope",
    verifyEntitlement: async () => { throw new Error("private verification detail"); },
    loadJobs: async () => { throw new Error("private job database error"); }
  });
  const status = await adapter.status({ nowMs });
  assert.equal(status.entitlement.status, "locked");
  assert.equal(status.verificationError, "entitlement-verification");
  assert.equal(status.providers.every((provider) => provider.status === "not-configured"), true);
  assert.deepEqual(status.jobs, []);
  assert.equal(JSON.stringify(status).includes("private"), false);
});
