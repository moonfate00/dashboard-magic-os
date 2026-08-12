"use strict";

const { evaluateAccess, normalizeFeatureId } = require("./ai-entitlement");
const { buildDeepSeekRequest, buildOpenAIRequest, parseDeepSeekResponse, parseOpenAIResponse } = require("./ai-provider");
const { normalizeErrorCode, projectPersistentJob, transitionJob } = require("./ai-job-state");
const { createFetchTransport, requestWithTimeout } = require("./ai-transport");
const { normalizeProviderId } = require("./ai-usage");

const PROVIDER_ENDPOINTS = Object.freeze({
  openai: "https://api.openai.com/v1/responses",
  deepseek: "https://api.deepseek.com/chat/completions"
});
const SANDBOX_TRANSPORTS = new WeakSet();
const MAX_PROMPT_BYTES = 2 * 1024 * 1024;
const MAX_SCHEMA_BYTES = 256 * 1024;

function sandboxError(code) {
  const error = new Error("AI Provider sandbox request failed");
  error.code = normalizeErrorCode(code);
  return error;
}

function normalizeModel(value) {
  const model = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(model)) throw sandboxError("validation");
  return model;
}

function byteLength(value) {
  return typeof Buffer !== "undefined" ? Buffer.byteLength(value, "utf8") : new TextEncoder().encode(value).length;
}

function plainJSON(value, maxBytes) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw sandboxError("validation");
  const seen = new WeakSet();
  const visit = (item, depth = 0) => {
    if (item === null || ["string", "boolean"].includes(typeof item)) return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (!item || typeof item !== "object" || depth > 14 || seen.has(item)) throw sandboxError("validation");
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) throw sandboxError("validation");
    seen.add(item);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    Object.values(descriptors).forEach((descriptor) => {
      if (typeof descriptor.get === "function" || typeof descriptor.set === "function") throw sandboxError("validation");
      visit(descriptor.value, depth + 1);
    });
  };
  visit(value);
  const serialized = JSON.stringify(value);
  if (byteLength(serialized) > maxBytes) throw sandboxError("validation");
  return JSON.parse(serialized);
}

function dataField(input, key) {
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  if (!descriptor) return undefined;
  if (typeof descriptor.get === "function" || typeof descriptor.set === "function") throw sandboxError("validation");
  return descriptor.value;
}

function normalizeSandboxInput(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw sandboxError("validation");
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw sandboxError("validation");
  const system = String(dataField(input, "system") || "");
  const user = String(dataField(input, "user") || "");
  if (byteLength(system) + byteLength(user) > MAX_PROMPT_BYTES) throw sandboxError("validation");
  const schemaInput = dataField(input, "schema");
  const schema = schemaInput ? plainJSON(schemaInput, MAX_SCHEMA_BYTES) : null;
  const toolsInput = dataField(input, "tools");
  const requestedTools = Array.isArray(toolsInput) ? toolsInput : [];
  if (toolsInput !== undefined && !Array.isArray(toolsInput)) throw sandboxError("validation");
  const tools = requestedTools.map((tool) => {
    const safe = plainJSON(tool, 1024);
    if (safe.type !== "web_search" || Object.keys(safe).some((key) => key !== "type")) throw sandboxError("validation");
    return Object.freeze({ type: "web_search" });
  }).slice(0, 1);
  if (requestedTools.length !== tools.length) throw sandboxError("validation");
  return Object.freeze({
    system,
    user,
    schema,
    schemaName: String(dataField(input, "schemaName") || ""),
    tools: Object.freeze(tools),
    reasoning: String(dataField(input, "reasoning") || ""),
    deepseekThinking: dataField(input, "deepseekThinking") === true,
    maxOutputTokens: dataField(input, "maxOutputTokens")
  });
}

function createAIProviderSandboxTransport(fetchImplementation, options = {}) {
  const transport = createFetchTransport(fetchImplementation, {
    allowedOrigins: Object.values(PROVIDER_ENDPOINTS).map((value) => new URL(value).origin),
    maxResponseBytes: options.maxResponseBytes
  });
  SANDBOX_TRANSPORTS.add(transport);
  return transport;
}

