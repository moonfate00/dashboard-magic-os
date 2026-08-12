"use strict";

const { evaluateAccess, normalizeEntitlement, normalizeFeatureId, nonNegativeInteger } = require("../../services/ai-entitlement");
const { projectPersistentJob } = require("../../services/ai-job-state");

const PROVIDER_IDS = Object.freeze(["openai", "deepseek"]);
const PROVIDER_STATUSES = new Set(["not-configured", "ready", "cooldown", "blocked", "degraded"]);
const DISPLAY_FEATURES = Object.freeze([
  "assistant",
  "classify",
  "web-archive",
  "knowledge",
  "learning-generation",
  "card-library"
]);
const ACTIVE_JOB_STATUSES = new Set(["queued", "running", "response-received", "validating", "applying", "rollback-required"]);

function providerStateById(value) {
  const input = Array.isArray(value) ? value : [];
  const byId = new Map(input.map((item) => [String(item?.id || "").toLowerCase(), item]));
  return PROVIDER_IDS.map((id) => {
    const item = byId.get(id) || {};
    const status = PROVIDER_STATUSES.has(String(item.status || "")) ? String(item.status) : "not-configured";
    return Object.freeze({ id, status });
  });
}

function normalizeJobs(value) {
  return Object.freeze((Array.isArray(value) ? value : [])
    .slice(0, 40)
    .map(projectPersistentJob)
    .map((job) => Object.freeze({
      status: job.status,
      providerId: job.providerId,
      featureId: job.featureId,
      attempt: job.attempt,
      errorCode: job.errorCode
    })));
}

function buildAIReadModel(input = {}) {
  const entitlement = input.entitlement || normalizeEntitlement({}, { mode: "production" });
  const access = evaluateAccess({
    snapshot: entitlement,
    featureId: "assistant",
    enabled: input.enabled !== false,
    trialReserved: input.trialReserved
  });
  const jobs = normalizeJobs(input.jobs);
  const providers = Object.freeze(providerStateById(input.providers));
  const interactive = access.allowed && input.interactiveEnabled === true;
  const features = Object.freeze(DISPLAY_FEATURES.map((featureId) => Object.freeze({
    id: normalizeFeatureId(featureId),
    entitled: evaluateAccess({ snapshot: entitlement, featureId }).allowed,
    enabled: interactive && evaluateAccess({ snapshot: entitlement, featureId }).allowed
  })));
  return Object.freeze({
    status: access.status,
    reason: access.reason,
    verified: access.verified === true,
    locked: !access.allowed,
    interactive,
    trialRemaining: access.status === "trial" ? nonNegativeInteger(access.trialRemaining) : null,
    providers,
    features,
    jobs,
    totals: Object.freeze({
      providersReady: providers.filter((item) => item.status === "ready").length,
      activeJobs: jobs.filter((item) => ACTIVE_JOB_STATUSES.has(item.status)).length,
      retainedJobs: jobs.length
    })
  });
}

module.exports = {
  ACTIVE_JOB_STATUSES,
  DISPLAY_FEATURES,
  PROVIDER_IDS,
  PROVIDER_STATUSES,
  buildAIReadModel,
  normalizeJobs,
  providerStateById
};
