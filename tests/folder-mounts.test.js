"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_FOLDER_MOUNTS,
  folderMountRoots,
  followFolderMountRename,
  normalizeFolderMount,
  normalizeFolderMounts,
  normalizeMountPath,
  resolveFolderMount,
  summarizeFolderMount,
  suggestFolderMount
} = require("../src/storage/folder-mounts");

function mount(path, overrides = {}) {
  return normalizeFolderMount({
    id: `mount-${path.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-source`,
    path,
    ...overrides
  });
}

test("arbitrary existing folders normalize into a bounded read-only mount contract", () => {
  const value = normalizeFolderMount({
    id: "mount-knowledge-01",
    path: "10-wiki/公考",
    module: "navigation",
    role: "knowledge",
    aiScope: "manual"
  });
  assert.deepEqual(value, {
    id: "mount-knowledge-01",
    path: "10-wiki/公考",
    module: "navigation",
    role: "knowledge",
    aiScope: "manual",
    enabled: true
  });
  assert.equal(Object.isFrozen(value), true);
  assert.throws(() => normalizeMountPath("../outside"), /Unsafe vault path/);
  assert.throws(() => normalizeMountPath(".obsidian/plugins"), /not eligible/);
});

test("brownfield folder suggestions cover knowledge, media, people, tasks, and StoryLine without moving them", () => {
  assert.deepEqual(suggestFolderMount("00-raw/02-transcripts"), { module: "navigation", role: "raw" });
  assert.deepEqual(suggestFolderMount("10-wiki/公考"), { module: "navigation", role: "knowledge" });
  assert.deepEqual(suggestFolderMount("40-outputs/articles"), { module: "navigation", role: "output" });
  assert.deepEqual(suggestFolderMount("media-lib"), { module: "assets", role: "media" });
  assert.deepEqual(suggestFolderMount("家人/健康"), { module: "social", role: "health" });
  assert.deepEqual(suggestFolderMount("StoryLine/青云问道"), { module: "navigation", role: "story" });
  assert.deepEqual(suggestFolderMount("我的旧资料"), { module: "auto", role: "library" });
});

test("mount normalization drops unsafe and duplicate local state instead of breaking plugin load", () => {
  const values = [
    mount("10-wiki"),
    { ...mount("10-wiki"), id: "mount-duplicate-path" },
    { id: "mount-unsafe-source", path: "../outside" },
    ...Array.from({ length: MAX_FOLDER_MOUNTS + 10 }, (_, index) => ({
      id: `mount-generated-${String(index).padStart(3, "0")}`,
      path: `Archive/${index}`
    }))
  ];
  const normalized = normalizeFolderMounts(values);
  assert.equal(normalized.length, MAX_FOLDER_MOUNTS);
  assert.equal(normalized.filter((item) => item.path === "10-wiki").length, 1);
  assert.equal(normalized.some((item) => item.path.includes("..")), false);
});

test("cabins consume defaults plus only matching or auto mounts", () => {
  const mounts = [
    mount("10-wiki", { module: "navigation", role: "knowledge" }),
    mount("media-lib", { module: "assets", role: "media" }),
    mount("Shared", { module: "auto", role: "library" }),
    mount("Disabled", { module: "social", enabled: false })
  ];
  assert.deepEqual(folderMountRoots(mounts, ["navigation"]), ["10-wiki", "Shared"]);
  assert.deepEqual(folderMountRoots(mounts, ["assets"]), ["media-lib", "Shared"]);
  assert.deepEqual(folderMountRoots(mounts), ["10-wiki", "media-lib", "Shared"]);
});

test("the most specific mount owns provenance and folder renames preserve stable mount ids", () => {
  const parent = mount("Knowledge", { module: "auto", role: "library" });
  const child = mount("Knowledge/Exam", { module: "navigation", role: "knowledge" });
  assert.equal(resolveFolderMount("Knowledge/Exam/card.md", [parent, child]).id, child.id);
  const renamed = followFolderMountRename([parent, child], "Knowledge", "Library");
  assert.deepEqual(renamed.map(({ id, path }) => ({ id, path })), [
    { id: parent.id, path: "Library" },
    { id: child.id, path: "Library/Exam" }
  ]);
});

test("mount summaries count metadata without reading note bodies or double-counting nested mounts", () => {
  const parent = mount("10-wiki", { module: "navigation", role: "knowledge" });
  const child = mount("10-wiki/公考", { module: "navigation", role: "knowledge" });
  const records = [
    { path: "10-wiki/index.md", ext: "md", mtime: 10 },
    { path: "10-wiki/生活/日记.md", ext: "md", mtime: 20 },
    { path: "10-wiki/生活/封面.png", ext: "png", mtime: 30 },
    { path: "10-wiki/公考/申论.md", ext: "md", mtime: 40 },
    { path: "outside.md", ext: "md", mtime: 50 }
  ];
  assert.deepEqual(summarizeFolderMount(parent, records, [parent, child]), {
    mountId: parent.id,
    path: "10-wiki",
    totalFiles: 3,
    markdownFiles: 2,
    mediaFiles: 1,
    otherFiles: 0,
    branchCount: 1,
    newestMtime: 30
  });
  assert.equal(summarizeFolderMount(child, records, [parent, child]).totalFiles, 1);
});