function createAIProviderSandbox(options = {}) {
  const runtime = options.runtime;
  const usageManager = options.usageManager;
  const transport = options.transport;
  if (!runtime || typeof runtime.status !== "function" || typeof runtime.withProviderSecret !== "function") {
    throw new TypeError("AI Provider sandbox requires a private runtime adapter");
  }
  if (!usageManager || typeof usageManager.begin !== "function" || typeof usageManager.settle !== "function") {
    throw new TypeError("AI Provider sandbox requires a usage manager");
  }
  if (!transport || !SANDBOX_TRANSPORTS.has(transport)) throw sandboxError("transport-unsupported");
  const models = Object.freeze({
    openai: normalizeModel(options.models?.openai),
    deepseek: normalizeModel(options.models?.deepseek)
  });
  const saveJob = typeof options.saveJob === "function" ? options.saveJob : async () => {};
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const inFlight = new Set();
  let sequence = 0;

  function buildRequest(providerId, input, secret) {
    const common = {
      model: models[providerId],
      system: String(input.system || ""),
      user: String(input.user || ""),
      reasoning: input.reasoning,
      schema: input.schema,
      schemaName: input.schemaName,
      maxOutputTokens: input.maxOutputTokens
    };
    const payload = providerId === "openai"
      ? buildOpenAIRequest({ ...common, tools: input.tools })
      : buildDeepSeekRequest({ ...common, deepseekThinking: input.deepseekThinking });
    return {
      url: PROVIDER_ENDPOINTS[providerId],
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload)
    };
  }

  function parseResponse(providerId, response, input) {
    const parseOptions = { schema: input.schema };
    return providerId === "openai"
      ? parseOpenAIResponse(response, parseOptions)
      : parseDeepSeekResponse(response, parseOptions);
  }

  async function execute(input = {}) {
    const providerId = normalizeProviderId(input.providerId);
    const featureId = normalizeFeatureId(input.featureId);
    if (!Object.hasOwn(PROVIDER_ENDPOINTS, providerId)) throw sandboxError("provider");
    if (featureId === "invalid-feature") throw sandboxError("feature-not-entitled");
    const operationKey = `${providerId}:${featureId}`;
    if (inFlight.has(operationKey)) throw sandboxError("request-in-progress");
    inFlight.add(operationKey);
    let safeInput;
    let job = null;
    let ticket = null;
    let terminalStatus = "";

    const persist = async (candidate) => {
      const projected = projectPersistentJob(candidate);
      try { await saveJob(projected); } catch { throw sandboxError("persistence"); }
      job = candidate;
      return projected;
    };
    const move = (status, detail = {}) => persist(transitionJob(job, status, {
      ...detail,
      updatedAt: now().toISOString()
    }));

    try {
      safeInput = normalizeSandboxInput(input);
      const runtimeStatus = await runtime.status({ nowMs: now().getTime() });
      if (runtimeStatus?.interactiveEnabled !== true) throw sandboxError("disabled");
      const access = evaluateAccess({
        snapshot: runtimeStatus?.entitlement,
        featureId,
        enabled: true,
        trialReserved: usageManager.reservationCount?.() || 0
      });
      if (!access.allowed) throw sandboxError(access.reason || "locked");
      const provider = runtimeStatus?.providers?.find((item) => item?.id === providerId);
      if (provider?.status !== "ready") throw sandboxError("provider-not-ready");

      const createdAt = now().toISOString();
      job = Object.freeze({
        id: `provider-job-${now().getTime()}-${++sequence}`,
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

      const response = await runtime.withProviderSecret(providerId, async (secret) => requestWithTimeout(
        (request) => transport(request),
        buildRequest(providerId, safeInput, secret),
        {
          timeoutMs: input.timeoutMs,
          signal: input.signal,
          setTimer: options.setTimer,
          clearTimer: options.clearTimer
        }
      ));
      const parsed = parseResponse(providerId, response, safeInput);
      await move("response-received", { requestId: parsed.requestId });
      await move("validating");
      const validate = typeof input.validate === "function" ? input.validate : (value) => value;
      let data;
      try { data = await validate(safeInput.schema ? parsed.data : parsed.text); } catch { throw sandboxError("validation"); }
      if (data === undefined || data === null || data === false) throw sandboxError("validation");
      await move("ready");
      try { await usageManager.settle(ticket, { status: "ready", usage: parsed.usage }); } catch { throw sandboxError("persistence"); }
      try { await move("completed"); } catch {
        return Object.freeze({ data, outcome: "completed-persistence-pending", jobPersistencePending: true, job: projectPersistentJob(job) });
      }
      terminalStatus = "completed";
      try { await move("archived"); } catch {
        return Object.freeze({ data, outcome: "archive-persistence-pending", jobPersistencePending: true, job: projectPersistentJob(job) });
      }
      return Object.freeze({ data, outcome: terminalStatus, job: projectPersistentJob(job) });
    } catch (caught) {
      const error = sandboxError(caught?.code || "request");
      if (ticket?.state === "open") {
        try { await usageManager.settle(ticket, { status: "failed", errorCode: error.code }); } catch { error.usageSettlementPending = true; }
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
        } catch { error.jobPersistencePending = true; }
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
  PROVIDER_ENDPOINTS,
  MAX_PROMPT_BYTES,
  MAX_SCHEMA_BYTES,
  createAIProviderSandbox,
  createAIProviderSandboxTransport,
  normalizeSandboxInput,
  normalizeModel,
  sandboxError
};
