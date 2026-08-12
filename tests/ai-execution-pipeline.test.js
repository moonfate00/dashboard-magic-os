"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createVerifiedEntitlementAdapter } = require("../src/services/ai-entitlement");
const {
  createDeterministicAISimulation,
  createSimulatedAIExecutionPipeline
} = require("../src/services/ai-execution-pipeline");
const { createUsageManager } = require("../src/services/ai-usage");

const nowMs = Date.parse("2026-08-12T00:00:00.000Z");
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function createHarness(options = {}) {
  const entitlement = options.entitlement || await createVerifiedEntitlementAdapter(async () => ({
    status: options.entitlementStatus || "trial",
    features: options.features || ["assistant"],
    trialRemaining: options.entitlementTrial ?? 1
  })).resolve("signed-simulation-envelope", { nowMs });
  let usageState = { trialRemaining: options.localTrial ?? 1, ledger: [] };
  const usageManager = createUsageManager({
    now: () => new Date(nowMs),
    readState: () => usageState,
    writeState: (next) => { usageState = next; },
    save: options.saveUsage || (async () => {})
  });
  const jobs = [];
  const runtime = {
    async status() {
      return {
        entitlement,
        providers: [{ id: "openai", status: options.providerStatus || "ready" }]
      };
    }
  };
  const pipeline = createSimulatedAIExecutionPipeline({
    runtime,
    usageManager,
    simulationTransport: options.simulation || createDeterministicAISimulation({
      result: {
        data: { answer: 42 },
        requestId: "simulation-request-1",
        usage: { input: 5, output: 2, total: 7, cached: 1 }
      }
    }),
    saveJob: options.saveJob || (async (job) => { jobs.push(job); }),
    now: () => new Date(nowMs),
    setTimer: options.setTimer,
    clearTimer: options.clearTimer
  });
  return { jobs, pipeline, usageManager, usageState: () => usageState };
}

test("simulated execution completes entitlement, usage, validation, and archive lifecycle", async () => {
  const harness = await createHarness();
  const result = await harness.pipeline.execute({
    providerId: "openai",
    featureId: "assistant",
    payload: { prompt: "private prompt that must not persist" },
    validate(data) {
      assert.deepEqual(data, { answer: 42 });
      return { answer: data.answer };
    }
  });
  assert.deepEqual(result.data, { answer: 42 });
  assert.equal(result.outcome, "completed");
  assert.equal(result.job.status, "archived");
  assert.deepEqual(harness.jobs.map((job) => job.status), [
    "queued", "running", "response-received", "validating", "ready", "completed", "archived"
  ]);
  assert.equal(harness.jobs[2].requestId, "simulation-request-1");
  assert.equal(harness.usageState().trialRemaining, 0);
  assert.equal(harness.usageState().ledger[0].trialCharged, true);
  assert.equal(harness.usageState().ledger[0].totalTokens, 7);
  assert.equal(JSON.stringify(harness.jobs).includes("private prompt"), false);
  assert.equal(harness.pipeline.inFlightCount(), 0);
});

test("locked entitlement and unready providers fail before usage reservation", async () => {
  const locked = await createHarness({
    entitlement: undefined,
    entitlementStatus: "locked",
    entitlementTrial: 0,
    localTrial: 0
  });
  await assert.rejects(locked.pipeline.execute({ providerId: "openai", featureId: "assistant" }), (error) => (
    error.code === "locked"
  ));
  assert.equal(locked.usageManager.reservationCount(), 0);
  assert.deepEqual(locked.jobs, []);

  const unavailable = await createHarness({ providerStatus: "degraded" });
  await assert.rejects(unavailable.pipeline.execute({ providerId: "openai", featureId: "assistant" }), (error) => (
    error.code === "provider-not-ready"
  ));
  assert.equal(unavailable.usageManager.reservationCount(), 0);
  assert.deepEqual(unavailable.jobs, []);
});

