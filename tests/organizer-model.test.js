"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildOrganizerModel, queryMatches } = require("../src/apps/organizer/model");

function record(id, type, title, extra = {}) {
  return {
    path: `MagicOS/Records/Assets/${id}.md`,
    title,
    name: title,
    type,
    module: "assets",
    tags: extra.tags || [],
    mtime: extra.mtime || 0,
    frontmatter: {
      entity_id: id,
      entity_kind: type,
      type,
      module: "assets",
      title,
      ...extra.frontmatter
    }
  };
}

const records = [
  record("image-1", "asset-image", "Flower", {
    tags: ["#topic/travel"],
    frontmatter: { topic: "travel", canonical_path: "MagicOS/Assets/flower.png" }
  }),
  record("pdf-1", "asset-pdf", "Guide", { frontmatter: { topic: "travel", canonical_path: "MagicOS/Assets/guide.pdf" } }),
  record("audio-1", "asset-audio", "Interview", { frontmatter: { topic: "people" } }),
  record("child", "asset-collection", "Photos", {
    frontmatter: { asset_members: ["image-1"] }
  }),
  record("root", "asset-collection", "Travel", {
    frontmatter: { asset_members: ["child", "pdf-1", "missing-id"], shelf_order: 1 }
  }),
  record("dynamic", "asset-collection", "Travel query", {
    frontmatter: {
      collection_mode: "query",
      include_query: { topic: "travel" },
      exclude_query: { asset_type: ["asset-pdf"] },
      shelf_order: 2
    }
  }),
  record("hybrid", "asset-collection", "Mixed", {
    frontmatter: { collection_mode: "hybrid", asset_members: ["audio-1"], include_query: { topic: "travel" }, shelf_order: 3 }
  })
];

test("organizer derives roots, child collections, and unresolved members", () => {
  const model = buildOrganizerModel(records);
  assert.deepEqual(model.roots.map((item) => item.id), ["root", "dynamic", "hybrid"]);
  const root = model.byId.get("root");
  assert.equal(root.resolvedCount, 2);
  assert.equal(root.fixedCount, 3);
  assert.equal(root.missingCount, 1);
  assert.equal(root.childCount, 1);
  assert.equal(model.byId.get("child").parentId, "root");
});

test("dynamic and hybrid collections reuse atomic asset records", () => {
  const model = buildOrganizerModel(records);
  const dynamic = model.byId.get("dynamic");
  assert.deepEqual(dynamic.members.map((member) => member.id), ["image-1"]);
  assert.equal(dynamic.dynamicCount, 1);
  assert.deepEqual(model.byId.get("hybrid").members.map((member) => member.id), ["audio-1", "image-1", "pdf-1"]);
});

test("query matching supports tags and language-neutral metadata fields", () => {
  assert.equal(queryMatches(records[0], { tags: ["#topic/travel"], topic: "travel" }), true);
  assert.equal(queryMatches(records[0], { topic: "people" }), false);
  assert.equal(queryMatches(records[1], { asset_type: ["asset-pdf"] }), true);
});
