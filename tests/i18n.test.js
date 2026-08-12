"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  LOCALES,
  createI18n,
  normalizeLocale,
  normalizeLanguagePreference,
  resolveInterfaceLocale
} = require("../src/i18n");

test("Chinese and English locale packs have identical keys", () => {
  assert.deepEqual(Object.keys(LOCALES["zh-CN"]).sort(), Object.keys(LOCALES.en).sort());
});

test("regional locale variants normalize to supported packs", () => {
  assert.equal(normalizeLocale("zh_Hans_CN"), "zh-CN");
  assert.equal(normalizeLocale("en-US"), "en");
  assert.equal(normalizeLocale("fr-FR"), "zh-CN");
});

test("auto language follows Obsidian while manual preference wins", () => {
  assert.equal(normalizeLanguagePreference("EN_us"), "en");
  assert.equal(normalizeLanguagePreference("unknown"), "auto");
  assert.equal(resolveInterfaceLocale("auto", "en-US"), "en");
  assert.equal(resolveInterfaceLocale("zh-CN", "en-US"), "zh-CN");
});

test("translation supports runtime locale changes and interpolation", () => {
  const i18n = createI18n({ locale: "zh-CN" });
  assert.equal(i18n.t("shelf.memberCount", { count: 3 }), "3 个成员");
  assert.equal(i18n.setLocale("en-GB"), "en");
  assert.equal(i18n.t("shelf.memberCount", { count: 3 }), "3 members");
});

test("unknown translation keys remain visible", () => {
  assert.equal(createI18n({ locale: "en" }).t("missing.key"), "missing.key");
});
