"use strict";

const { normalizeLanguagePreference } = require("../i18n");
const { isAbsoluteUserPath } = require("../privacy/data-boundary");
const { normalizeStoragePreference } = require("../storage/profiles");

const PERSONALIZATION_FORMAT = "dashboard-magic-os-personalization";
const PERSONALIZATION_VERSION = 1;
const PERSONALIZATION_KEYS = Object.freeze(["interfaceLanguage", "storagePreference"]);
const MAX_PERSONALIZATION_BYTES = 64 * 1024;
const BLOCKED_KEYS = new Set([
  "apikey", "attachment", "body", "cache", "claim", "contact", "content", "credential",
  "diagnosis", "entitlement", "health", "history", "job", "journal", "ledger", "medical",
  "note", "output", "path", "patient", "people", "person", "prompt", "record", "secret",
  "snapshot", "subject", "token", "usage", "vault"
]);

class PersonalizationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PersonalizationError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new PersonalizationError(code, message);
}

function byteLength(value) {
  return typeof Buffer !== "undefined" ? Buffer.byteLength(value, "utf8") : new TextEncoder().encode(value).length;
}

function normalizedKey(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function assertPlainData(value, path = "package", seen = new WeakSet(), depth = 0) {
  if (value === null || ["string", "boolean"].includes(typeof value)) {
    if (typeof value === "string" && isAbsoluteUserPath(value)) fail("private-data", "Personalization package contains a user path");
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (!value || typeof value !== "object" || depth > 8 || seen.has(value)) {
    fail("validation", `Personalization ${path} is not plain serializable data`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    fail("validation", `Personalization ${path} is not a plain object`);
  }
  seen.add(value);
  Object.entries(Object.getOwnPropertyDescriptors(value)).forEach(([key, descriptor]) => {
    if (typeof descriptor.get === "function" || typeof descriptor.set === "function") {
      fail("validation", `Personalization ${path} contains an accessor`);
    }
    if (BLOCKED_KEYS.has(normalizedKey(key))) fail("private-data", "Personalization package contains private runtime data");
    assertPlainData(descriptor.value, `${path}.${key}`, seen, depth + 1);
  });
}

function exactKeys(value, allowed, path) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) fail("validation", `Personalization ${path} contains unsupported fields`);
}

function normalizePreferences(value = {}) {
  exactKeys(value, PERSONALIZATION_KEYS, "preferences");
  PERSONALIZATION_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(value, key)) fail("validation", "Personalization preferences are incomplete");
  });
  const rawLanguage = String(value.interfaceLanguage || "").trim().replace(/_/g, "-").toLowerCase();
  const rawStorage = String(value.storagePreference || "").trim().toLowerCase();
  if (!(rawLanguage === "auto" || rawLanguage === "zh" || rawLanguage.startsWith("zh-cn")
    || rawLanguage.startsWith("zh-hans") || rawLanguage === "en" || rawLanguage.startsWith("en-"))) {
    fail("validation", "Personalization language preference is unsupported");
  }
  if (!["auto", "portable", "legacy-dashboard"].includes(rawStorage)) {
    fail("validation", "Personalization storage preference is unsupported");
  }
  return Object.freeze({
    interfaceLanguage: normalizeLanguagePreference(value.interfaceLanguage),
    storagePreference: normalizeStoragePreference(value.storagePreference)
  });
}

function buildPersonalizationPackage(settings = {}, options = {}) {
  const now = typeof options.now === "function" ? options.now() : new Date();
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) fail("validation", "Personalization export date is invalid");
  return Object.freeze({
    format: PERSONALIZATION_FORMAT,
    version: PERSONALIZATION_VERSION,
    exportedAt: date.toISOString(),
    preferences: normalizePreferences({
      interfaceLanguage: settings.interfaceLanguage ?? "auto",
      storagePreference: settings.storagePreference ?? "auto"
    })
  });
}

function serializePersonalization(settings = {}, options = {}) {
  return `${JSON.stringify(buildPersonalizationPackage(settings, options), null, 2)}\n`;
}

