"use strict";

const { createVerifiedEntitlementAdapter, normalizeEntitlement } = require("./ai-entitlement");
const { projectPersistentJob } = require("./ai-job-state");

const PROVIDER_SECRET_IDS = Object.freeze({
  openai: "dashboard-magic-os-openai-api-key",
  deepseek: "dashboard-magic-os-deepseek-api-key"
});

function containsSecret(value, secret, seen = new WeakSet(), depth = 0) {
  if (typeof value === "string") return value.includes(secret);
  if (["function", "symbol", "bigint"].includes(typeof value)) return true;
  if (!value || typeof value !== "object") return false;
  if (depth > 8 || seen.has(value)) return true;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return true;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsSecret(item, secret, seen, depth + 1));
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Object.entries(descriptors).slice(0, 200).some(([key, descriptor]) => (
    typeof descriptor.get === "function"
    || typeof descriptor.set === "function"
    || containsSecret(key, secret, seen, depth + 1)
    || containsSecret(descriptor.value, secret, seen, depth + 1)
  ));
}

function createLockedAIRuntimeAdapter() {
  return Object.freeze({
    async status() {
      return Object.freeze({
        entitlement: normalizeEntitlement({}, { mode: "production" }),
        interactiveEnabled: false,
        providers: Object.freeze([]),
        jobs: Object.freeze([])
      });
    }
  });
}

function createSecretStorageCapabilities(secretStorage) {
  const validSecretIds = new Set(Object.values(PROVIDER_SECRET_IDS));
  const resolveSecretId = (value) => {
    const id = String(value || "");
    if (!validSecretIds.has(id)) {
      const error = new Error("Unknown secret identifier");
      error.code = "secret-id";
      throw error;
    }
    return id;
  };
  return Object.freeze({
    available: typeof secretStorage?.getSecret === "function",
    async has(secretId) {
      if (typeof secretStorage?.getSecret !== "function") return false;
      const value = await secretStorage.getSecret(resolveSecretId(secretId));
      return typeof value === "string" && value.trim().length > 0;
    },
    async withSecret(secretId, operation) {
      if (typeof operation !== "function") throw new TypeError("Secret operation must be a function");
      if (typeof secretStorage?.getSecret !== "function") {
        const error = new Error("SecretStorage is unavailable");
        error.code = "secret-storage-unavailable";
        throw error;
      }
      const secret = String(await secretStorage.getSecret(resolveSecretId(secretId)) || "").trim();
      if (!secret) {
        const error = new Error("Provider secret is not configured");
        error.code = "secret-not-configured";
        throw error;
      }
      let result;
      try {
        result = await operation(secret);
      } catch (operationError) {
        const error = new Error("Secret-scoped operation failed");
        const operationCode = String(operationError?.code || "").toLowerCase();
        error.code = ["auth", "cancelled", "http", "network", "provider", "quota", "rate-limit", "request", "timeout", "validation"]
          .includes(operationCode) ? operationCode : "request";
        throw error;
      }
      if (containsSecret(result, secret)) {
        const error = new Error("Secret-scoped operation returned unsafe data");
        error.code = "secret-escape";
        throw error;
      }
      return result;
    }
  });
}

function normalizeRuntimeJob(job) {
  const projected = projectPersistentJob(job);
  return Object.freeze({
    status: projected.status,
    providerId: projected.providerId,
    featureId: projected.featureId,
    attempt: projected.attempt,
    errorCode: projected.errorCode
  });
}

function createPrivateAIRuntimeAdapter(options = {}) {
  if (typeof options.verifyEntitlement !== "function") {
    throw new TypeError("Private AI runtime requires an entitlement verifier");
  }
  const entitlementAdapter = createVerifiedEntitlementAdapter(options.verifyEntitlement);
  const secrets = options.secrets;
  if (!secrets || typeof secrets.has !== "function" || typeof secrets.withSecret !== "function") {
    throw new TypeError("Private AI runtime requires secret capabilities");
  }
  const loadEnvelope = typeof options.loadEntitlementEnvelope === "function"
    ? options.loadEntitlementEnvelope
    : async () => null;
  const loadJobs = typeof options.loadJobs === "function" ? options.loadJobs : async () => [];
  const providerSecretIds = PROVIDER_SECRET_IDS;

  async function status(statusOptions = {}) {
    let entitlement = normalizeEntitlement({}, { mode: "production", nowMs: statusOptions.nowMs });
    let verificationError = "";
    try {
      const envelope = await loadEnvelope();
      if (envelope) entitlement = await entitlementAdapter.resolve(envelope, { nowMs: statusOptions.nowMs });
    } catch (error) {
      verificationError = "entitlement-verification";
    }
    const providers = await Promise.all(Object.keys(PROVIDER_SECRET_IDS).map(async (id) => {
      let configured = false;
      try { configured = await secrets.has(providerSecretIds[id]); } catch { configured = false; }
      return Object.freeze({ id, status: configured ? "ready" : "not-configured" });
    }));
    let jobs = [];
    try {
      const loaded = await loadJobs();
      jobs = (Array.isArray(loaded) ? loaded : []).slice(0, 40).map(normalizeRuntimeJob);
    } catch (error) {
      jobs = [];
    }
    return Object.freeze({
      entitlement,
      interactiveEnabled: false,
      verificationError,
      providers: Object.freeze(providers),
      jobs: Object.freeze(jobs)
    });
  }

  async function withProviderSecret(providerId, operation) {
    const id = String(providerId || "").toLowerCase();
    const secretId = providerSecretIds[id];
    if (!Object.hasOwn(PROVIDER_SECRET_IDS, id) || !secretId) {
      const error = new Error("Unknown AI provider");
      error.code = "provider";
      throw error;
    }
    return secrets.withSecret(secretId, operation);
  }

  return Object.freeze({ status, withProviderSecret });
}

module.exports = {
  PROVIDER_SECRET_IDS,
  containsSecret,
  createLockedAIRuntimeAdapter,
  createPrivateAIRuntimeAdapter,
  createSecretStorageCapabilities,
  normalizeRuntimeJob
};
