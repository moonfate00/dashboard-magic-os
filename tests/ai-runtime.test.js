"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { canTransition, projectPersistentJob, transitionJob } = require("../src/services/ai-job-state");
const { createFetchTransport, finiteTimeout, requestWithTimeout } = require("../src/services/ai-transport");
const { createUsageManager } = require("../src/services/ai-usage");

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("AI job state machine permits recovery paths and rejects state skipping", () => {
  assert.equal(canTransition("queued", "running"), true);
  assert.equal(canTransition("queued", "ready"), false);
  assert.throws(() => transitionJob({ status: "queued" }, "ready"), /Invalid AI job transition/);
  const failed = transitionJob({ id: "job-1", status: "running" }, "failed", {
    errorCode: "provider",
    updatedAt: "2026-08-12T00:00:00.000Z"
  });
  assert.equal(failed.errorCode, "provider");
  const retried = transitionJob(failed, "queued", { updatedAt: "2026-08-12T00:01:00.000Z" });
  assert.equal(retried.errorCode, "");
  assert.equal(Object.isFrozen(retried), true);
});

test("persistent AI jobs exclude prompts, outputs, secrets, and arbitrary fields", () => {
  const projected = projectPersistentJob({
    id: "job-1",
    status: "running",
    providerId: "openai",
    featureId: "assistant",
    prompt: "private health context",
    output: "private model response",
    apiKey: "secret",
    requestId: "private health request",
    errorCode: "private health error",
    arbitrary: { nested: true }
  });
  assert.deepEqual(Object.keys(projected), [
    "id", "status", "providerId", "featureId", "requestId", "attempt", "createdAt", "updatedAt", "errorCode"
  ]);
  assert.equal(JSON.stringify(projected).includes("private"), false);
  assert.equal(projected.requestId, "");
  assert.equal(projected.errorCode, "request");
  assert.equal(Object.isFrozen(projected), true);
});

test("timeout normalization rejects non-finite and out-of-range values", () => {
  assert.equal(finiteTimeout(NaN), 120000);
  assert.equal(finiteTimeout(Infinity), 120000);
  assert.equal(finiteTimeout(1), 15000);
  assert.equal(finiteTimeout(9999999), 600000);
});

test("AI timeout aborts the underlying transport", async () => {
  let timeoutCallback;
  let transportSignal;
  let cleared = false;
  const pending = requestWithTimeout(({ signal }) => {
    transportSignal = signal;
    return new Promise(() => {});
  }, {}, {
    timeoutMs: 20000,
    setTimer(callback) { timeoutCallback = callback; return 7; },
    clearTimer(id) { cleared = id === 7; }
  });
  timeoutCallback();
  await assert.rejects(pending, (error) => error.code === "timeout");
  assert.equal(transportSignal.aborted, true);
  assert.equal(cleared, true);
});

test("AI requests support explicit user cancellation and clean up timers", async () => {
  const parent = new AbortController();
  let childSignal;
  let cleared = false;
  const pending = requestWithTimeout(({ signal }) => {
    childSignal = signal;
    return new Promise(() => {});
  }, {}, {
    signal: parent.signal,
    setTimer() { return 9; },
    clearTimer(id) { cleared = id === 9; }
  });
  parent.abort("user-request");
  await assert.rejects(pending, (error) => error.code === "cancelled");
  assert.equal(childSignal.aborted, true);
  assert.equal(cleared, true);
});

test("a request cancelled before dispatch never calls the provider transport", async () => {
  const parent = new AbortController();
  parent.abort();
  let calls = 0;
  await assert.rejects(requestWithTimeout(async () => { calls += 1; }, {}, { signal: parent.signal }), (error) => (
    error.code === "cancelled"
  ));
  assert.equal(calls, 0);
});

test("fetch transport forwards cancellation and returns a parser-safe response", async () => {
  const signal = new AbortController().signal;
  const transport = createFetchTransport(async (url, init) => {
    assert.equal(url, "https://provider.invalid/v1");
    assert.equal(init.signal, signal);
    assert.equal(init.redirect, "error");
    return {
      status: 200,
      headers: { forEach(callback) { callback("request-1", "x-request-id"); } },
      text: async () => "{\"ok\":true}"
    };
  }, { allowedOrigins: ["https://provider.invalid"] });
  const response = await transport({ url: "https://provider.invalid/v1", signal });
  assert.equal(response.json.ok, true);
  assert.equal(response.headers["x-request-id"], "request-1");
});

test("fetch transport rejects oversized provider responses", async () => {
  const transport = createFetchTransport(async () => ({
    status: 200,
    headers: { get: () => "2048" },
    text: async () => "not-read"
  }), { maxResponseBytes: 1024, allowedOrigins: ["https://provider.invalid"] });
  await assert.rejects(transport({ url: "https://provider.invalid/v1" }), (error) => (
    error.code === "response-too-large"
  ));
});

