"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createVerifiedEntitlementAdapter,
  evaluateAccess,
  nonNegativeInteger,
  normalizeEntitlement,
  normalizeFeatureId
} = require("../src/services/ai-entitlement");

const nowMs = Date.parse("2026-08-12T00:00:00.000Z");

test("production entitlements fail closed for local or unverified claims", () => {
  const snapshot = normalizeEntitlement({
    status: "active",
    features: ["*"],
    subject: "private-user-id"
  }, { mode: "production", source: "development-simulator", nowMs });
  assert.equal(snapshot.status, "locked");
  assert.equal(snapshot.verified, false);
  assert.equal(snapshot.subject, "");
  assert.deepEqual(snapshot.features, []);
  assert.equal(evaluateAccess({ snapshot, featureId: "assistant" }).allowed, false);
});

test("missing mode defaults to production lock, not development access", () => {
  const snapshot = normalizeEntitlement({ status: "development", features: ["*"] }, { nowMs });
  assert.equal(snapshot.status, "locked");
  assert.equal(evaluateAccess({ snapshot, featureId: "assistant" }).allowed, false);
});

test("verified production claims use signed feature and trial values only", async () => {
  const adapter = createVerifiedEntitlementAdapter(async () => ({
    status: "trial",
    features: ["CARD-LIBRARY", "unknown-paid-feature"],
    trialRemaining: 2,
    payload: "must-not-survive-normalization"
  }));
  const snapshot = await adapter.resolve("signed-envelope", { nowMs });
  assert.equal(snapshot.status, "trial");
  assert.equal(snapshot.trialRemaining, 2);
  assert.deepEqual(snapshot.features, ["card-library"]);
  assert.equal("payload" in snapshot, false);
  assert.equal(evaluateAccess({ snapshot, featureId: "card-library" }).allowed, true);
  assert.equal(evaluateAccess({ snapshot, featureId: "card-library", trialRemaining: 9999, trialReserved: 2 }).allowed, false);
  assert.equal(evaluateAccess({ snapshot, featureId: "assistant" }).allowed, false);
});

test("access evaluation rejects caller-forged entitlement snapshots", () => {
  const access = evaluateAccess({
    snapshot: {
      status: "active",
      verified: true,
      verification: "signature",
      source: "verified-adapter",
      features: ["*"]
    },
    featureId: "assistant"
  });
  assert.equal(access.allowed, false);
  assert.equal(access.status, "locked");
});

test("unknown feature ids fail closed even when a verified claim has wildcard access", async () => {
  const snapshot = await createVerifiedEntitlementAdapter(async () => ({
    status: "active",
    features: ["*"]
  })).resolve("signed-envelope", { nowMs });
  assert.equal(normalizeFeatureId("renamed-ui-label"), "invalid-feature");
  const access = evaluateAccess({ snapshot, featureId: "renamed-ui-label" });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, "feature-not-entitled");
});

test("expiry, grace, malformed timestamps, and disabled state are enforced", async () => {
  const claim = {
    status: "active",
    features: ["assistant"],
    expiresAt: "2026-08-11T00:00:00.000Z",
    graceUntil: "2026-08-13T00:00:00.000Z"
  };
  const grace = await createVerifiedEntitlementAdapter(async () => claim).resolve("signed-envelope", { nowMs });
  assert.equal(grace.status, "grace");
  assert.equal(evaluateAccess({ snapshot: grace, featureId: "assistant" }).allowed, true);
  assert.equal(evaluateAccess({ snapshot: grace, featureId: "assistant", enabled: false }).reason, "disabled");

  const malformed = await createVerifiedEntitlementAdapter(async () => ({
    ...claim,
    expiresAt: "not-a-date"
  })).resolve("signed-envelope", { nowMs });
  assert.equal(malformed.status, "locked");
});

test("production cannot be unlocked by copying verified-looking JSON fields", async () => {
  const forged = normalizeEntitlement({
    status: "active",
    verified: true,
    verification: "signature",
    features: ["*"]
  }, { mode: "production", source: "verified-adapter", nowMs });
  assert.equal(forged.status, "locked");
  assert.equal(forged.verified, false);

  const adapter = createVerifiedEntitlementAdapter(async () => null);
  await assert.rejects(adapter.resolve("bad-envelope", { nowMs }), (error) => (
    error.code === "entitlement-verification"
  ));
});

test("numeric normalization rejects NaN and Infinity", () => {
  assert.equal(nonNegativeInteger(NaN, 4), 4);
  assert.equal(nonNegativeInteger(Infinity, 3), 3);
  assert.equal(nonNegativeInteger(-7), 0);
  assert.equal(nonNegativeInteger("5.9"), 5);
});
