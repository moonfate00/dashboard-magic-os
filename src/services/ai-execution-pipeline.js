"use strict";

const { evaluateAccess, normalizeFeatureId } = require("./ai-entitlement");
const { normalizeErrorCode, projectPersistentJob, transitionJob } = require("./ai-job-state");
const { normalizeProviderId } = require("./ai-usage");
const { requestWithTimeout } = require("./ai-transport");

const SIMULATION_TRANSPORTS = new WeakSet();

function executionError(code) {
  const error = new Error("Simulated AI execution failed");
  error.code = normalizeErrorCode(code);
  return error;
}

function normalizeSimulationResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw executionError("validation");
  return {
    data: value.data,
    requestId: String(value.requestId || ""),
    usage: value.usage && typeof value.usage === "object" ? value.usage : {}
  };
}

function cloneSimulationValue(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw executionError("validation");
  }
}

function containsSensitiveKey(value, seen = new WeakSet(), depth = 0) {
  if (!value || typeof value !== "object") return false;
  if (depth > 8 || seen.has(value)) return true;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return true;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsSensitiveKey(item, seen, depth + 1));
  return Object.entries(value).some(([key, item]) => (
    /(?:api[_-]?key|authorization|credential|password|secret|token)/i.test(key)
    || containsSensitiveKey(item, seen, depth + 1)
  ));
}

function createDeterministicAISimulation(options = {}) {
  const mode = ["success", "error", "pending"].includes(options.mode) ? options.mode : "success";
  const fixedResult = mode === "success" ? cloneSimulationValue(options.result || {
    data: { ok: true },
    requestId: "simulation-request",
    usage: { input: 1, output: 1, total: 2, cached: 0 }
  }) : null;
  if (fixedResult && containsSensitiveKey(fixedResult)) throw executionError("validation");
  const transport = Object.freeze({
    async execute(request = {}) {
      if (mode === "error") throw executionError(options.errorCode || "provider");
      if (mode === "pending") {
        return new Promise((_, reject) => {
          const fail = () => reject(executionError("cancelled"));
          if (request.signal?.aborted) fail();
          else request.signal?.addEventListener?.("abort", fail, { once: true });
        });
      }
      return cloneSimulationValue(fixedResult);
    }
  });
  SIMULATION_TRANSPORTS.add(transport);
  return transport;
}

function createSimulatedAIExecutionPipeline(options = {}) {
  const runtime = options.runtime;
  const usageManager = options.usageManager;
  const simulation = options.simulationTransport;
  if (!runtime || typeof runtime.status !== "function") throw new TypeError("AI execution requires a runtime adapter");
  if (!usageManager || typeof usageManager.begin !== "function" || typeof usageManager.settle !== "function") {
    throw new TypeError("AI execution requires a usage manager");
  }
  if (!simulation || !SIMULATION_TRANSPORTS.has(simulation) || typeof simulation.execute !== "function") {
    throw executionError("simulation-only");
  }
  const saveJob = typeof options.saveJob === "function" ? options.saveJob : async () => {};
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const inFlight = new Set();
  let sequence = 0;

  async function execute(input = {}) {
    const providerId = normalizeProviderId(input.providerId);
    const featureId = normalizeFeatureId(input.featureId);
    if (providerId === "unknown") throw executionError("provider");
    if (featureId === "invalid-feature") throw executionError("feature-not-entitled");
    const operationKey = `${providerId}:${featureId}`;
    if (inFlight.has(operationKey)) throw executionError("request-in-progress");
    inFlight.add(operationKey);
    let job = null;
    let ticket = null;
    let terminalStatus = "";

    const persist = async (candidate) => {
      const projected = projectPersistentJob(candidate);
      try {
        await saveJob(projected);
      } catch {
        throw executionError("persistence");
      }
      job = candidate;
      return projected;
    };
    const move = async (status, detail = {}) => persist(transitionJob(job, status, {
      ...detail,
      updatedAt: now().toISOString()
    }));

    try {
      const runtimeStatus = await runtime.status({ nowMs: now().getTime() });
      const access = evaluateAccess({
        snapshot: runtimeStatus?.entitlement,
        featureId,
        enabled: true,
        trialReserved: usageManager.reservationCount?.() || 0
      });
      if (!access.allowed) throw executionError(access.reason || "locked");
      const provider = runtimeStatus?.providers?.find((item) => item?.id === providerId);
      if (provider?.status !== "ready") throw executionError("provider-not-ready");

      const createdAt = now().toISOString();
      job = Object.freeze({
        id: `simulation-job-${now().getTime()}-${++sequence}`,
        status: "queued",
        providerId,
        featureId,
        requestId: "",
        attempt: 1,
        createdAt,
        updatedAt: createdAt,
        errorCode: ""
      });
      await persist(job);
      ticket = usageManager.begin({
        providerId,
        featureId,
        billable: true,
        trial: access.status === "trial",
        trialRemaining: access.trialRemaining
      });
      await move("running");

      const response = normalizeSimulationResult(await requestWithTimeout(
        (request) => simulation.execute(request),
        { providerId, featureId, payload: input.payload },
        {
          timeoutMs: input.timeoutMs,
          signal: input.signal,
          setTimer: options.setTimer,
          clearTimer: options.clearTimer
        }
      ));
      await move("response-received", { requestId: response.requestId });
      await move("validating");
      const validate = typeof input.validate === "function" ? input.validate : (data) => data;
      let data;
      try {
        data = await validate(response.data);
      } catch {
        throw executionError("validation");
      }
      if (data === undefined || data === null || data === false) throw executionError("validation");
      await move("ready");
      try {
        await usageManager.settle(ticket, { status: "ready", usage: response.usage });
      } catch {
        throw executionError("persistence");
      }
      try {
        await move("completed");
      } catch {
        return Object.freeze({
          data,
          outcome: "completed-persistence-pending",
          jobPersistencePending: true,
          job: projectPersistentJob(job)
        });
      }
      terminalStatus = "completed";
      try {
        await move("archived");
      } catch {
        return Object.freeze({
          data,
          outcome: "archive-persistence-pending",
          jobPersistencePending: true,
          job: projectPersistentJob(job)
        });
      }
      return Object.freeze({
        data,
        outcome: terminalStatus,
        job: projectPersistentJob(job)
      });
    } catch (caught) {
      const error = executionError(caught?.code || "request");
      if (ticket?.state === "open") {
        try {
          await usageManager.settle(ticket, { status: "failed", errorCode: error.code });
        } catch {
          error.usageSettlementPending = true;
        }
      }
      if (job) {
        let target = "failed";
        if (job.status === "queued") target = "cancelled";
        else if (job.status === "running" && error.code === "timeout") target = "timed-out";
        else if (job.status === "running" && error.code === "cancelled") target = "cancelled";
        else if (job.status === "validating" && error.code === "validation") target = "invalid";
        try {
          await move(target, { errorCode: error.code });
          terminalStatus = target;
          await move("archived");
        } catch {
          error.jobPersistencePending = true;
        }
      }
      error.outcome = terminalStatus || "failed";
      error.job = job ? projectPersistentJob(job) : null;
      throw error;
    } finally {
      inFlight.delete(operationKey);
    }
  }

  return Object.freeze({ execute, inFlightCount: () => inFlight.size });
}

module.exports = {
  createDeterministicAISimulation,
  createSimulatedAIExecutionPipeline,
  containsSensitiveKey,
  executionError,
  normalizeSimulationResult
};