test("a corrupted local trial balance cannot exceed the signed entitlement", async () => {
  const harness = await createHarness({ entitlementTrial: 1, localTrial: 999 });
  await harness.pipeline.execute({ providerId: "openai", featureId: "assistant" });
  assert.equal(harness.usageState().trialRemaining, 0);
  await assert.rejects(harness.pipeline.execute({ providerId: "openai", featureId: "assistant" }), (error) => (
    error.code === "trial-ended"
  ));
  assert.equal(harness.usageState().ledger.length, 1);
  assert.equal(harness.usageManager.reservationCount(), 0);
});

test("callers cannot mark a paid trial execution as non-billable", async () => {
  const harness = await createHarness();
  await harness.pipeline.execute({
    providerId: "openai",
    featureId: "assistant",
    billable: false
  });
  assert.equal(harness.usageState().trialRemaining, 0);
  assert.equal(harness.usageState().ledger[0].billable, true);
  assert.equal(harness.usageState().ledger[0].trialCharged, true);
});

test("only internally issued deterministic simulations can enter the pipeline", async () => {
  const entitlement = await createVerifiedEntitlementAdapter(async () => ({
    status: "active",
    features: ["assistant"]
  })).resolve("signed", { nowMs });
  const usageManager = createUsageManager();
  assert.throws(() => createSimulatedAIExecutionPipeline({
    runtime: { async status() { return { entitlement, providers: [{ id: "openai", status: "ready" }] }; } },
    usageManager,
    simulationTransport: { kind: "simulation", async execute() { return fetch("https://example.invalid"); } }
  }), (error) => error.code === "simulation-only");
  assert.throws(() => createDeterministicAISimulation({
    result: { data: { apiKey: "test-provider-credential" } }
  }), (error) => error.code === "validation");
});

test("validation failure archives an invalid job and never charges trial quota", async () => {
  const harness = await createHarness();
  await assert.rejects(harness.pipeline.execute({
    providerId: "openai",
    featureId: "assistant",
    validate() { throw new Error("private schema detail"); }
  }), (error) => error.code === "validation" && !error.message.includes("private"));
  assert.deepEqual(harness.jobs.map((job) => job.status), [
    "queued", "running", "response-received", "validating", "invalid", "archived"
  ]);
  assert.equal(harness.usageState().trialRemaining, 1);
  assert.equal(harness.usageState().ledger[0].trialCharged, false);
  assert.equal(harness.usageState().ledger[0].errorCode, "validation");
  assert.equal(harness.usageManager.reservationCount(), 0);
});

test("provider failure archives a failed job without persisting detail or charging trial", async () => {
  const harness = await createHarness({
    simulation: createDeterministicAISimulation({ mode: "error", errorCode: "provider" })
  });
  await assert.rejects(harness.pipeline.execute({
    providerId: "openai",
    featureId: "assistant",
    payload: { prompt: "private provider payload" }
  }), (error) => error.code === "provider" && !error.message.includes("private"));
  assert.deepEqual(harness.jobs.map((job) => job.status), ["queued", "running", "failed", "archived"]);
  assert.equal(harness.jobs[2].errorCode, "provider");
  assert.equal(harness.usageState().trialRemaining, 1);
  assert.equal(harness.usageState().ledger[0].trialCharged, false);
  assert.equal(JSON.stringify(harness.jobs).includes("private provider payload"), false);
});

test("timeout aborts pending simulation, releases trial, and archives timed-out state", async () => {
  let fireTimeout;
  let cleared = false;
  const harness = await createHarness({
    simulation: createDeterministicAISimulation({ mode: "pending" }),
    setTimer(callback) { fireTimeout = callback; return 11; },
    clearTimer(id) { cleared = id === 11; }
  });
  const pending = harness.pipeline.execute({ providerId: "openai", featureId: "assistant", timeoutMs: 20000 });
  while (!fireTimeout) await tick();
  fireTimeout();
  await assert.rejects(pending, (error) => error.code === "timeout");
  assert.deepEqual(harness.jobs.map((job) => job.status), ["queued", "running", "timed-out", "archived"]);
  assert.equal(harness.usageState().trialRemaining, 1);
  assert.equal(harness.usageManager.reservationCount(), 0);
  assert.equal(cleared, true);
});

