"use strict";

const ENTITLEMENT_STATUSES = new Set(["locked", "trial", "active", "grace", "development"]);
const NORMALIZED_ENTITLEMENTS = new WeakSet();
const VERIFIED_ADAPTER_TOKEN = Symbol("verified-entitlement-adapter");
const FEATURE_IDS = new Set([
  "assistant",
  "classify",
  "existing-files",
  "web-archive",
  "knowledge",
  "skill-runtime",
  "action-closure",
  "global-navigation",
  "native-runtime",
  "learning-generation",
  "card-library"
]);

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : Math.max(0, Math.floor(Number(fallback) || 0));
}

function normalizeFeatureId(value) {
  const id = String(value || "").trim().toLowerCase();
  if (!id) return "assistant";
  return FEATURE_IDS.has(id) ? id : "invalid-feature";
}

function normalizeEntitlement(raw = {}, options = {}) {
  // Missing or misspelled configuration is production, never a paid-feature bypass.
  const mode = options.mode === "development" ? "development" : "production";
  const adapterVerified = options[VERIFIED_ADAPTER_TOKEN] === true;
  const source = adapterVerified ? "verified-adapter" : mode === "development" ? "development-simulator" : "unverified";
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  let status = ENTITLEMENT_STATUSES.has(String(raw.status || "")) ? String(raw.status) : "locked";
  const expiresAt = String(raw.expiresAt || raw.expires_at || "");
  const graceUntil = String(raw.graceUntil || raw.grace_until || "");
  const expiresTime = expiresAt ? Date.parse(expiresAt) : NaN;
  const graceTime = graceUntil ? Date.parse(graceUntil) : NaN;
  const verified = adapterVerified;

  // A malformed signed timestamp must never turn into an unlimited entitlement.
  if (expiresAt && !Number.isFinite(expiresTime)) status = "locked";

  if (["active", "trial"].includes(status) && Number.isFinite(expiresTime) && expiresTime <= nowMs) {
    status = Number.isFinite(graceTime) && graceTime > nowMs ? "grace" : "locked";
  }
  if (status === "grace" && (!Number.isFinite(graceTime) || graceTime <= nowMs)) status = "locked";
  if (mode === "production" && (!verified || status === "development")) status = "locked";

  const declaredFeatures = Array.isArray(raw.features)
    ? [...new Set(raw.features
      .map((feature) => String(feature || "").trim().toLowerCase())
      .filter((feature) => feature === "*" || FEATURE_IDS.has(feature)))].slice(0, 40)
    : [];
  const features = mode === "production" && !verified ? [] : declaredFeatures;
  const trialRemaining = mode === "production" && verified
    ? nonNegativeInteger(raw.trialRemaining ?? raw.trial_remaining)
    : mode === "production" ? 0 : nonNegativeInteger(options.trialRemaining);
  const publicExpiresAt = mode === "production" && !verified ? "" : expiresAt;
  const publicGraceUntil = mode === "production" && !verified ? "" : graceUntil;
  const snapshot = Object.freeze({
    status,
    verified,
    verification: verified ? "signature" : source === "development-simulator" ? "development-simulator" : "",
    source,
    sourceLabel: mode === "production" && !verified ? "" : String(raw.sourceLabel || raw.source_label || "").slice(0, 120),
    // Subject is verified inside the private adapter but never enters public runtime state.
    subject: "",
    features: Object.freeze(features.length ? features : mode === "development" ? ["*"] : []),
    expiresAt: publicExpiresAt,
    graceUntil: publicGraceUntil,
    checkedAt: new Date(nowMs).toISOString(),
    trialRemaining
  });
  NORMALIZED_ENTITLEMENTS.add(snapshot);
  return snapshot;
}

function createVerifiedEntitlementAdapter(verify) {
  if (typeof verify !== "function") throw new TypeError("Entitlement adapter requires a verification function");
  return Object.freeze({
    async resolve(envelope, options = {}) {
      const claims = await verify(envelope, Object.freeze({ nowMs: options.nowMs }));
      if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
        const error = new Error("Entitlement verifier returned invalid claims");
        error.code = "entitlement-verification";
        throw error;
      }
      return normalizeEntitlement(claims, {
        mode: "production",
        nowMs: options.nowMs,
        [VERIFIED_ADAPTER_TOKEN]: true
      });
    }
  });
}

function evaluateAccess(options = {}) {
  const snapshot = NORMALIZED_ENTITLEMENTS.has(options.snapshot)
    ? options.snapshot
    : normalizeEntitlement({}, { mode: options.mode });
  const featureId = normalizeFeatureId(options.featureId);
  const trialReserved = nonNegativeInteger(options.trialReserved);
  const suppliedTrialRemaining = snapshot.verified ? snapshot.trialRemaining : options.trialRemaining;
  const trialRemaining = Math.max(0, nonNegativeInteger(suppliedTrialRemaining, snapshot.trialRemaining) - trialReserved);
  if (options.enabled === false) return Object.freeze({ ...snapshot, allowed: false, status: "locked", reason: "disabled", featureId, trialRemaining, trialReserved });
  const features = Array.isArray(snapshot.features) ? snapshot.features : [];
  const featureAllowed = featureId !== "invalid-feature" && (features.includes("*") || features.includes(featureId));
  const statusAllowed = ["active", "grace", "development"].includes(snapshot.status)
    || (snapshot.status === "trial" && trialRemaining > 0);
  return Object.freeze({
    ...snapshot,
    allowed: statusAllowed && featureAllowed,
    reason: !featureAllowed ? "feature-not-entitled" : statusAllowed ? "" : snapshot.status === "trial" ? "trial-ended" : "locked",
    featureId,
    trialRemaining,
    trialReserved
  });
}

module.exports = {
  ENTITLEMENT_STATUSES,
  FEATURE_IDS,
  createVerifiedEntitlementAdapter,
  evaluateAccess,
  nonNegativeInteger,
  normalizeEntitlement,
  normalizeFeatureId
};
