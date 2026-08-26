"use strict";

const {
  isHealthRecord,
  recordEntityId,
  recordFrontmatter,
  recordIdentityTokens,
  recordPathKey,
  recordReferenceMatches
} = require("./record-query");

function relationValues(value) {
  if (Array.isArray(value)) return value.flatMap((item) => relationValues(item));
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function buildRecordRelationLookup(index) {
  const records = Array.isArray(index?.all) ? index.all : [];
  const active = records.filter((record) => String(recordFrontmatter(record).status || "").toLowerCase() !== "merged");
  const byPath = new Map();
  const byEntityId = new Map();
  const byIdentity = new Map();
  active.forEach((record) => {
    const path = String(record?.path || "").trim();
    const entityId = recordEntityId(record);
    if (path && !byPath.has(path)) byPath.set(path, record);
    if (entityId && !byEntityId.has(entityId)) byEntityId.set(entityId, record);
    recordIdentityTokens(record).forEach((token) => {
      if (!byIdentity.has(token)) byIdentity.set(token, record);
    });
  });
  records.filter((record) => String(recordFrontmatter(record).status || "").toLowerCase() === "merged").forEach((record) => {
    const frontmatter = recordFrontmatter(record);
    const target = byEntityId.get(String(frontmatter.merged_into_id || "").trim());
    if (!target) return;
    const path = String(record?.path || "").trim();
    if (path) byPath.set(path, target);
    const oldId = recordEntityId(record);
    if (oldId) byEntityId.set(oldId, target);
    recordIdentityTokens(record).forEach((token) => byIdentity.set(token, target));
  });
  return { records, active, byPath, byEntityId, byIdentity };
}

function resolveRecordReference(lookup, value) {
  if (!lookup) return null;
  if (value && typeof value === "object") {
    const entityId = String(value.target_id || value.entity_id || value.id || "").trim();
    if (entityId && lookup.byEntityId?.has(entityId)) return lookup.byEntityId.get(entityId);
    const nested = value.target ?? value.path ?? value.thread ?? value.person ?? value.patient
      ?? value.organization ?? value.asset ?? value.task ?? value.note ?? value.value ?? value.name ?? value.title;
    return nested === undefined ? null : resolveRecordReference(lookup, nested);
  }
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (lookup.byEntityId?.has(raw)) return lookup.byEntityId.get(raw);
  const clean = raw.replace(/^!?\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
  if (!clean) return null;
  return lookup.byPath?.get(clean) || lookup.byIdentity?.get(recordPathKey(clean)) || null;
}

function buildRecordRelationIndex(index, options = {}) {
  const records = Array.isArray(index?.all) ? index.all : [];
  const lookup = options.lookup || buildRecordRelationLookup(index);
  const rules = Array.isArray(options.fieldRules) ? options.fieldRules.filter((rule) => rule?.field) : [];
  const resolvedLinks = options.resolvedLinks && typeof options.resolvedLinks === "object" ? options.resolvedLinks : {};
  const outgoing = new Map(records.map((record) => [record.path, []]));
  const incoming = new Map(records.map((record) => [record.path, []]));
  const byType = new Map();
  const unresolved = [];
  const seen = new Set();
  const push = (source, target, data = {}) => {
    if (!source?.path || !target?.path || source.path === target.path) return;
    const type = String(data.type || "related");
    const field = String(data.field || "");
    const sourceLabel = String(data.sourceLabel || field || type);
    const key = `${source.path}->${target.path}::${type}::${field}::${sourceLabel}`;
    if (seen.has(key)) return;
    seen.add(key);
    const relation = {
      source,
      target,
      type,
      label: data.label || type,
      reverseLabel: data.reverseLabel || type,
      field,
      sourceLabel,
      color: data.color || "#e2c878",
      raw: data.raw
    };
    if (!outgoing.has(source.path)) outgoing.set(source.path, []);
    if (!incoming.has(target.path)) incoming.set(target.path, []);
    outgoing.get(source.path).push(relation);
    incoming.get(target.path).push(relation);
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(relation);
  };

  Object.entries(resolvedLinks).forEach(([sourcePath, links]) => {
    const source = lookup.byPath.get(sourcePath);
    if (!source || !links) return;
    Object.keys(links).forEach((targetPath) => {
      const target = lookup.byPath.get(targetPath);
      if (target) push(source, target, {
        type: "wikilink",
        label: options.wikilinkLabel || "wikilink",
        reverseLabel: options.wikilinkReverseLabel || "wikilink",
        sourceLabel: options.wikilinkSourceLabel || "wikilink",
        color: typeof options.wikilinkColor === "function"
          ? options.wikilinkColor(target, source)
          : options.wikilinkColor || "#e2c878"
      });
    });
  });

  records.forEach((source) => {
    const frontmatter = recordFrontmatter(source);
    rules.forEach((rule) => {
      if (typeof rule.sourcePredicate === "function" && !rule.sourcePredicate(source)) return;
      relationValues(frontmatter[rule.field]).forEach((raw) => {
        const target = resolveRecordReference(lookup, raw);
        if (!target) {
          unresolved.push({ source, field: rule.field, raw });
          return;
        }
        if (typeof rule.targetPredicate === "function" && !rule.targetPredicate(target)) return;
        const mapped = typeof options.mapRelation === "function"
          ? options.mapRelation({ source, target, rule, raw })
          : null;
        if (mapped === false) return;
        push(source, target, {
          ...rule,
          ...(mapped && typeof mapped === "object" ? mapped : {}),
          field: rule.field,
          sourceLabel: mapped?.sourceLabel || rule.sourceLabel || rule.field,
          raw
        });
      });
    });
    if (typeof options.extraRelations !== "function") return;
    relationValues(options.extraRelations(source, lookup) || []).forEach((extra) => {
      if (!extra || typeof extra !== "object") return;
      const target = extra.target?.path ? extra.target : resolveRecordReference(lookup, extra.target ?? extra.value ?? extra.raw);
      if (target) push(source, target, extra);
      else unresolved.push({ source, field: extra.field || "", raw: extra.raw ?? extra.target ?? extra.value });
    });
  });

  return { recordIndex: index, lookup, outgoing, incoming, byType, unresolved };
}

function recordRelations(relationIndex, record, options = {}) {
  if (!record?.path) return { outgoing: [], incoming: [] };
  const types = options.types ? new Set(relationValues(options.types).map(String)) : null;
  const fields = options.fields ? new Set(relationValues(options.fields).map(String)) : null;
  const accept = (relation) => (!types || types.has(String(relation?.type || "")))
    && (!fields || fields.has(String(relation?.field || "")))
    && (typeof options.relationPredicate !== "function" || options.relationPredicate(relation));
  return {
    outgoing: (relationIndex?.outgoing?.get(record.path) || []).filter(accept),
    incoming: (relationIndex?.incoming?.get(record.path) || []).filter(accept)
  };
}

function relatedRecords(relationIndex, record, options = {}) {
  const direction = ["outgoing", "incoming", "either"].includes(options.direction) ? options.direction : "either";
  const relations = recordRelations(relationIndex, record, options);
  const related = [];
  if (direction === "outgoing" || direction === "either") relations.outgoing.forEach((relation) => related.push(relation.target));
  if (direction === "incoming" || direction === "either") relations.incoming.forEach((relation) => related.push(relation.source));
  return Array.from(new Map(related
    .filter((item) => item?.path)
    .filter((item) => typeof options.recordPredicate !== "function" || options.recordPredicate(item))
    .map((item) => [item.path, item])).values());
}

function healthRecordsForPerson(index, person = null, relationIndex = null) {
  const records = Array.isArray(index?.healthRecords) ? index.healthRecords : [];
  if (!person) return [...records];
  if (relationIndex) {
    const relatedPaths = new Set(relatedRecords(relationIndex, person, {
      direction: "either",
      recordPredicate: isHealthRecord
    }).map((record) => record.path));
    if (relatedPaths.size) return records.filter((record) => relatedPaths.has(record.path));
  }
  return records.filter((record) => {
    const frontmatter = recordFrontmatter(record);
    return [frontmatter.person, frontmatter.patient, frontmatter.related_person, frontmatter.related_people, frontmatter.subject]
      .some((value) => recordReferenceMatches(value, person));
  });
}

module.exports = {
  buildRecordRelationIndex,
  buildRecordRelationLookup,
  healthRecordsForPerson,
  recordRelations,
  relatedRecords,
  relationValues,
  resolveRecordReference
};
