"use strict";

function recordFrontmatter(record) {
  return record?.frontmatter && typeof record.frontmatter === "object" ? record.frontmatter : {};
}

function recordEntityId(record) {
  return String(recordFrontmatter(record).entity_id || "").trim();
}

function recordType(record) {
  const frontmatter = recordFrontmatter(record);
  return String(frontmatter.entity_kind || frontmatter.type || record?.type || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

function recordModule(record) {
  const frontmatter = recordFrontmatter(record);
  return String(frontmatter.module || frontmatter.module_id || record?.module || "").trim().toLowerCase();
}

function recordPathKey(value) {
  return String(value || "")
    .replace(/^!?\[\[/, "")
    .replace(/\]\]$/, "")
    .split("|")[0]
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\.md$/i, "")
    .trim()
    .toLowerCase();
}

function isAtomicAssetRecord(record) {
  const frontmatter = recordFrontmatter(record);
  const type = recordType(record);
  return recordModule(record) === "assets"
    && type.startsWith("asset-")
    && type !== "asset-collection"
    && Boolean(String(frontmatter.entity_id || "").trim());
}

function isKnowledgeCardRecord(record) {
  const type = recordType(record);
  const tags = Array.isArray(record?.tags) ? record.tags.map(String) : [];
  return type === "knowledge-card"
    || type === "learning-card"
    || tags.includes("#类型/知识卡片")
    || tags.includes("#type/knowledge-card");
}

function isPersonRecord(record) {
  const type = recordType(record);
  const tags = Array.isArray(record?.tags) ? record.tags.map(String) : [];
  return type === "person"
    || type === "people"
    || tags.includes("#类型/人物")
    || tags.includes("#type/person")
    || (recordModule(record) === "social" && /(?:^|\/)(?:人物档案|people)(?:\/|$)/i.test(String(record?.path || "")));
}

function isHealthRecord(record) {
  const frontmatter = recordFrontmatter(record);
  const type = recordType(record);
  const tags = Array.isArray(record?.tags) ? record.tags.map(String) : [];
  const explicitTag = tags.some((tag) => /(?:^#?(?:健康|health)\/|体检|用药|过敏|身体指标|medical|medication|allergy|vitals)/i.test(tag));
  if (type === "health-record" || String(frontmatter.health_type || "").trim() || explicitTag) return true;
  if (recordModule(record) !== "social") return false;
  const haystack = `${type} ${frontmatter.health_type || ""} ${tags.join(" ")} ${record?.path || ""}`.toLowerCase();
  return ["health", "medical", "weight", "allergy", "健康", "体检", "用药"].some((term) => haystack.includes(term));
}

function recordReferenceTokens(value) {
  if (Array.isArray(value)) return value.flatMap((item) => recordReferenceTokens(item));
  if (value && typeof value === "object") {
    return [value.target, value.path, value.person, value.patient, value.value, value.title, value.name, value.target_id, value.entity_id]
      .flatMap((item) => recordReferenceTokens(item));
  }
  const raw = String(value || "").trim();
  if (!raw) return [];
  const clean = raw.replace(/^!?\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
  return clean ? [clean] : [];
}

function recordIdentityTokens(record) {
  const frontmatter = recordFrontmatter(record);
  return [...new Set([
    record?.path,
    String(record?.path || "").replace(/\.md$/i, ""),
    record?.name,
    record?.title,
    frontmatter.title,
    frontmatter.name,
    frontmatter.entity_id,
    ...(Array.isArray(frontmatter.aliases) ? frontmatter.aliases : frontmatter.aliases ? [frontmatter.aliases] : [])
  ].map((value) => recordPathKey(value)).filter(Boolean))];
}

function recordReferenceMatches(value, record) {
  const identities = new Set(recordIdentityTokens(record));
  return recordReferenceTokens(value).some((token) => identities.has(recordPathKey(token)));
}

function buildRecordQueryIndex(records = [], options = {}) {
  const all = (Array.isArray(records) ? records : []).filter(Boolean);
  const byPath = new Map();
  const byPathKey = new Map();
  const byEntityId = new Map();
  const duplicateEntityIds = new Map();
  const byType = new Map();
  const byModule = new Map();
  const atomicAssetByEntityId = new Map();
  const atomicAssets = [];
  const knowledgeCards = [];
  const people = [];
  const healthRecords = [];
  const storyThreads = [];

  all.forEach((record) => {
    const path = String(record?.path || "").trim();
    const pathKey = recordPathKey(path);
    const entityId = recordEntityId(record);
    const type = recordType(record);
    const moduleId = recordModule(record);
    if (path && !byPath.has(path)) byPath.set(path, record);
    if (pathKey && !byPathKey.has(pathKey)) byPathKey.set(pathKey, record);
    if (entityId) {
      if (!byEntityId.has(entityId)) byEntityId.set(entityId, record);
      else {
        const duplicates = duplicateEntityIds.get(entityId) || [byEntityId.get(entityId)];
        duplicates.push(record);
        duplicateEntityIds.set(entityId, duplicates);
      }
    }
    if (type) {
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type).push(record);
    }
    if (moduleId) {
      if (!byModule.has(moduleId)) byModule.set(moduleId, []);
      byModule.get(moduleId).push(record);
    }
    if (isAtomicAssetRecord(record)) {
      atomicAssets.push(record);
      if (entityId && !atomicAssetByEntityId.has(entityId)) atomicAssetByEntityId.set(entityId, record);
    }
    if (isKnowledgeCardRecord(record)) knowledgeCards.push(record);
    if (isPersonRecord(record)) people.push(record);
    if (isHealthRecord(record)) healthRecords.push(record);
    if (typeof options.isStoryThreadRecord === "function" && options.isStoryThreadRecord(record)) storyThreads.push(record);
  });

  return {
    all,
    byPath,
    byPathKey,
    byEntityId,
    duplicateEntityIds,
    byType,
    byModule,
    atomicAssetByEntityId,
    atomicAssets,
    knowledgeCards,
    people,
    healthRecords,
    storyThreads
  };
}

function recordByPath(index, value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return index?.byPath?.get(raw) || index?.byPathKey?.get(recordPathKey(raw)) || null;
}

module.exports = {
  buildRecordQueryIndex,
  isAtomicAssetRecord,
  isHealthRecord,
  isKnowledgeCardRecord,
  isPersonRecord,
  recordByPath,
  recordEntityId,
  recordFrontmatter,
  recordIdentityTokens,
  recordModule,
  recordPathKey,
  recordReferenceMatches,
  recordReferenceTokens,
  recordType
};
