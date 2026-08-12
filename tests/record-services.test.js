"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildRecordQueryIndex,
  isHealthRecord,
  recordByPath,
  recordReferenceMatches,
  recordType
} = require("../src/services/record-query");
const {
  buildRecordRelationIndex,
  healthRecordsForPerson,
  relatedRecords
} = require("../src/services/record-relations");

const records = [
  {
    path: "MagicOS/Modules/Assets/Images/photo.md",
    title: "Flower photo",
    type: "asset-image",
    module: "assets",
    tags: ["#type/asset"],
    frontmatter: { entity_id: "asset-1", entity_kind: "asset-image", module: "assets" }
  },
  {
    path: "MagicOS/Modules/Assets/Shelves/travel.md",
    title: "Travel shelf",
    type: "asset-collection",
    module: "assets",
    tags: [],
    frontmatter: { entity_id: "shelf-1", type: "asset-collection", module: "assets", asset_members: ["asset-1"] }
  },
  {
    path: "MagicOS/Modules/Navigation/Learning/Cards/card.md",
    title: "Knowledge card",
    type: "knowledge-card",
    module: "navigation",
    tags: ["#type/knowledge-card"],
    frontmatter: { entity_id: "card-1", type: "knowledge-card", module: "navigation", related_thread: "[[MagicOS/Modules/Navigation/Threads/course|Course]]" }
  },
  {
    path: "MagicOS/Modules/Navigation/Threads/course.md",
    title: "Course thread",
    type: "course",
    module: "navigation",
    tags: [],
    frontmatter: { entity_id: "thread-1", type: "course", module: "navigation" }
  },
  {
    path: "MagicOS/Modules/Social/People/Mom.md",
    title: "Mom",
    name: "Mom",
    type: "person",
    module: "social",
    tags: ["#type/person"],
    frontmatter: { entity_id: "person-mom", type: "person", module: "social", aliases: ["Mother"] }
  },
  {
    path: "MagicOS/Modules/Social/Health/checkup.md",
    title: "Follow-up checkup",
    type: "health-record",
    module: "social",
    tags: ["#health/medical"],
    frontmatter: { entity_id: "health-1", type: "health-record", module: "social", person: "[[MagicOS/Modules/Social/People/Mom|Mom]]" }
  },
  {
    path: "MagicOS/Modules/Social/Health/stomach.md",
    title: "Stomach note",
    type: "health_record",
    module: "social",
    tags: [],
    frontmatter: { entity_id: "health-2", type: "health_record", module: "social", patient: { entity_id: "person-mom" } }
  },
  {
    path: "MagicOS/Modules/Memory/duplicate.md",
    title: "Duplicate ID",
    type: "note",
    module: "memory",
    tags: [],
    frontmatter: { entity_id: "asset-1", type: "note", module: "memory" }
  }
];

const index = buildRecordQueryIndex(records, {
  isStoryThreadRecord: (record) => ["course", "story-thread"].includes(recordType(record))
});
const relationIndex = buildRecordRelationIndex(index, {
  fieldRules: [
    { field: "related_thread", type: "thread-knowledge" },
    { field: "person", type: "person-health" },
    { field: "patient", type: "person-health" },
    { field: "asset_members", type: "collection-member" }
  ]
});

test("record index provides stable path, entity, type, and module lookups", () => {
  assert.equal(index.byEntityId.get("asset-1").title, "Flower photo");
  assert.equal(index.duplicateEntityIds.get("asset-1").length, 2);
  assert.equal(recordByPath(index, "[[MagicOS/Modules/Navigation/Learning/Cards/card|Card]]").frontmatter.entity_id, "card-1");
  assert.equal(index.byType.get("health-record").length, 2);
  assert.equal(index.byModule.get("social").length, 3);
});

test("domain collections share one classification contract", () => {
  assert.deepEqual(index.atomicAssets.map((record) => record.frontmatter.entity_id), ["asset-1"]);
  assert.deepEqual(index.knowledgeCards.map((record) => record.frontmatter.entity_id), ["card-1"]);
  assert.deepEqual(index.storyThreads.map((record) => record.frontmatter.entity_id), ["thread-1"]);
  assert.deepEqual(index.people.map((record) => record.frontmatter.entity_id), ["person-mom"]);
  assert.deepEqual(index.healthRecords.map((record) => record.frontmatter.entity_id), ["health-1", "health-2"]);
});

test("record references match paths, aliases, and stable entity IDs", () => {
  const person = index.byEntityId.get("person-mom");
  assert.equal(recordReferenceMatches("[[MagicOS/Modules/Social/People/Mom|Mom]]", person), true);
  assert.equal(recordReferenceMatches("Mother", person), true);
  assert.equal(recordReferenceMatches({ entity_id: "person-mom" }, person), true);
  assert.equal(recordReferenceMatches("Someone else", person), false);
});

test("one relation index serves people, learning threads, and shelves", () => {
  const person = index.byEntityId.get("person-mom");
  const thread = index.byEntityId.get("thread-1");
  const shelf = index.byEntityId.get("shelf-1");
  const asset = index.byEntityId.get("asset-1");
  assert.deepEqual(relatedRecords(relationIndex, person, { direction: "incoming", recordPredicate: isHealthRecord }).map((record) => record.frontmatter.entity_id), ["health-1", "health-2"]);
  assert.deepEqual(relatedRecords(relationIndex, thread, { direction: "incoming", types: ["thread-knowledge"] }).map((record) => record.frontmatter.entity_id), ["card-1"]);
  assert.deepEqual(relatedRecords(relationIndex, shelf, { direction: "outgoing", fields: ["asset_members"] }).map((record) => record.frontmatter.entity_id), ["asset-1"]);
  assert.deepEqual(relatedRecords(relationIndex, asset, { direction: "incoming", types: ["collection-member"] }).map((record) => record.frontmatter.entity_id), ["shelf-1"]);
  assert.deepEqual(healthRecordsForPerson(index, person, relationIndex).map((record) => record.frontmatter.entity_id), ["health-1", "health-2"]);
});

test("generic system health checks are not personal health records", () => {
  assert.equal(isHealthRecord({
    path: "MagicOS/System/health-check.md",
    type: "dashboard-health-report",
    module: "memory",
    tags: [],
    frontmatter: { type: "dashboard_health_report", module: "memory" }
  }), false);
});
