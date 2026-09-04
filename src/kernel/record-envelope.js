"use strict";

const {
  recordEntityId,
  recordFrontmatter,
  recordPathKey,
  recordType
} = require("../services/record-query");
const { PRIVACY_LEVELS } = require("./contracts");

function stableHash(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function canonicalPrivacy(value, fallback = "inherit") {
  const aliases = { high: "sensitive", personal: "private", protected: "private", shared: "internal" };
  const raw = String(value || "").trim().toLowerCase();
  const privacy = aliases[raw] || raw;
  return PRIVACY_LEVELS.includes(privacy) ? privacy : fallback;
}

function createRecordEnvelope(record, registry, options = {}) {
  if (!record || typeof record !== "object") throw new TypeError("record envelope requires a record");
  if (!registry || typeof registry.resolveRecord !== "function") throw new TypeError("record envelope requires a cabin registry");
  const requestedCabinId = String(options.cabinId || "").trim().toLowerCase();
  const cabin = (requestedCabinId ? registry.get(requestedCabinId) : null) || registry.resolveRecord(record);
  if (!cabin) return null;
  const definition = registry.objectTypeForRecord(record);
  const frontmatter = recordFrontmatter(record);
  const explicitId = recordEntityId(record);
  const path = String(record.path || "").trim();
  const identityBasis = recordPathKey(path) || `${cabin.id}:${record.title || record.name || recordType(record)}`;
  const type = definition?.id || recordType(record) || "note";
  return Object.freeze({
    entityId: explicitId || `virtual:${cabin.id}:${stableHash(identityBasis)}`,
    identityKind: explicitId ? "stable" : "virtual",
    formal: Boolean(explicitId),
    cabinId: cabin.id,
    moduleId: cabin.moduleId,
    type,
    title: String(record.title || record.name || frontmatter.title || frontmatter.name || path || type).trim(),
    status: String(frontmatter.status || record.status || "active").trim().toLowerCase(),
    privacy: canonicalPrivacy(frontmatter.privacy, definition?.privacyDefault || "inherit"),
    path,
    source: Object.freeze({
      kind: String(record.source?.kind || record.sourceKind || (record.sourceMount || record.mountId ? "mount" : "vault")),
      mountId: String(record.source?.mountId || record.sourceMount?.id || record.mountId || ""),
      path
    }),
    record
  });
}

function summarizeEnvelopes(envelopes = [], options = {}) {
  const visible = typeof options.visible === "function" ? options.visible : () => true;
  const attention = typeof options.attention === "function"
    ? options.attention
    : (envelope) => ["inbox", "attention", "blocked"].includes(envelope.status);
  const list = (Array.isArray(envelopes) ? envelopes : []).filter(Boolean);
  return Object.freeze({
    indexed: list.length,
    formal: list.filter((item) => item.formal).length,
    visible: list.filter(visible).length,
    inbox: list.filter((item) => item.status === "inbox").length,
    attention: list.filter(attention).length
  });
}

module.exports = { canonicalPrivacy, createRecordEnvelope, stableHash, summarizeEnvelopes };
