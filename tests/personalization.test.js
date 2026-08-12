"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_PERSONALIZATION_BYTES,
  PERSONALIZATION_FORMAT,
  createPersonalizationService,
  parsePersonalization,
  serializePersonalization
} = require("../src/config/personalization");

test("personalization export contains portable preferences and no vault binding or runtime state", () => {
  const text = serializePersonalization({
    interfaceLanguage: "en-US",
    storagePreference: "portable",
    storageProfileId: "legacy-dashboard",
    storageSetupCompleted: true,
    apiKey: "private credential",
    healthRecords: [{ private: true }],
    usageLedger: [{ tokens: 1 }]
  }, { now: () => new Date("2026-08-12T00:00:00.000Z") });
  assert.deepEqual(JSON.parse(text), {
    format: PERSONALIZATION_FORMAT,
    version: 1,
    exportedAt: "2026-08-12T00:00:00.000Z",
    preferences: { interfaceLanguage: "en", storagePreference: "portable" }
  });
  ["storageProfileId", "storageSetupCompleted", "apiKey", "healthRecords", "usageLedger", "private credential"]
    .forEach((value) => assert.equal(text.includes(value), false));
});

test("v0 packages migrate through an explicit field map", () => {
  const parsed = parsePersonalization({
    format: PERSONALIZATION_FORMAT,
    version: 0,
    language: "zh-Hans",
    storage: "legacy-dashboard"
  });
  assert.equal(parsed.sourceVersion, 0);
  assert.deepEqual(parsed.preferences, { interfaceLanguage: "zh-CN", storagePreference: "legacy-dashboard" });
});

test("import rejects unknown fields, private keys, paths, invalid formats, future versions, and oversized files", () => {
  const base = {
    format: PERSONALIZATION_FORMAT,
    version: 1,
    exportedAt: "2026-08-12T00:00:00.000Z",
    preferences: { interfaceLanguage: "en", storagePreference: "auto" }
  };
  const invalid = [
    { ...base, extra: true },
    { ...base, preferences: { ...base.preferences, apiKey: "secret" } },
    { ...base, preferences: { ...base.preferences, vaultPath: ["", "Users", "example", "Vault"].join("/") } },
    { ...base, format: "other" },
    { ...base, version: 999 },
    { ...base, exportedAt: "invalid" },
    { ...base, preferences: { interfaceLanguage: "Klingon", storagePreference: "auto" } },
    { ...base, preferences: { interfaceLanguage: "en", storagePreference: "private-vault" } },
    { ...base, preferences: { interfaceLanguage: "en" } }
  ];
  invalid.forEach((candidate) => assert.throws(() => parsePersonalization(candidate)));
  assert.throws(() => parsePersonalization("x".repeat(MAX_PERSONALIZATION_BYTES + 1)), (error) => error.code === "size");
});

test("import is preview-only until its opaque single-use confirmation is applied", () => {
  const service = createPersonalizationService();
  const text = serializePersonalization({ interfaceLanguage: "en", storagePreference: "portable" });
  const prepared = service.prepare(text, { interfaceLanguage: "zh-CN", storagePreference: "auto" });
  assert.deepEqual(prepared.preview.changes, [
    { key: "interfaceLanguage", before: "zh-CN", after: "en" },
    { key: "storagePreference", before: "auto", after: "portable" }
  ]);
  assert.throws(() => service.apply(prepared.confirmation), (error) => error.code === "confirmation-required");
  const result = service.apply(prepared.confirmation, { confirmed: true });
  assert.equal(result.status, "applied");
  assert.deepEqual(result.preferences, { interfaceLanguage: "en", storagePreference: "portable" });
  assert.throws(() => service.apply(prepared.confirmation, { confirmed: true }), (error) => error.code === "confirmation-used");
  assert.throws(() => service.apply({ changes: 2 }, { confirmed: true }), (error) => error.code === "confirmation-required");
});

test("cancelled import cannot be applied", () => {
  const service = createPersonalizationService();
  const prepared = service.prepare(serializePersonalization({}), {});
  assert.equal(service.cancel(prepared.confirmation).status, "cancelled");
  assert.throws(() => service.apply(prepared.confirmation, { confirmed: true }), (error) => error.code === "confirmation-used");
});