function migratePackage(candidate) {
  const version = Number(candidate.version);
  if (version === 0) {
    exactKeys(candidate, ["format", "version", "language", "storage"], "v0 package");
    return {
      format: candidate.format,
      version: PERSONALIZATION_VERSION,
      exportedAt: "",
      preferences: {
        interfaceLanguage: candidate.language,
        storagePreference: candidate.storage
      },
      sourceVersion: 0
    };
  }
  if (version !== PERSONALIZATION_VERSION) fail("version", "Unsupported personalization package version");
  exactKeys(candidate, ["format", "version", "exportedAt", "preferences"], "package");
  return { ...candidate, sourceVersion: version };
}

function parsePersonalization(input) {
  let candidate = input;
  if (typeof input === "string") {
    if (byteLength(input) > MAX_PERSONALIZATION_BYTES) fail("size", "Personalization package exceeds the size limit");
    try { candidate = JSON.parse(input); } catch { fail("json", "Personalization package is not valid JSON"); }
  }
  assertPlainData(candidate);
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) fail("validation", "Personalization package must be an object");
  const migrated = migratePackage(candidate);
  if (migrated.format !== PERSONALIZATION_FORMAT) fail("format", "This is not a Dashboard Magic OS personalization package");
  if (migrated.exportedAt && !Number.isFinite(Date.parse(migrated.exportedAt))) fail("validation", "Personalization export date is invalid");
  return Object.freeze({
    format: PERSONALIZATION_FORMAT,
    version: PERSONALIZATION_VERSION,
    sourceVersion: migrated.sourceVersion,
    exportedAt: String(migrated.exportedAt || ""),
    preferences: normalizePreferences(migrated.preferences)
  });
}

function createPersonalizationService() {
  const confirmations = new WeakMap();

  function prepare(input, currentSettings = {}) {
    const imported = parsePersonalization(input);
    const current = normalizePreferences({
      interfaceLanguage: currentSettings.interfaceLanguage ?? "auto",
      storagePreference: currentSettings.storagePreference ?? "auto"
    });
    const changes = PERSONALIZATION_KEYS
      .filter((key) => current[key] !== imported.preferences[key])
      .map((key) => Object.freeze({ key, before: current[key], after: imported.preferences[key] }));
    const preview = Object.freeze({
      version: imported.version,
      sourceVersion: imported.sourceVersion,
      exportedAt: imported.exportedAt,
      preferences: imported.preferences,
      changes: Object.freeze(changes)
    });
    const confirmation = Object.freeze({ changes: changes.length });
    confirmations.set(confirmation, { state: "prepared", preview });
    return Object.freeze({ preview, confirmation });
  }

  function cancel(confirmation) {
    const entry = confirmations.get(confirmation);
    if (!entry) fail("confirmation-required", "A valid personalization confirmation is required");
    if (entry.state !== "prepared") fail("confirmation-used", "Personalization confirmation is no longer available");
    entry.state = "cancelled";
    return Object.freeze({ status: "cancelled" });
  }

  function apply(confirmation, decision = {}) {
    const entry = confirmations.get(confirmation);
    if (!entry) fail("confirmation-required", "A valid personalization confirmation is required");
    if (decision.confirmed !== true) fail("confirmation-required", "Explicit confirmation is required before importing personalization");
    if (entry.state !== "prepared") fail("confirmation-used", "Personalization confirmation is no longer available");
    entry.state = "applied";
    return Object.freeze({
      status: "applied",
      preferences: entry.preview.preferences,
      changes: entry.preview.changes
    });
  }

  return Object.freeze({ prepare, apply, cancel });
}

module.exports = {
  BLOCKED_KEYS,
  MAX_PERSONALIZATION_BYTES,
  PERSONALIZATION_FORMAT,
  PERSONALIZATION_KEYS,
  PERSONALIZATION_VERSION,
  PersonalizationError,
  buildPersonalizationPackage,
  createPersonalizationService,
  normalizePreferences,
  parsePersonalization,
  serializePersonalization
};
