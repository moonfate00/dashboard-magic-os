"use strict";

const zhCN = require("./locales/zh-CN");
const en = require("./locales/en");

const DEFAULT_LOCALE = "zh-CN";
const FALLBACK_LOCALE = "en";
const LOCALES = Object.freeze({ "zh-CN": zhCN, en });
const LANGUAGE_PREFERENCES = Object.freeze(["auto", "zh-CN", "en"]);

function normalizeLocale(value = "") {
  const locale = String(value || "").trim().replace(/_/g, "-").toLowerCase();
  if (!locale) return DEFAULT_LOCALE;
  if (locale === "zh" || locale.startsWith("zh-cn") || locale.startsWith("zh-hans")) return "zh-CN";
  if (locale === "en" || locale.startsWith("en-")) return "en";
  return DEFAULT_LOCALE;
}

function interpolate(template, params = {}) {
  return String(template).replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  ));
}

function normalizeLanguagePreference(value = "auto") {
  const raw = String(value || "auto").trim().replace(/_/g, "-").toLowerCase();
  if (raw === "auto") return "auto";
  if (raw === "zh" || raw.startsWith("zh-cn") || raw.startsWith("zh-hans")) return "zh-CN";
  if (raw === "en" || raw.startsWith("en-")) return "en";
  return "auto";
}

function resolveInterfaceLocale(preference = "auto", appLocale = "") {
  const normalizedPreference = normalizeLanguagePreference(preference);
  return normalizedPreference === "auto" ? normalizeLocale(appLocale) : normalizedPreference;
}

function createI18n(options = {}) {
  let locale = normalizeLocale(options.locale || options.appLocale || DEFAULT_LOCALE);
  const fallbackLocale = normalizeLocale(options.fallbackLocale || FALLBACK_LOCALE);

  const api = {
    get locale() {
      return locale;
    },
    get availableLocales() {
      return Object.keys(LOCALES);
    },
    setLocale(nextLocale) {
      locale = normalizeLocale(nextLocale);
      return locale;
    },
    has(key, targetLocale = locale) {
      return Object.prototype.hasOwnProperty.call(LOCALES[normalizeLocale(targetLocale)] || {}, String(key));
    },
    t(key, params = {}) {
      const id = String(key || "");
      const active = LOCALES[locale] || {};
      const fallback = LOCALES[fallbackLocale] || {};
      const value = active[id] ?? fallback[id] ?? LOCALES[DEFAULT_LOCALE]?.[id] ?? id;
      return interpolate(value, params);
    }
  };
  return api;
}

module.exports = {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  LOCALES,
  LANGUAGE_PREFERENCES,
  normalizeLocale,
  normalizeLanguagePreference,
  resolveInterfaceLocale,
  interpolate,
  createI18n
};
