"use strict";

const SOCIAL_SCOPES = Object.freeze(["all", "public", "personal"]);

function asList(value) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function socialRecordScope(record = {}) {
  const frontmatter = record.frontmatter || {};
  const explicit = String(frontmatter.scope || "").trim().toLowerCase();
  if (["public", "open", "公众", "公共"].includes(explicit)) return "public";
  if (["personal", "private", "sensitive", "私人", "个人"].includes(explicit)) return "personal";

  const tokens = [
    ...asList(frontmatter.cssclasses),
    ...asList(frontmatter.tags),
    ...asList(record.tags)
  ].map((value) => String(value || "").toLowerCase());
  if (tokens.some((value) => value.includes("scope-public") || value.includes("范围/公共"))) return "public";
  if (tokens.some((value) => value.includes("scope-personal") || value.includes("范围/私人"))) return "personal";

  const privacy = String(frontmatter.privacy || "").trim().toLowerCase();
  if (["public", "open"].includes(privacy)) return "public";
  if (["private", "personal", "sensitive"].includes(privacy)) return "personal";

  const relationScope = String(frontmatter.relation_scope || "").trim().toLowerCase();
  if (["other", "public", "historical", "celebrity"].includes(relationScope)) return "public";
  return "personal";
}

function normalizeSocialScope(value) {
  const scope = String(value || "all").trim().toLowerCase();
  return SOCIAL_SCOPES.includes(scope) ? scope : "all";
}

function filterSocialRecords(records = [], scope = "all") {
  const normalized = normalizeSocialScope(scope);
  const source = Array.isArray(records) ? records : [];
  return normalized === "all" ? source : source.filter((record) => socialRecordScope(record) === normalized);
}

function socialScopeCounts(records = []) {
  const source = Array.isArray(records) ? records : [];
  const publicCount = filterSocialRecords(source, "public").length;
  return Object.freeze({
    all: source.length,
    public: publicCount,
    personal: source.length - publicCount
  });
}

module.exports = {
  SOCIAL_SCOPES,
  filterSocialRecords,
  normalizeSocialScope,
  socialRecordScope,
  socialScopeCounts
};
