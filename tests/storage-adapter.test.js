"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createObsidianStorageCapabilities } = require("../src/storage/adapter");

test("Obsidian storage capabilities use vault APIs and recoverable trash for rollback removal", async () => {
  const files = new Map([["MagicOS/Records/Memory/a.md", { path: "MagicOS/Records/Memory/a.md", content: "before" }]]);
  const trashed = [];
  const vault = {
    getAbstractFileByPath(path) { return files.get(path) || null; },
    adapter: { async exists(path) { return files.has(path); } },
    async createFolder(path) { files.set(path, { path, folder: true }); },
    async read(file) { return file.content; },
    async create(path, content) {
      const file = { path, content };
      files.set(path, file);
      return file;
    },
    async modify(file, content) { file.content = content; },
    async trash(file, system) {
      trashed.push({ path: file.path, system });
      files.delete(file.path);
    }
  };
  const storage = createObsidianStorageCapabilities({ vault });
  assert.equal(await storage.read("MagicOS/Records/Memory/a.md"), "before");
  await storage.modify("MagicOS/Records/Memory/a.md", "after");
  assert.equal(await storage.read("MagicOS/Records/Memory/a.md"), "after");
  await storage.create("MagicOS/Records/Memory/b.md", "new");
  assert.equal(await storage.exists("MagicOS/Records/Memory/b.md"), true);
  await storage.remove("MagicOS/Records/Memory/b.md");
  assert.deepEqual(trashed, [{ path: "MagicOS/Records/Memory/b.md", system: true }]);
  assert.equal(await storage.exists("MagicOS/Records/Memory/b.md"), false);
});
