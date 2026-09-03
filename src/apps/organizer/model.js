"use strict";

const { fallbackMediaDescriptors } = require("../../services/media-preview");
const {
  buildRecordQueryIndex,
  isAtomicAssetRecord,
  recordEntityId,
  recordFrontmatter,
  recordType
} = require("../../services/record-query");
const {
  buildRecordRelationIndex,
  relatedRecords
} = require("../../services/record-relations");
const { buildCabinShellModel } = require("../../ui/shared-shell");

function queryCondition(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function queryMatches(record, condition) {
  if (!queryCondition(condition)) return false;
  const frontmatter = recordFrontmatter(record);
  const tags = [...new Set([
    ...(Array.isArray(record?.tags) ? record.tags : []),
    ...(Array.isArray(frontmatter.tags) ? frontmatter.tags : frontmatter.tags ? [frontmatter.tags] : [])
  ].map(String))];
  if (Array.isArray(condition.tags) && condition.tags.length
    && !condition.tags.map(String).some((tag) => tags.includes(tag))) return false;
  if (Array.isArray(condition.asset_type) && condition.asset_type.length) {
    const current = String(frontmatter.asset_type || frontmatter.entity_kind || frontmatter.type || "").toLowerCase();
    if (!condition.asset_type.map((item) => String(item).toLowerCase()).includes(current)) return false;
  }
  return ["source_type", "hub", "domain", "topic"].every((field) => (
    !condition[field] || String(frontmatter[field] || "") === String(condition[field])
  ));
}

function dynamicMembers(collection, atomicAssets) {
  const frontmatter = recordFrontmatter(collection);
  const mode = String(frontmatter.collection_mode || "manual");
  if (!["query", "hybrid"].includes(mode)) return [];
  const include = queryCondition(frontmatter.include_query);
  if (!include) return [];
  const exclude = queryCondition(frontmatter.exclude_query);
  return atomicAssets.filter((record) => queryMatches(record, include) && !(exclude && queryMatches(record, exclude)));
}

function uniqueRecords(records) {
  return Array.from(new Map(records.filter((record) => record?.path).map((record) => [record.path, record])).values());
}

function memberPreview(record) {
  const frontmatter = recordFrontmatter(record);
  return {
    id: recordEntityId(record),
    record,
    type: recordType(record) || "asset",
    title: String(frontmatter.title || record?.title || record?.name || ""),
    summary: String(frontmatter.summary || frontmatter.description || frontmatter.excerpt || ""),
    tags: Array.isArray(record?.tags) ? record.tags.map(String) : [],
    media: fallbackMediaDescriptors(frontmatter)
  };
}

function buildOrganizerModel(records = [], options = {}) {
  const sharedSnapshot = options.cabinRuntime?.snapshot?.(records, {
    relations: { fieldRules: [{ field: "asset_members", type: "collection-member" }] }
  });
  const recordIndex = sharedSnapshot?.index || buildRecordQueryIndex(records);
  const relationIndex = sharedSnapshot?.relationIndex || buildRecordRelationIndex(recordIndex, {
    fieldRules: [{ field: "asset_members", type: "collection-member" }]
  });
  const collections = (recordIndex.byType.get("asset-collection") || []).filter((record) => recordEntityId(record));
  const collectionIds = new Set(collections.map(recordEntityId));

  const items = collections.map((record) => {
    const frontmatter = recordFrontmatter(record);
    const fixedIds = (Array.isArray(frontmatter.asset_members) ? frontmatter.asset_members : []).map(String).filter(Boolean);
    const fixedMembers = relatedRecords(relationIndex, record, { direction: "outgoing", fields: ["asset_members"] });
    const automaticMembers = dynamicMembers(record, recordIndex.atomicAssets);
    const members = uniqueRecords([...fixedMembers, ...automaticMembers]);
    const parent = relatedRecords(relationIndex, record, {
      direction: "incoming",
      fields: ["asset_members"],
      recordPredicate: (candidate) => recordType(candidate) === "asset-collection"
    }).find((candidate) => collectionIds.has(recordEntityId(candidate))) || null;
    const typeStats = members.reduce((stats, member) => {
      const type = recordType(member) || "asset";
      stats[type] = (stats[type] || 0) + 1;
      return stats;
    }, {});
    const previews = members.map(memberPreview);
    const coverMembers = previews.filter((member) => member.type === "asset-image").slice(0, 4);
    return {
      id: recordEntityId(record),
      record,
      title: String(frontmatter.title || record?.title || record?.name || ""),
      description: String(frontmatter.summary || frontmatter.description || ""),
      mode: String(frontmatter.collection_mode || "manual"),
      order: Number.isFinite(Number(frontmatter.shelf_order)) ? Number(frontmatter.shelf_order) : 9999,
      fixedCount: fixedIds.length,
      dynamicCount: automaticMembers.length,
      resolvedCount: members.length,
      missingCount: Math.max(0, fixedIds.length - fixedMembers.length),
      childCount: members.filter((member) => recordType(member) === "asset-collection").length,
      parentId: parent ? recordEntityId(parent) : "",
      parentTitle: parent ? String(recordFrontmatter(parent).title || parent.title || parent.name || "") : "",
      typeStats,
      coverMembers,
      members: previews
    };
  }).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title) || Number(b.record?.mtime || 0) - Number(a.record?.mtime || 0));

  return {
    recordIndex,
    relationIndex,
    shell: sharedSnapshot ? buildCabinShellModel(sharedSnapshot, "assets", options.shell) : null,
    collections: items,
    roots: items.filter((item) => !item.parentId),
    byId: new Map(items.map((item) => [item.id, item]))
  };
}

module.exports = {
  buildOrganizerModel,
  dynamicMembers,
  memberPreview,
  queryCondition,
  queryMatches
};
