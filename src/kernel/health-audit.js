"use strict";

const { recordEntityId, recordFrontmatter } = require("../services/record-query");

const REVIEWED_MEMORY_TYPES = new Set(["user-memory", "ai-working-memory", "workflow"]);
const SENSITIVE_PRIVACY = new Set(["private", "sensitive"]);

function finding(ruleId, severity, cabinId, record = null, extra = {}) {
  return Object.freeze({
    ruleId,
    severity,
    cabinId: cabinId || "unknown",
    entityId: record ? recordEntityId(record) : String(extra.entityId || ""),
    path: String(record?.path || extra.path || ""),
    field: String(extra.field || "")
  });
}

function enabledRules(registry) {
  const rules = new Map();
  registry.list().forEach((cabin) => cabin.healthRules.forEach((rule) => {
    if (!rules.has(rule.id)) rules.set(rule.id, new Map());
    rules.get(rule.id).set(cabin.id, rule.severity);
  }));
  return rules;
}

function runHealthAudit(options = {}) {
  const registry = options.registry;
  const index = options.index;
  const relationIndex = options.relationIndex;
  if (!registry || !index) throw new TypeError("health audit requires a registry and record index");
  const rules = enabledRules(registry);
  const findings = [];
  const records = Array.isArray(index.all) ? index.all : [];

  records.forEach((record) => {
    const cabin = registry.resolveRecord(record);
    if (!cabin) return;
    const definition = registry.objectTypeForRecord(record);
    const frontmatter = recordFrontmatter(record);
    if (!recordEntityId(record) && rules.get("missing-entity-id")?.has(cabin.id)) {
      findings.push(finding("missing-entity-id", rules.get("missing-entity-id").get(cabin.id), cabin.id, record));
    }
    if (rules.get("sensitive-record-missing-privacy")?.has(cabin.id)
      && ["private", "sensitive"].includes(definition?.privacyDefault)
      && !SENSITIVE_PRIVACY.has(String(frontmatter.privacy || "").trim().toLowerCase())) {
      findings.push(finding("sensitive-record-missing-privacy", rules.get("sensitive-record-missing-privacy").get(cabin.id), cabin.id, record, { field: "privacy" }));
    }
    if (cabin.id === "memory"
      && rules.get("memory-missing-review-status")?.has(cabin.id)
      && REVIEWED_MEMORY_TYPES.has(definition?.id)
      && !String(frontmatter.review_status || "").trim()) {
      findings.push(finding("memory-missing-review-status", rules.get("memory-missing-review-status").get(cabin.id), cabin.id, record, { field: "review_status" }));
    }
  });

  if (rules.has("duplicate-entity-id")) {
    for (const [entityId, duplicates] of index.duplicateEntityIds || []) {
      (duplicates || []).forEach((record) => {
        const cabin = registry.resolveRecord(record);
        const severity = cabin && rules.get("duplicate-entity-id")?.get(cabin.id);
        if (severity) findings.push(finding("duplicate-entity-id", severity, cabin.id, record, { entityId }));
      });
    }
  }

  if (rules.has("unresolved-relation")) {
    (relationIndex?.unresolved || []).forEach((item) => {
      const cabin = registry.resolveRecord(item.source);
      const severity = cabin && rules.get("unresolved-relation")?.get(cabin.id);
      if (severity) findings.push(finding("unresolved-relation", severity, cabin.id, item.source, { field: item.field }));
    });
  }

  const bySeverity = { info: 0, warning: 0, error: 0 };
  const byCabin = Object.fromEntries(registry.ids.map((id) => [id, 0]));
  findings.forEach((item) => {
    bySeverity[item.severity] += 1;
    if (Object.prototype.hasOwnProperty.call(byCabin, item.cabinId)) byCabin[item.cabinId] += 1;
  });
  return Object.freeze({
    findings: Object.freeze(findings),
    summary: Object.freeze({
      total: findings.length,
      bySeverity: Object.freeze(bySeverity),
      byCabin: Object.freeze(byCabin)
    })
  });
}

module.exports = { runHealthAudit };
