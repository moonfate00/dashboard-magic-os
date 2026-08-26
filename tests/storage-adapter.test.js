"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  AI_RECOVERY_ROOTS,
  createObsidianAIJournalPersistence,
  createObsidianStorageCapabilities
} = require("../src/storage/adapter");
const { PORTABLE_STORAGE_PROFILE } = require("../src/storage/profiles");

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

function atomicAdapterHarness() {
  const files = new Map();
  const folders = new Set();
  const calls = [];
  let failRenameToTarget = false;
  const adapter = {
    async exists(path) { return files.has(path) || folders.has(path); },
    async read(path) {
      if (!files.has(path)) throw new Error("missing");
      return files.get(path);
    },
    async write(path, content) { calls.push(["write", path]); files.set(path, content); },
    async rename(from, to) {
      calls.push(["rename", from, to]);
      if (failRenameToTarget && from.endsWith(".next") && to.endsWith(".json")) throw new Error("simulated crash");
      if (!files.has(from) || files.has(to)) throw new Error("rename conflict");
      files.set(to, files.get(from));
      files.delete(from);
    },
    async remove(path) { calls.push(["remove", path]); files.delete(path); },
    async list(root) {
      return { files: [...files.keys()].filter((path) => path.startsWith(`${root}/`)), folders: [] };
    }
  };
  const app = {
    vault: {
      adapter,
      async createFolder(path) { calls.push(["mkdir", path]); folders.add(path); }
    }
  };
  return {
    app,
    files,
    folders,
    calls,
    setFailRename(value) { failRenameToTarget = value; }
  };
}

test("journal persistence creates nothing during an empty startup scan", async () => {
  const harness = atomicAdapterHarness();
  const persistence = createObsidianAIJournalPersistence(harness.app, PORTABLE_STORAGE_PROFILE);
  assert.deepEqual(await persistence.readAll(), []);
  assert.equal(harness.folders.size, 0);
  assert.deepEqual(harness.calls, []);
});

test("journal persistence atomically creates and replaces a bounded entry", async () => {
  const harness = atomicAdapterHarness();
  const persistence = createObsidianAIJournalPersistence(harness.app, PORTABLE_STORAGE_PROFILE);
  await persistence.write({ id: "journal-1", status: "prepared" }, { createOnly: true });
  const target = `${AI_RECOVERY_ROOTS.portable}/journal-1.json`;
  assert.equal(harness.files.has(target), true);
  assert.equal(harness.files.has(`${target}.next`), false);
  await persistence.write({ id: "journal-1", status: "applying" });
  assert.deepEqual(await persistence.readAll(), [{ id: "journal-1", status: "applying" }]);
  assert.equal(harness.files.has(`${target}.prev`), false);
  await assert.rejects(
    persistence.write({ id: "journal-1", status: "duplicate" }, { createOnly: true }),
    /already exists/
  );
  assert.deepEqual(await persistence.readAll(), [{ id: "journal-1", status: "applying" }]);
});

test("failed replacement restores the last committed journal", async () => {
  const harness = atomicAdapterHarness();
  const persistence = createObsidianAIJournalPersistence(harness.app, PORTABLE_STORAGE_PROFILE);
  await persistence.write({ id: "journal-1", status: "prepared" }, { createOnly: true });
  harness.setFailRename(true);
  await assert.rejects(persistence.write({ id: "journal-1", status: "applying" }), /atomic write failed/);
  harness.setFailRename(false);
  assert.deepEqual(await persistence.readAll(), [{ id: "journal-1", status: "prepared" }]);
});

test("startup reconciliation restores previous commit and discards uncommitted next slot", async () => {
  const harness = atomicAdapterHarness();
  const root = AI_RECOVERY_ROOTS.portable;
  harness.folders.add(root);
  harness.files.set(`${root}/journal-1.json.prev`, JSON.stringify({ id: "journal-1", status: "prepared" }));
  harness.files.set(`${root}/journal-1.json.next`, JSON.stringify({ id: "journal-1", status: "applying" }));
  const persistence = createObsidianAIJournalPersistence(harness.app, PORTABLE_STORAGE_PROFILE);
  assert.deepEqual(await persistence.readAll(), [{ id: "journal-1", status: "prepared" }]);
  assert.equal(harness.files.has(`${root}/journal-1.json`), true);
  assert.equal(harness.files.has(`${root}/journal-1.json.next`), false);
  assert.equal(harness.files.has(`${root}/journal-1.json.prev`), false);
});

test("journal persistence rejects arbitrary profiles and unsafe ids", async () => {
  const harness = atomicAdapterHarness();
  assert.throws(() => createObsidianAIJournalPersistence(harness.app, { id: "custom" }), /supported storage profile/);
  const persistence = createObsidianAIJournalPersistence(harness.app, PORTABLE_STORAGE_PROFILE);
  await assert.rejects(persistence.write({ id: "../../outside" }), /journal id is invalid/);
  assert.equal(harness.folders.size, 0);
});

test("concurrent create-only calls cannot share or overwrite the next slot", async () => {
  const harness = atomicAdapterHarness();
  const persistence = createObsidianAIJournalPersistence(harness.app, PORTABLE_STORAGE_PROFILE);
  const [first, second] = await Promise.allSettled([
    persistence.write({ id: "journal-1", owner: "first" }, { createOnly: true }),
    persistence.write({ id: "journal-1", owner: "second" }, { createOnly: true })
  ]);
  assert.equal(first.status, "fulfilled");
  assert.equal(second.status, "rejected");
  assert.deepEqual(await persistence.readAll(), [{ id: "journal-1", owner: "first" }]);
});
