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
const RECOVERY_ACTIONS = new Set(["abandon-safe", "rollback-safe", "completed", "manual-review"]);
const RECOVERY_OBSERVATIONS = new Set(["original", "applied", "conflict"]);

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

function normalizeRecoveryReports(value) {
  return Object.freeze((Array.isArray(value) ? value : []).slice(0, 100).map((report) => {
    const action = RECOVERY_ACTIONS.has(String(report?.action || "")) ? String(report.action) : "manual-review";
    const operations = Object.freeze((Array.isArray(report?.operations) ? report.operations : []).slice(0, 100).map((operation) => Object.freeze({
      id: String(operation?.id || "").slice(0, 160),
      kind: ["create", "update"].includes(String(operation?.kind || "")) ? String(operation.kind) : "update",
      path: String(operation?.path || "").slice(0, 500),
      observed: RECOVERY_OBSERVATIONS.has(String(operation?.observed || "")) ? String(operation.observed) : "conflict"
    })));
    return Object.freeze({
      id: String(report?.id || "").slice(0, 160),
      status: String(report?.status || "").slice(0, 40),
      action,
      updatedAt: String(report?.updatedAt || "").slice(0, 40),
      operations
    });
  }));
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
  const recoveryReports = normalizeRecoveryReports(input.recoveryReports);
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
    recovery: Object.freeze({
      unavailable: input.recoveryUnavailable === true,
      reports: recoveryReports,
      manualReview: recoveryReports.filter((report) => report.action === "manual-review").length
    }),
    totals: Object.freeze({
      providersReady: providers.filter((item) => item.status === "ready").length,
      activeJobs: jobs.filter((item) => ACTIVE_JOB_STATUSES.has(item.status)).length,
      retainedJobs: jobs.length,
      recovery: recoveryReports.length
    })
  });
}

module.exports = {
  ACTIVE_JOB_STATUSES,
  DISPLAY_FEATURES,
  PROVIDER_IDS,
  PROVIDER_STATUSES,
  RECOVERY_ACTIONS,
  RECOVERY_OBSERVATIONS,
  buildAIReadModel,
  normalizeJobs,
  normalizeRecoveryReports,
  providerStateById
};
