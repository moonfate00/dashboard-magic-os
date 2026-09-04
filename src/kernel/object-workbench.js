"use strict";

const {
  recordEntityId,
  recordFrontmatter,
  recordPathKey,
  recordReferenceTokens,
  recordType
} = require("../services/record-query");
const { recordRelations, resolveRecordReference } = require("../services/record-relations");
const { canonicalPrivacy, createRecordEnvelope, stableHash } = require("./record-envelope");

const PRIVACY_EXPOSURE = Object.freeze({
  sensitive: 0,
  private: 1,
  internal: 2,
  inherit: 2,
  public: 3
});
const INSPECTOR_FIELD_GROUPS = Object.freeze([
  Object.freeze({
    id: "identity",
    fields: Object.freeze(["entity_id", "entity_kind", "type", "name", "title", "aliases"])
  }),
  Object.freeze({
    id: "classification",
    fields: Object.freeze(["module", "module_id", "domain", "topic", "thread_type", "asset_type", "event_type", "item_type", "health_type", "note_mode"])
  }),
  Object.freeze({
    id: "scope",
    fields: Object.freeze(["scope", "relation_scope", "privacy", "workspace", "project", "parent_project", "related_thread"])
  }),
  Object.freeze({
    id: "lifecycle",
    fields: Object.freeze(["status", "stage", "priority", "start_date", "target_date", "due", "review_cycle", "created", "modified", "updated"])
  }),
  Object.freeze({
    id: "provenance",
    fields: Object.freeze(["source", "source_type", "source_module", "source_port", "source_url", "source_note", "source_records"])
  })
]);
const RELATION_FIELD_HINTS = Object.freeze({
  person: "person",
  patient: "person",
  people: "person",
  related_people: "person",
  characters: "person",
  owner: "person",
  organization: "organization",
  organizations: "organization",
  members: "person",
  location: "place",
  locations: "place",
  place: "place",
  places: "place",
  related_places: "place",
  project: "project",
  parent_project: "project",
  goal: "goal",
  related_thread: "learning-thread",
  related_threads: "learning-thread",
  parent_thread: "learning-thread",
  source_asset: "asset-image",
  related_assets: "asset-link",
  used_by: "source-note"
});
const TYPE_CABIN_HINTS = Object.freeze({
  person: "social",
  organization: "social",
  place: "social",
  project: "command",
  goal: "command",
  "learning-thread": "navigation",
  "asset-image": "assets",
  "asset-link": "assets",
  "source-note": "navigation"
});

