"use strict";

const CABIN_CONTRACT_VERSION = 1;
const CABIN_IDS = Object.freeze(["command", "assets", "social", "navigation", "memory"]);
const CABIN_AUTHORITIES = Object.freeze(["read", "write"]);
const CABIN_VIEW_KINDS = Object.freeze(["list", "table", "gallery", "board", "timeline", "graph", "detail"]);
const HEALTH_SEVERITIES = Object.freeze(["info", "warning", "error"]);
const PRIVACY_LEVELS = Object.freeze(["inherit", "public", "internal", "private", "sensitive"]);

function asArray(value) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function uniqueStrings(value, field, options = {}) {
  const values = asArray(value).map((item) => String(item || "").trim()).filter(Boolean);
  if (!options.allowEmpty && !values.length) throw new TypeError(`${field} requires at least one value`);
  if (values.some((item) => options.pattern && !options.pattern.test(item))) {
    throw new TypeError(`${field} contains an invalid value`);
  }
  return Object.freeze([...new Set(values)]);
}

function contractId(value, field = "id") {
  const id = String(value || "").trim().toLowerCase().replace(/_/g, "-");
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) throw new TypeError(`${field} is invalid`);
  return id;
}

function translationKey(value, field = "labelKey") {
  const key = String(value || "").trim();
  if (!/^[a-z][a-z0-9.-]{2,159}$/i.test(key)) throw new TypeError(`${field} is invalid`);
  return key;
}

function enumValue(value, allowed, field) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!allowed.includes(normalized)) throw new TypeError(`${field} is invalid`);
  return normalized;
}

function normalizeObjectType(candidate, cabinId) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("objectTypes entries must be objects");
  }
  const id = contractId(candidate.id, "objectTypes.id");
  const aliases = uniqueStrings([id, ...asArray(candidate.aliases)].map((item) => (
    String(item || "").trim().toLowerCase().replace(/_/g, "-")
  )), "objectTypes.aliases", { pattern: /^[a-z][a-z0-9-]{1,63}$/ });
  return Object.freeze({
    id,
    cabinId,
    aliases,
    privacyDefault: enumValue(candidate.privacyDefault || "inherit", PRIVACY_LEVELS, "objectTypes.privacyDefault"),
    relationFields: uniqueStrings(candidate.relationFields, "objectTypes.relationFields", {
      allowEmpty: true,
      pattern: /^[A-Za-z][A-Za-z0-9_-]{1,79}$/
    }),
    agentReadable: candidate.agentReadable !== false
  });
}

function normalizeView(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("views entries must be objects");
  }
  return Object.freeze({
    id: contractId(candidate.id, "views.id"),
    labelKey: translationKey(candidate.labelKey, "views.labelKey"),
    kind: enumValue(candidate.kind, CABIN_VIEW_KINDS, "views.kind"),
    primary: candidate.primary === true
  });
}

function normalizeAction(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("actions entries must be objects");
  }
  const authority = enumValue(candidate.authority || "read", CABIN_AUTHORITIES, "actions.authority");
  const transactionRequired = candidate.transactionRequired === true;
  if (authority === "write" && !transactionRequired) {
    throw new TypeError("write actions must require a transaction");
  }
  return Object.freeze({
    id: contractId(candidate.id, "actions.id"),
    labelKey: translationKey(candidate.labelKey, "actions.labelKey"),
    authority,
    transactionRequired,
    objectTypes: uniqueStrings(candidate.objectTypes, "actions.objectTypes", {
      allowEmpty: true,
      pattern: /^[a-z][a-z0-9-]{1,63}$/
    }),
    agentCallable: candidate.agentCallable === true
  });
}

function normalizeHealthRule(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("healthRules entries must be objects");
  }
  return Object.freeze({
    id: contractId(candidate.id, "healthRules.id"),
    severity: enumValue(candidate.severity || "warning", HEALTH_SEVERITIES, "healthRules.severity")
  });
}

function assertUnique(items, field) {
  const seen = new Set();
  items.forEach((item) => {
    if (seen.has(item.id)) throw new TypeError(`${field} contains duplicate ids`);
    seen.add(item.id);
  });
}

function defineCabinManifest(candidate = {}) {
  const id = contractId(candidate.id, "cabin.id");
  if (!CABIN_IDS.includes(id)) throw new TypeError("cabin.id is not part of the five-cabin contract");
  const objectTypes = Object.freeze(asArray(candidate.objectTypes).map((item) => normalizeObjectType(item, id)));
  const views = Object.freeze(asArray(candidate.views).map(normalizeView));
  const actions = Object.freeze(asArray(candidate.actions).map(normalizeAction));
  const healthRules = Object.freeze(asArray(candidate.healthRules).map(normalizeHealthRule));
  if (!objectTypes.length || !views.length) throw new TypeError("a cabin requires object types and views");
  [
    [objectTypes, "objectTypes"],
    [views, "views"],
    [actions, "actions"],
    [healthRules, "healthRules"]
  ].forEach(([items, field]) => assertUnique(items, field));
  const primaryViews = views.filter((view) => view.primary);
  if (primaryViews.length !== 1) throw new TypeError("a cabin requires exactly one primary view");
  const knownTypes = new Set(objectTypes.map((item) => item.id));
  actions.forEach((action) => action.objectTypes.forEach((type) => {
    if (!knownTypes.has(type)) throw new TypeError("an action references an unknown object type");
  }));
  return Object.freeze({
    version: CABIN_CONTRACT_VERSION,
    id,
    moduleId: id,
    labelKey: translationKey(candidate.labelKey || `module.${id}`, "cabin.labelKey"),
    icon: String(candidate.icon || "box").trim(),
    accent: String(candidate.accent || "#8aa0b8").trim(),
    storageRoles: uniqueStrings(candidate.storageRoles, "cabin.storageRoles", { allowEmpty: true }),
    objectTypes,
    views,
    actions,
    healthRules,
    agentCapabilities: uniqueStrings(candidate.agentCapabilities, "cabin.agentCapabilities", {
      allowEmpty: true,
      pattern: /^[a-z][a-z0-9-]{1,63}$/
    })
  });
}

module.exports = {
  CABIN_AUTHORITIES,
  CABIN_CONTRACT_VERSION,
  CABIN_IDS,
  CABIN_VIEW_KINDS,
  HEALTH_SEVERITIES,
  PRIVACY_LEVELS,
  contractId,
  defineCabinManifest
};
