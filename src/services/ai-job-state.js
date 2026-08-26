"use strict";

const { normalizeFeatureId } = require("./ai-entitlement");

const ERROR_CODES = new Set([
  "application-failed", "auth", "cancelled", "confirmation-expired", "confirmation-required",
  "confirmation-used", "conflict", "disabled", "entitlement-verification", "feature-not-entitled", "http",
  "incomplete", "invalid-json", "locked", "missing-output", "network", "persistence", "provider",
  "provider-not-ready", "provider-origin", "provider-url", "quota", "rate-limit", "refusal",
  "request", "request-in-progress", "response-too-large", "rollback-failed", "simulation-only",
  "timeout", "transport-unsupported", "trial-ended", "validation", "journal-corrupt",
  "journal-inspection", "journal-persistence", "recovery-conflict", "recovery-stale"
]);

const TRANSITIONS = Object.freeze({
  queued: Object.freeze(["running", "cancelled"]),
  running: Object.freeze(["response-received", "failed", "timed-out", "cancelled"]),
  "response-received": Object.freeze(["validating", "failed"]),
  validating: Object.freeze(["ready", "invalid", "failed"]),
  ready: Object.freeze(["applying", "completed", "failed", "archived"]),
  applying: Object.freeze(["applied", "failed", "rollback-required"]),
  "rollback-required": Object.freeze(["rolled-back", "rollback-failed"]),
  failed: Object.freeze(["queued", "archived"]),
  "timed-out": Object.freeze(["queued", "archived"]),
  invalid: Object.freeze(["queued", "archived"]),
  cancelled: Object.freeze(["queued", "archived"]),
  completed: Object.freeze(["archived"]),
  applied: Object.freeze(["archived"]),
  "rolled-back": Object.freeze(["archived"]),
  "rollback-failed": Object.freeze(["rollback-required", "archived"]),
  archived: Object.freeze([])
});

function canTransition(from, to) {
  return Boolean(TRANSITIONS[String(from || "")]?.includes(String(to || "")));
}

function normalizeErrorCode(value, fallback = "request") {
  const code = String(value || "").trim().toLowerCase();
  return ERROR_CODES.has(code) ? code : ERROR_CODES.has(fallback) ? fallback : "request";
}

function safeOpaqueId(value, maxLength = 200) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9._:-]+$/.test(id) ? id.slice(0, maxLength) : "";
}

function safeISODate(value) {
  const text = String(value || "");
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

function transitionJob(job = {}, to, detail = {}) {
  const from = String(job.status || "queued");
  const target = String(to || "");
  if (!canTransition(from, target)) throw new Error(`Invalid AI job transition: ${from} -> ${target}`);
  const next = {
    ...job,
    status: target,
    updatedAt: String(detail.updatedAt || new Date().toISOString()),
    errorCode: ["failed", "timed-out", "invalid", "rollback-failed"].includes(target)
      ? normalizeErrorCode(detail.errorCode, target === "timed-out" ? "timeout" : target === "rollback-failed" ? "rollback-failed" : "request")
      : ""
  };
  if (Object.prototype.hasOwnProperty.call(detail, "requestId")) next.requestId = safeOpaqueId(detail.requestId);
  return Object.freeze(next);
}

function projectPersistentJob(job = {}) {
  const status = Object.prototype.hasOwnProperty.call(TRANSITIONS, String(job.status || "")) ? String(job.status) : "queued";
  const safe = {
    id: safeOpaqueId(job.id, 120),
    status,
    providerId: ["openai", "deepseek"].includes(String(job.providerId || "")) ? String(job.providerId) : "unknown",
    featureId: normalizeFeatureId(job.featureId),
    requestId: safeOpaqueId(job.requestId),
    attempt: Math.max(0, Math.min(20, Math.floor(Number(job.attempt) || 0))),
    createdAt: safeISODate(job.createdAt),
    updatedAt: safeISODate(job.updatedAt),
    errorCode: job.errorCode ? normalizeErrorCode(job.errorCode) : ""
  };
  return Object.freeze(safe);
}

module.exports = { ERROR_CODES, TRANSITIONS, canTransition, normalizeErrorCode, projectPersistentJob, transitionJob };
