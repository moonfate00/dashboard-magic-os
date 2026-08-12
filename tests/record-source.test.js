"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  loadVaultRecords,
  normalizeTags,
  pathInsideRoot,
  recordFromVaultFile
} = require("../src/storage/record-source");

function file(path, mtime = 0) {
  const name = path.split("/").pop();
  return {
    path,
    name,
    basename: name.replace(/\.md$/i, ""),
    extension: "md",
    stat: { mtime }
  };
}

test("record source accepts only files inside the active storage root", async () => {
  const asset = file("MagicOS/Records/Assets/photo.md", 20);
  const privateNote = file("Personal/health.md", 30);
  const navigation = file("MagicOS/Records/Navigation/card.md", 10);
  const records = await loadVaultRecords({
    listMarkdownFiles: () => [privateNote, navigation, asset],
    metadataForFile: (candidate) => candidate === asset ? {
      frontmatter: { entity_id: "asset-1", entity_kind: "asset-image", module: "assets", title: "Flower" },
      tags: [{ tag: "#type/asset" }]
    } : { frontmatter: {} }
  }, { root: "MagicOS/Records/Assets" });
  assert.equal(records.length, 1);
  assert.equal(records[0].path, asset.path);
  assert.equal(records[0].frontmatter.entity_id, "asset-1");
  assert.deepEqual(records[0].tags, ["#type/asset"]);
});

test("path and record normalization are independent from interface language", () => {
  assert.equal(pathInsideRoot("Dashboard/Private/Modules/Assets/a.md", "Dashboard/Private/Modules/Assets"), true);
  assert.equal(pathInsideRoot("Dashboard/Private/Modules/Social/a.md", "Dashboard/Private/Modules/Assets"), false);
  const sourceFile = file("MagicOS/Records/Assets/photo.md", 42);
  const record = recordFromVaultFile(sourceFile, {
    frontmatter: { title: "花海", type: "asset-image", tags: ["#资产/图片"] },
    tags: [{ tag: "#类型/资产" }]
  });
  assert.equal(record.title, "花海");
  assert.equal(record.mtime, 42);
  assert.deepEqual(normalizeTags({ tags: [{ tag: "#类型/资产" }] }, record.frontmatter), ["#类型/资产", "#资产/图片"]);
});

test("record source rejects unsafe roots before scanning", async () => {
  await assert.rejects(() => loadVaultRecords({
    listMarkdownFiles: () => [],
    metadataForFile: () => ({})
  }, { root: "../Personal" }), /Unsafe vault path/);
});
