"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildAIReadModel } = require("../src/apps/ai-steward/model");
const { createVerifiedEntitlementAdapter } = require("../src/services/ai-entitlement");

test("AI Steward remains visible but all capabilities are disabled while locked", () => {
  const model = buildAIReadModel({ interactiveEnabled: true });
  assert.equal(model.status, "locked");
  assert.equal(model.locked, true);
  assert.equal(model.interactive, false);
  assert.equal(model.features.length > 0, true);
  assert.equal(model.features.every((feature) => feature.enabled === false), true);
  assert.deepEqual(model.providers, [
    { id: "openai", status: "not-configured" },
    { id: "deepseek", status: "not-configured" }
  ]);
});

test("caller-forged entitlement data cannot enable AI Steward", () => {
  const model = buildAIReadModel({
    entitlement: {
      status: "active",
      verified: true,
      source: "verified-adapter",
      features: ["*"]
    },
    interactiveEnabled: true
  });
  assert.equal(model.locked, true);
  assert.equal(model.interactive, false);
});

test("a verified adapter can project access without exposing its signed envelope", async () => {
  const envelope = "private-signed-entitlement";
  const entitlement = await createVerifiedEntitlementAdapter(async (received) => {
    assert.equal(received, envelope);
    return {
      status: "trial",
      features: ["assistant", "classify"],
      trialRemaining: 3,
      subject: "private-subject",
      signedPayload: envelope
    };
  }).resolve(envelope, { nowMs: Date.parse("2026-08-12T00:00:00.000Z") });
  const model = buildAIReadModel({ entitlement, interactiveEnabled: true });
  assert.equal(model.status, "trial");
  assert.equal(model.locked, false);
  assert.equal(model.interactive, true);
  assert.equal(model.trialRemaining, 3);
  assert.equal(model.features.find((feature) => feature.id === "assistant").enabled, true);
  assert.equal(model.features.find((feature) => feature.id === "card-library").enabled, false);
  assert.equal(JSON.stringify(model).includes(envelope), false);
  assert.equal(JSON.stringify(model).includes("private-subject"), false);
});

test("provider and task projections discard private and unknown runtime fields", () => {
  const model = buildAIReadModel({
    providers: [
      { id: "openai", status: "ready", apiKey: "private-key" },
      { id: "evil-provider", status: "ready" }
    ],
    jobs: [{
      id: "job-1",
      status: "running",
      providerId: "openai",
      featureId: "assistant",
      prompt: "private health prompt",
      output: "private model output",
      apiKey: "private-key"
    }]
  });
  assert.equal(model.providers[0].status, "ready");
  assert.equal(model.providers.some((provider) => provider.id === "evil-provider"), false);
  assert.equal(model.totals.activeJobs, 1);
  assert.equal(JSON.stringify(model).includes("private"), false);
  assert.deepEqual(Object.keys(model.jobs[0]), [
    "status", "providerId", "featureId", "attempt", "errorCode"
  ]);
});

test("recovery projection stays available while locked and strips snapshots and tokens", () => {
  const model = buildAIReadModel({
    recoveryReports: [{
      id: "journal-1",
      status: "applying",
      action: "rollback-safe",
      updatedAt: "2026-08-14T10:00:00.000Z",
      token: { private: true },
      beforeContent: "private original",
      operations: [{
        id: "one",
        kind: "update",
        path: "MagicOS/Records/Memory/a.md",
        observed: "applied",
        afterContent: "private generated result"
      }]
    }]
  });
  assert.equal(model.locked, true);
  assert.equal(model.recovery.reports.length, 1);
  assert.equal(model.recovery.reports[0].action, "rollback-safe");
  assert.equal(model.totals.recovery, 1);
  assert.equal(JSON.stringify(model).includes("private original"), false);
  assert.equal(JSON.stringify(model).includes("private generated result"), false);
  assert.equal(JSON.stringify(model).includes('"token"'), false);
});

test("unknown recovery states fail toward manual review", () => {
  const model = buildAIReadModel({
    recoveryReports: [{
      id: "journal-unknown",
      action: "caller-defined-action",
      operations: [{ path: "MagicOS/Records/Memory/a.md", observed: "unknown" }]
    }]
  });
  assert.equal(model.recovery.reports[0].action, "manual-review");
  assert.equal(model.recovery.reports[0].operations[0].observed, "conflict");
  assert.equal(model.recovery.manualReview, 1);
});