test("fetch transport stops reading a chunked response at the byte limit", async () => {
  let reads = 0;
  let cancelled = false;
  const chunks = [new Uint8Array(700), new Uint8Array(400)];
  const transport = createFetchTransport(async () => ({
    status: 200,
    headers: { get: () => "", forEach() {} },
    body: {
      getReader: () => ({
        async read() {
          const value = chunks[reads++];
          return value ? { done: false, value } : { done: true };
        },
        async cancel() { cancelled = true; }
      })
    }
  }), { maxResponseBytes: 1024, allowedOrigins: ["https://provider.invalid"] });
  await assert.rejects(transport({ url: "https://provider.invalid/v1" }), (error) => (
    error.code === "response-too-large"
  ));
  assert.equal(reads, 2);
  assert.equal(cancelled, true);
});

test("usage settlement is serialized so concurrent successes cannot lose ledger entries", async () => {
  let state = { trialRemaining: 2, ledger: [] };
  const releases = [];
  const manager = createUsageManager({
    now: () => new Date("2026-08-12T00:00:00.000Z"),
    readState: () => state,
    writeState: (next) => { state = next; },
    save: () => new Promise((resolve) => releases.push(resolve))
  });
  const first = manager.begin({ providerId: "openai", featureId: "assistant", trial: true });
  const second = manager.begin({ providerId: "openai", featureId: "card-library", trial: true });
  assert.throws(() => manager.begin({ providerId: "openai", featureId: "assistant", trial: true }), (error) => (
    error.code === "trial-ended"
  ));
  const settlingFirst = manager.settle(first, { status: "ready" });
  const settlingSecond = manager.settle(second, { status: "ready" });
  await tick();
  assert.equal(releases.length, 1);
  releases.shift()();
  await settlingFirst;
  await tick();
  assert.equal(releases.length, 1);
  releases.shift()();
  await settlingSecond;
  assert.equal(state.trialRemaining, 0);
  assert.equal(state.ledger.length, 2);
  assert.equal(manager.reservationCount(), 0);
});

test("failed persistence rolls state back and leaves a retryable reservation", async () => {
  let state = { trialRemaining: 1, ledger: [], privateField: "do-not-persist" };
  let fail = true;
  const manager = createUsageManager({
    readState: () => state,
    writeState: (next) => { state = next; },
    save: async (next) => {
      assert.equal("privateField" in next, false);
      if (fail) throw new Error("disk-failure");
    }
  });
  const ticket = manager.begin({ providerId: "openai", featureId: "assistant", trial: true });
  assert.throws(() => { ticket.trialReserved = false; }, TypeError);
  await assert.rejects(manager.settle(ticket, { status: "ready" }), /disk-failure/);
  assert.equal(state.privateField, "do-not-persist");
  assert.equal(state.trialRemaining, 1);
  assert.equal(ticket.state, "open");
  assert.equal(manager.reservationCount(), 1);
  fail = false;
  await manager.settle(ticket, { status: "ready", usage: { input: NaN, total: Infinity } });
  assert.equal(state.trialRemaining, 0);
  assert.equal(state.ledger[0].inputTokens, 0);
  assert.equal(state.ledger[0].totalTokens, 0);
});

test("usage settlement rejects forged tickets and stores allowlisted identifiers only", async () => {
  let state = { trialRemaining: 1, ledger: [] };
  const manager = createUsageManager({
    readState: () => state,
    writeState: (next) => { state = next; }
  });
  const forged = {
    id: "forged",
    state: "open",
    providerId: "sk-private-secret",
    featureId: "private prompt",
    trialReserved: false,
    startedAt: "now"
  };
  assert.equal((await manager.settle(forged, { status: "ready" })).duplicate, true);
  assert.equal(state.ledger.length, 0);

  const ticket = manager.begin({ providerId: "sk-private-secret", featureId: "private prompt" });
  await manager.settle(ticket, { status: "ready" });
  assert.equal(state.ledger[0].provider, "unknown");
  assert.equal(state.ledger[0].feature, "invalid-feature");
  assert.equal(JSON.stringify(state).includes("private"), false);
});

test("failed AI operations are recorded without charging trial quota", async () => {
  let state = { trialRemaining: 1, ledger: [] };
  const manager = createUsageManager({
    readState: () => state,
    writeState: (next) => { state = next; }
  });
  const failure = Object.assign(new Error("provider down"), { code: "provider" });
  await assert.rejects(manager.run({ providerId: "deepseek", featureId: "assistant", trial: true }, async () => {
    throw failure;
  }), failure);
  assert.equal(state.trialRemaining, 1);
  assert.equal(state.ledger[0].status, "failed");
  assert.equal(state.ledger[0].trialCharged, false);
});
