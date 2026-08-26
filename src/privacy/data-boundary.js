"use strict";

const DATA_CLASS = Object.freeze({
  VAULT_CONTENT: "vault-content",
  LOCAL_STATE: "local-state",
  PUBLIC_UPGRADE: "public-upgrade",
  SECRET_STATE: "secret-state"
});

const LOCAL_STATE_KEYS = Object.freeze([
  "interfaceLanguage",
  "storagePreference",
  "storageProfileId",
  "storageSetupCompleted",
  "storageSchemaVersion",
  "folderMounts"
]);

const FORBIDDEN_UPGRADE_KEYS = new Set([
  "apikey",
  "attachments",
  "body",
  "cache",
  "content",
  "diagnosis",
  "entitlement",
  "healthrecords",
  "journal",
  "ledger",
  "medicalrecords",
  "notes",
  "patient",
  "people",
  "person",
  "records",
  "secret",
  "snapshot",
  "token",
  "usageledger"
]);

function normalizedKey(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isAbsoluteUserPath(value) {
  const text = String(value || "");
  return /^\/(?:Users|home)\//i.test(text) || /^[A-Za-z]:\\Users\\/i.test(text);
}

function assertPublicUpgradeData(value, path = "upgrade") {
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new TypeError(`${path} must be serializable public metadata`);
  }
  if (typeof value === "string" && isAbsoluteUserPath(value)) {
    throw new TypeError(`${path} contains a user-specific absolute path`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPublicUpgradeData(item, `${path}[${index}]`));
    return value;
  }
  if (!value || typeof value !== "object") return value;
  Object.entries(value).forEach(([key, child]) => {
    if (FORBIDDEN_UPGRADE_KEYS.has(normalizedKey(key))) {
      throw new TypeError(`${path}.${key} is private runtime data, not public upgrade metadata`);
    }
    assertPublicUpgradeData(child, `${path}.${key}`);
  });
  return value;
}

function publicUpgradeSnapshot(value) {
  assertPublicUpgradeData(value);
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  DATA_CLASS,
  FORBIDDEN_UPGRADE_KEYS,
  LOCAL_STATE_KEYS,
  assertPublicUpgradeData,
  isAbsoluteUserPath,
  publicUpgradeSnapshot
};
