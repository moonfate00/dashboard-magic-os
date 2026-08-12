"use strict";

const { STORAGE_SCHEMA_VERSION } = require("../storage/profiles");
const { assertPublicUpgradeData, publicUpgradeSnapshot } = require("../privacy/data-boundary");

const PUBLIC_UPGRADE_REGISTRY = Object.freeze([
  Object.freeze({
    id: "storage-schema-v1",
    targetSchemaVersion: 1,
    operations: Object.freeze([
      Object.freeze({ type: "ensure-profile-directories", profile: "active" })
    ])
  })
]);

assertPublicUpgradeData(PUBLIC_UPGRADE_REGISTRY);

function upgradePlan(fromSchemaVersion = 0, toSchemaVersion = STORAGE_SCHEMA_VERSION) {
  const from = Math.max(0, Number(fromSchemaVersion || 0));
  const to = Math.max(from, Number(toSchemaVersion || STORAGE_SCHEMA_VERSION));
  return publicUpgradeSnapshot(PUBLIC_UPGRADE_REGISTRY.filter((entry) => (
    entry.targetSchemaVersion > from && entry.targetSchemaVersion <= to
  )));
}

module.exports = {
  PUBLIC_UPGRADE_REGISTRY,
  upgradePlan
};
