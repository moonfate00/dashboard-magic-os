"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeSettings } = require("../src/config/settings-schema");
const {
  assertPublicUpgradeData,
  LOCAL_STATE_KEYS,
  publicUpgradeSnapshot
} = require("../src/privacy/data-boundary");
const { PUBLIC_UPGRADE_REGISTRY, upgradePlan } = require("../src/upgrades/registry");
const { auditPrivacyBoundary } = require("../scripts/audit-privacy");

test("plugin local state is an explicit allowlist", () => {
  const settings = normalizeSettings({
    interfaceLanguage: "en",
    apiKey: "private",
    records: [{ title: "private" }],
    healthRecords: [{ title: "private" }],
    usageLedger: { tokens: 99 }
  });
  assert.deepEqual(Object.keys(settings).sort(), [...LOCAL_STATE_KEYS].sort());
  assert.equal("apiKey" in settings, false);
  assert.equal("records" in settings, false);
  assert.equal("healthRecords" in settings, false);
  assert.equal("usageLedger" in settings, false);
});

test("public upgrade metadata rejects private records, secrets, and user paths", () => {
  assert.throws(() => assertPublicUpgradeData({ person: { name: "Private" } }), /private runtime data/);
  assert.throws(() => assertPublicUpgradeData({ apiKey: "secret" }), /private runtime data/);
  const syntheticUserPath = ["", "Users", "example", "Vault"].join("/");
  assert.throws(() => assertPublicUpgradeData({ sourcePath: syntheticUserPath }), /user-specific absolute path/);
  assert.doesNotThrow(() => assertPublicUpgradeData(PUBLIC_UPGRADE_REGISTRY));
});

test("upgrade plans are detached serializable snapshots", () => {
  const plan = upgradePlan(0, 1);
  assert.equal(plan.length, 1);
  plan[0].id = "changed-locally";
  assert.equal(PUBLIC_UPGRADE_REGISTRY[0].id, "storage-schema-v1");
  assert.deepEqual(publicUpgradeSnapshot(PUBLIC_UPGRADE_REGISTRY), PUBLIC_UPGRADE_REGISTRY);
});

test("repository privacy audit passes", () => {
  assert.deepEqual(auditPrivacyBoundary(), []);
});