function cleanText(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function fieldPresent(value) {
  return value !== undefined && value !== null && value !== ""
    && (!Array.isArray(value) || value.length > 0);
}

function freezeList(items) {
  return Object.freeze(items.map((item) => Object.freeze(item)));
}

function displayValue(value) {
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(" · ");
  if (value && typeof value === "object") {
    const preferred = value.label ?? value.title ?? value.name ?? value.path ?? value.target ?? value.entity_id;
    return preferred === undefined ? JSON.stringify(value) : displayValue(preferred);
  }
  return cleanText(value);
}

function sectionFields(frontmatter, definition = null) {
  const relationFields = new Set(definition?.relationFields || []);
  const used = new Set();
  const sections = INSPECTOR_FIELD_GROUPS.map((group) => {
    const fields = group.fields
      .filter((key) => fieldPresent(frontmatter[key]))
      .map((key) => {
        used.add(key);
        return { key, value: frontmatter[key], display: displayValue(frontmatter[key]) };
      });
    return { id: group.id, fields: freezeList(fields) };
  }).filter((section) => section.fields.length);
  const relations = [...relationFields]
    .filter((key) => fieldPresent(frontmatter[key]))
    .map((key) => {
      used.add(key);
      return { key, value: frontmatter[key], display: displayValue(frontmatter[key]) };
    });
  if (relations.length) sections.push({ id: "relation-fields", fields: freezeList(relations) });
  const custom = Object.keys(frontmatter)
    .filter((key) => !used.has(key) && key !== "tags" && !key.startsWith("cssclass"))
    .filter((key) => fieldPresent(frontmatter[key]))
    .sort()
    .map((key) => ({ key, value: frontmatter[key], display: displayValue(frontmatter[key]) }));
  if (custom.length) sections.push({ id: "custom", fields: freezeList(custom) });
  return freezeList(sections);
}

function relationProjection(relation, direction) {
  const target = direction === "outgoing" ? relation?.target : relation?.source;
  if (!target?.path) return null;
  return Object.freeze({
    direction,
    type: cleanText(relation.type || "related"),
    field: cleanText(relation.field),
    label: cleanText(direction === "outgoing" ? relation.label : relation.reverseLabel) || "related",
    sourceLabel: cleanText(relation.sourceLabel),
    color: cleanText(relation.color),
    targetPath: target.path,
    targetEntityId: recordEntityId(target),
    targetType: recordType(target),
    targetTitle: cleanText(target.title || target.name || recordFrontmatter(target).title || target.path),
    target
  });
}

function dedupeRelations(items) {
  const seen = new Set();
  return items.filter(Boolean).filter((item) => {
    const key = `${item.direction}:${item.targetPath}:${item.type}:${item.field}:${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unresolvedForRecord(relationIndex, record) {
  return (relationIndex?.unresolved || []).filter((item) => item?.source?.path === record?.path);
}

function candidateLabel(raw) {
  const token = recordReferenceTokens(raw)[0] || cleanText(raw);
  const normalized = token.replace(/\\/g, "/").replace(/\.md$/i, "");
  return cleanText(normalized.split("/").pop() || normalized);
}

function suggestedTypeForField(field) {
  const key = cleanText(field).toLowerCase();
  if (RELATION_FIELD_HINTS[key]) return RELATION_FIELD_HINTS[key];
  if (/person|people|patient|character|人物|成员/.test(key)) return "person";
  if (/org|company|organization|组织|单位/.test(key)) return "organization";
  if (/location|place|地点|位置/.test(key)) return "place";
  if (/project|项目/.test(key)) return "project";
  if (/thread|脉络|课程/.test(key)) return "learning-thread";
  if (/asset|附件|素材/.test(key)) return "asset-link";
  return "source-note";
}

function discoverUnprofiledObjects(relationIndex, options = {}) {
  const groups = new Map();
  const include = typeof options.include === "function" ? options.include : () => true;
  (relationIndex?.unresolved || []).filter(include).forEach((item) => {
    const label = candidateLabel(item.raw);
    if (!label || label.length > 160) return;
    const type = suggestedTypeForField(item.field);
    const key = `${type}:${recordPathKey(label)}`;
    if (!groups.has(key)) groups.set(key, {
      id: `candidate:${stableHash(key)}`,
      label,
      reference: recordReferenceTokens(item.raw)[0] || displayValue(item.raw),
      suggestedType: type,
      suggestedCabinId: TYPE_CABIN_HINTS[type] || "navigation",
      fields: new Set(),
      sources: new Map(),
      occurrences: 0
    });
    const group = groups.get(key);
    group.fields.add(cleanText(item.field) || "relation");
    if (item.source?.path) group.sources.set(item.source.path, item.source);
    group.occurrences += 1;
  });
  return freezeList([...groups.values()].map((group) => ({
    id: group.id,
    state: "candidate",
    label: group.label,
    reference: group.reference,
    suggestedType: group.suggestedType,
    suggestedCabinId: group.suggestedCabinId,
    confidence: group.occurrences > 1 ? "high" : "medium",
    occurrences: group.occurrences,
    fields: Object.freeze([...group.fields].sort()),
    sourcePaths: Object.freeze([...group.sources.keys()].sort()),
    sourceRecords: Object.freeze([...group.sources.values()])
  })).sort((left, right) => right.occurrences - left.occurrences || left.label.localeCompare(right.label)));
}

function inspectorWarnings(snapshot, record) {
  const findings = (snapshot?.health?.findings || []).filter((item) => item.path === record?.path);
  const unresolved = unresolvedForRecord(snapshot?.relationIndex, record);
  return freezeList([
    ...findings.map((item) => ({
      id: `${item.ruleId}:${item.field || "record"}`,
      kind: "health",
      severity: item.severity,
      ruleId: item.ruleId,
      field: item.field || ""
    })),
    ...unresolved.map((item, index) => ({
      id: `unresolved:${item.field || "relation"}:${index}`,
      kind: "unresolved-reference",
      severity: "warning",
      ruleId: "unresolved-relation",
      field: cleanText(item.field),
      value: displayValue(item.raw)
    }))
  ]);
}

function buildObjectInspectorModel(snapshot, record) {
  if (!snapshot?.registry || !snapshot?.relationIndex) throw new TypeError("object inspector requires a cabin snapshot");
  const envelope = createRecordEnvelope(record, snapshot.registry);
  if (!envelope) return null;
  const definition = snapshot.registry.objectTypeForRecord(record);
  const relations = recordRelations(snapshot.relationIndex, record);
  const outgoing = relations.outgoing.map((item) => relationProjection(item, "outgoing"));
  const incoming = relations.incoming.map((item) => relationProjection(item, "incoming"));
  const relationItems = freezeList(dedupeRelations([...outgoing, ...incoming]));
  const candidates = discoverUnprofiledObjects(snapshot.relationIndex, {
    include: (item) => item?.source?.path === record?.path
  });
  const tags = Object.freeze([...(Array.isArray(record?.tags) ? record.tags : [])].map(cleanText).filter(Boolean));
  const warnings = inspectorWarnings(snapshot, record);
  const actions = snapshot.registry.get(envelope.cabinId)?.actions
    .filter((action) => !action.objectTypes.length || action.objectTypes.includes(envelope.type))
    .map((action) => ({
      id: action.id,
      authority: action.authority,
      transactionRequired: action.transactionRequired,
      agentCallable: action.agentCallable
    })) || [];
  return Object.freeze({
    envelope,
    definition,
    fields: sectionFields(recordFrontmatter(record), definition),
    tags,
    relations: Object.freeze({
      outgoing: outgoing.filter(Boolean).length,
      incoming: incoming.filter(Boolean).length,
      items: relationItems
    }),
    candidates,
    warnings,
    actions: freezeList(actions),
    summary: Object.freeze({
      formal: envelope.formal,
      relationCount: relationItems.length,
      candidateCount: candidates.length,
      warningCount: warnings.length,
      sourceKind: envelope.source.kind
    })
  });
}

function scopeValue(frontmatter, field) {
  return cleanText(frontmatter?.[field]).toLowerCase();
}

function transitionRisk(id, severity, field, from, to, message) {
  return Object.freeze({ id, severity, field, from: cleanText(from), to: cleanText(to), message });
}

function assessObjectTransition(record, patch = {}, registry, options = {}) {
  if (!record || typeof record !== "object") throw new TypeError("scope guard requires a record");
  if (!registry?.resolveRecord) throw new TypeError("scope guard requires a cabin registry");
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new TypeError("scope guard patch must be an object");
  const before = recordFrontmatter(record);
  const after = { ...before, ...patch };
  const sourceEnvelope = createRecordEnvelope(record, registry);
  const projectedRecord = { ...record, type: after.entity_kind || after.type || record.type, module: after.module || after.module_id || record.module, frontmatter: after };
  const targetEnvelope = createRecordEnvelope(projectedRecord, registry);
  const risks = [];
  const sourceId = recordEntityId(record);
  if (Object.prototype.hasOwnProperty.call(patch, "entity_id") && cleanText(patch.entity_id) !== sourceId) {
    risks.push(transitionRisk("stable-identity-change", "block", "entity_id", sourceId, patch.entity_id, "稳定对象 ID 不能通过普通编辑修改或清空"));
  }
  if (!targetEnvelope) {
    risks.push(transitionRisk("unknown-target-cabin", "block", "module", sourceEnvelope?.cabinId, after.module || after.module_id, "目标类型或舱室不属于五舱对象契约"));
  }
  if (sourceEnvelope && targetEnvelope && sourceEnvelope.cabinId !== targetEnvelope.cabinId) {
    risks.push(transitionRisk("cross-cabin-move", "confirm", "module", sourceEnvelope.cabinId, targetEnvelope.cabinId, "对象将跨舱移动，所有投影视图都会变化"));
  }
  if (sourceEnvelope && targetEnvelope && sourceEnvelope.type !== targetEnvelope.type) {
    risks.push(transitionRisk("object-type-change", "confirm", "type", sourceEnvelope.type, targetEnvelope.type, "对象类型发生变化，字段和关系解释可能随之改变"));
  }
  const fromPrivacy = sourceEnvelope?.privacy || canonicalPrivacy(before.privacy);
  const toPrivacy = targetEnvelope?.privacy || canonicalPrivacy(after.privacy, fromPrivacy);
  if (PRIVACY_EXPOSURE[toPrivacy] > PRIVACY_EXPOSURE[fromPrivacy]) {
    risks.push(transitionRisk("privacy-exposure", "confirm", "privacy", fromPrivacy, toPrivacy, "对象将进入更开放的隐私范围"));
  }
  const sourceType = sourceEnvelope?.type || recordType(record);
  if (sourceType === "health-record" && toPrivacy === "public") {
    risks.push(transitionRisk("public-health-record", "block", "privacy", fromPrivacy, toPrivacy, "健康档案不能直接设为公开"));
  }
  ["scope", "relation_scope", "workspace", "project"].forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) return;
    const from = scopeValue(before, field);
    const to = scopeValue(after, field);
    if (from && to && from !== to) risks.push(transitionRisk("cross-scope-move", "confirm", field, from, to, "对象的作用范围发生变化"));
  });
  const mounted = Boolean(record.sourceMount || record.mountId || record.source?.mountId || record.source?.kind === "mount");
  if (mounted && options.allowMountedWrite !== true) {
    risks.push(transitionRisk("mounted-source-write", "confirm", "source", "mount", "write", "这次修改会写回用户挂载目录中的原文件"));
  }
  if (sourceEnvelope?.cabinId === "assets" && targetEnvelope && targetEnvelope.cabinId !== "assets" && options.preserveSource !== true) {
    risks.push(transitionRisk("asset-source-loss", "block", "module", "assets", targetEnvelope.cabinId, "资产转换必须保留原资产并创建投影对象"));
  }
  const decision = risks.some((risk) => risk.severity === "block")
    ? "block"
    : risks.some((risk) => risk.severity === "confirm") ? "confirm" : "allow";
  return Object.freeze({
    decision,
    allowed: decision !== "block",
    confirmationRequired: decision === "confirm",
    risks: Object.freeze(risks),
    before: Object.freeze({ cabinId: sourceEnvelope?.cabinId || "", type: sourceEnvelope?.type || "", privacy: fromPrivacy }),
    after: Object.freeze({ cabinId: targetEnvelope?.cabinId || "", type: targetEnvelope?.type || "", privacy: toPrivacy })
  });
}

function operationId(kind, records, patch) {
  const identity = records.map((record) => recordEntityId(record) || record.path || record.title).join("|");
  return `object-op:${kind}:${stableHash(`${identity}:${JSON.stringify(patch || {})}`)}`;
}

function createObjectOperationPlan(input = {}) {
  const kind = cleanText(input.kind || "update").toLowerCase();
  if (!["update", "move", "split", "merge", "create", "archive", "link"].includes(kind)) {
    throw new TypeError("object operation kind is invalid");
  }
  const records = (Array.isArray(input.records) ? input.records : input.record ? [input.record] : []).filter(Boolean);
  if (kind !== "create" && !records.length) throw new TypeError("object operation requires at least one record");
  if (!input.registry?.resolveRecord) throw new TypeError("object operation requires a cabin registry");
  const patch = input.patch && typeof input.patch === "object" && !Array.isArray(input.patch) ? { ...input.patch } : {};
  const assessments = records.map((record) => assessObjectTransition(record, patch, input.registry, input.options || {}));
  const blocked = assessments.some((item) => item.decision === "block");
  const confirmationRequired = blocked || assessments.some((item) => item.confirmationRequired) || ["split", "merge", "move"].includes(kind);
  const checkpoint = freezeList(records.map((record) => ({
    entityId: recordEntityId(record),
    path: cleanText(record.path),
    type: recordType(record),
    frontmatter: Object.freeze({ ...recordFrontmatter(record) })
  })));
  return Object.freeze({
    id: operationId(kind, records, patch),
    schema: "magic-os-object-operation/v1",
    kind,
    status: blocked ? "blocked" : "review",
    blocked,
    confirmationRequired,
    transactionRequired: true,
    reversible: true,
    recordCount: records.length,
    patch: Object.freeze(patch),
    assessments: Object.freeze(assessments),
    checkpoint
  });
}

function normalizeViewport(viewport = {}) {
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  return Object.freeze({
    zoom: Math.min(8, Math.max(0.1, number(viewport.zoom, 1))),
    x: number(viewport.x),
    y: number(viewport.y),
    scrollTop: Math.max(0, number(viewport.scrollTop))
  });
}

function createWorkspaceCheckpoint(state = {}) {
  return Object.freeze({
    schema: "magic-os-workspace-checkpoint/v1",
    cabinId: cleanText(state.cabinId).toLowerCase(),
    viewId: cleanText(state.viewId).toLowerCase(),
    query: cleanText(state.query).slice(0, 500),
    scope: cleanText(state.scope).toLowerCase(),
    selectedEntityId: cleanText(state.selectedEntityId),
    selectedPath: cleanText(state.selectedPath),
    viewport: normalizeViewport(state.viewport),
    savedAt: cleanText(state.savedAt) || new Date().toISOString()
  });
}

function resolveWorkbenchRecord(snapshot, reference) {
  if (reference?.path) return reference;
  return resolveRecordReference(snapshot?.relationIndex?.lookup, reference);
}

function createObjectWorkbench(snapshot) {
  if (!snapshot?.registry || !snapshot?.index || !snapshot?.relationIndex) {
    throw new TypeError("object workbench requires a cabin snapshot");
  }
  return Object.freeze({
    inspect(reference) {
      const record = resolveWorkbenchRecord(snapshot, reference);
      return record ? buildObjectInspectorModel(snapshot, record) : null;
    },
    discover(options = {}) {
      return discoverUnprofiledObjects(snapshot.relationIndex, options);
    },
    assess(record, patch = {}, options = {}) {
      return assessObjectTransition(record, patch, snapshot.registry, options);
    },
    plan(input = {}) {
      return createObjectOperationPlan({ ...input, registry: snapshot.registry });
    }
  });
}

module.exports = {
  INSPECTOR_FIELD_GROUPS,
  PRIVACY_EXPOSURE,
  assessObjectTransition,
  buildObjectInspectorModel,
  createObjectOperationPlan,
  createObjectWorkbench,
  createWorkspaceCheckpoint,
  discoverUnprofiledObjects,
  displayValue,
  suggestedTypeForField
};