test("cancellation and duplicate submission cannot leave reservations behind", async () => {
  const controller = new AbortController();
  const harness = await createHarness({
    simulation: createDeterministicAISimulation({ mode: "pending" }),
    setTimer() { return 12; },
    clearTimer() {}
  });
  const first = harness.pipeline.execute({
    providerId: "openai",
    featureId: "assistant",
    signal: controller.signal
  });
  while (harness.pipeline.inFlightCount() !== 1 || harness.jobs.at(-1)?.status !== "running") await tick();
  await assert.rejects(harness.pipeline.execute({ providerId: "openai", featureId: "assistant" }), (error) => (
    error.code === "request-in-progress"
  ));
  controller.abort();
  await assert.rejects(first, (error) => error.code === "cancelled");
  assert.deepEqual(harness.jobs.map((job) => job.status), ["queued", "running", "cancelled", "archived"]);
  assert.equal(harness.usageManager.reservationCount(), 0);
  assert.equal(harness.pipeline.inFlightCount(), 0);
});

test("usage persistence failure is explicit and releases a retryable reservation", async () => {
  let saves = 0;
  const harness = await createHarness({
    saveUsage: async () => {
      saves += 1;
      if (saves === 1) throw new Error("private disk failure");
    }
  });
  await assert.rejects(harness.pipeline.execute({
    providerId: "openai",
    featureId: "assistant",
    validate: (data) => data
  }), (error) => error.code === "persistence" && !error.message.includes("private"));
  assert.deepEqual(harness.jobs.map((job) => job.status), [
    "queued", "running", "response-received", "validating", "ready", "failed", "archived"
  ]);
  assert.equal(saves, 2);
  assert.equal(harness.usageState().trialRemaining, 1);
  assert.equal(harness.usageState().ledger[0].status, "failed");
  assert.equal(harness.usageManager.reservationCount(), 0);
});

test("job persistence failure is surfaced as pending recovery without charging trial", async () => {
  let jobSaves = 0;
  const harness = await createHarness({
    saveJob: async () => {
      jobSaves += 1;
      if (jobSaves >= 2) throw new Error("private job disk failure");
    }
  });
  await assert.rejects(harness.pipeline.execute({
    providerId: "openai",
    featureId: "assistant"
  }), (error) => {
    assert.equal(error.code, "persistence");
    assert.equal(error.jobPersistencePending, true);
    assert.equal(error.job.status, "queued");
    assert.equal(JSON.stringify(error.job).includes("private"), false);
    return true;
  });
  assert.equal(jobSaves, 3);
  assert.equal(harness.usageState().trialRemaining, 1);
  assert.equal(harness.usageState().ledger[0].status, "failed");
  assert.equal(harness.usageManager.reservationCount(), 0);
  assert.equal(harness.pipeline.inFlightCount(), 0);
});

test("post-settlement job persistence failure reports completed work and prevents double charge", async () => {
  let jobSaves = 0;
  const jobs = [];
  const harness = await createHarness({
    saveJob: async (job) => {
      jobSaves += 1;
      if (jobSaves === 6) throw new Error("private completion disk failure");
      jobs.push(job);
    }
  });
  const result = await harness.pipeline.execute({
    providerId: "openai",
    featureId: "assistant",
    validate: (data) => data
  });
  assert.equal(result.outcome, "completed-persistence-pending");
  assert.equal(result.jobPersistencePending, true);
  assert.equal(result.job.status, "ready");
  assert.equal(harness.usageState().trialRemaining, 0);
  assert.equal(harness.usageState().ledger[0].trialCharged, true);
  assert.deepEqual(jobs.map((job) => job.status), [
    "queued", "running", "response-received", "validating", "ready"
  ]);
  assert.equal(harness.usageManager.reservationCount(), 0);
  assert.equal(harness.pipeline.inFlightCount(), 0);
});
