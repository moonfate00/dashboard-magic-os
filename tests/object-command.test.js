"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createCabinRegistry } = require("../src/kernel/cabin-registry");
const { createAIChangeProtocol } = require("../src/services/ai-change-plan");
const { applyObjectPatch, createObjectCommandExecutor } = require("../src/services/object-command");
const { PORTABLE_STORAGE_PROFILE } = require("../src/storage/profiles");

function harness(initial, options = {}) {
  const files = new Map(Object.entries(initial));
  const folders = new Set(Object.keys(initial).map((path) => path.split("/").slice(0, -1).join("/")));
  const transitions = [];
  const capabilities = {
    async exists(path) { return files.has(path) || folders.has(path); },
    async read(path) { return files.get(path); },
    async create(path, content) { files.set(path, content); },
    async modify(path, content) {
      if (options.failPath === path && content.includes('"status":"changed"')) throw new Error("simulated write failure");
      files.set(path, content);
    },
    async remove(path) { files.delete(path); }
  };
  const records = new Map(Object.keys(initial).map((path) => {
    const frontmatter = JSON.parse(initial[path]);
    return [path, { path, title: frontmatter.title || path, frontmatter, module: frontmatter.module, type: frontmatter.type }];
  }));
  const executor = createObjectCommandExecutor({
    registry: createCabinRegistry(),
    resolveRecord: (path) => records.get(path),
    readContent: (record) => files.get(record.path),
    parseFrontmatter: (content) => JSON.parse(content),
    composeContent: (_content, frontmatter) => JSON.stringify(frontmatter),
    createProtocol: ({ allowedPaths }) => createAIChangeProtocol({
      capabilities,
      profile: PORTABLE_STORAGE_PROFILE,
      allowedPaths,
      randomId: () => `confirmation-${transitions.length + 1}`,
      onTransition: async (event) => transitions.push(event.status)
    }),
    onApplied: async (paths) => paths.forEach((path) => {
      const frontmatter = JSON.parse(files.get(path));
      records.set(path, { ...records.get(path), frontmatter, module: frontmatter.module, type: frontmatter.type });
    })
  });
  return { executor, files, records, transitions };
}

test("frontmatter patches are immutable and support explicit field removal", () => {
  const before = { status: "active", tags: ["one"], legacy: true };
  const after = applyObjectPatch(before, { status: "done", tags: ["two"] }, ["legacy"]);
  assert.deepEqual(after, { status: "done", tags: ["two"] });
  assert.deepEqual(before, { status: "active", tags: ["one"], legacy: true });
});

test("manual object commands use the reviewed exact-path transaction and expose no record content", async () => {
  const path = "Legacy/People/A.md";
  const state = harness({
    [path]: JSON.stringify({ entity_id: "person-a", type: "person", module: "social", privacy: "private", title: "A" })
  });
  const record = state.records.get(path);
  const prepared = await state.executor.prepare({ origin: "manual", kind: "update", record, patch: { privacy: "public" } });
  assert.equal(prepared.confirmationRequired, true);
  assert.equal(JSON.stringify(prepared).includes("person-a"), false);
  await assert.rejects(state.executor.apply(prepared), (error) => error.code === "confirmation-required");
  const retry = await state.executor.prepare({ origin: "manual", kind: "update", record, patch: { privacy: "public" } });
  const result = await state.executor.apply(retry, { confirmed: true });
  assert.equal(result.status, "applied");
  assert.equal(JSON.parse(state.files.get(path)).privacy, "public");
  assert.deepEqual(state.transitions.slice(-3), ["prepared", "applying", "applied"]);
});

test("a multi-record relation command rolls back the first record when the second write fails", async () => {
  const firstPath = "Legacy/People/A.md";
  const secondPath = "Legacy/People/B.md";
  const first = JSON.stringify({ entity_id: "person-a", type: "person", module: "social", privacy: "private", status: "active" });
  const second = JSON.stringify({ entity_id: "person-b", type: "person", module: "social", privacy: "private", status: "active" });
  const state = harness({ [firstPath]: first, [secondPath]: second }, { failPath: secondPath });
  const prepared = await state.executor.prepare({
    origin: "agent",
    kind: "link",
    changes: [
      { record: state.records.get(firstPath), patch: { status: "changed" } },
      { record: state.records.get(secondPath), patch: { status: "changed" } }
    ]
  });
  await assert.rejects(state.executor.apply(prepared, { confirmed: true }), (error) => error.code === "application-failed");
  assert.equal(state.files.get(firstPath), first);
  assert.equal(state.files.get(secondPath), second);
});

test("object creation uses the same exact-path transaction without exposing content", async () => {
  const path = "Legacy/Study/New note.md";
  const state = harness({
    "Legacy/Study/Existing.md": JSON.stringify({ type: "source-note", module: "navigation", title: "Existing" })
  });
  const frontmatter = {
    entity_id: "study-new",
    entity_kind: "source-note",
    type: "source-note",
    module: "navigation",
    title: "New note"
  };
  const content = JSON.stringify(frontmatter);
  const prepared = await state.executor.prepareCreate({
    origin: "manual",
    creates: [{
      path,
      content,
      record: { path, title: "New note", type: "source-note", module: "navigation", frontmatter }
    }]
  });
  assert.equal(prepared.status, "prepared");
  assert.equal(prepared.mutation.creates, 1);
  assert.equal(JSON.stringify(prepared).includes(content), false);
  const result = await state.executor.apply(prepared, { confirmed: true });
  assert.equal(result.status, "applied");
  assert.equal(state.files.get(path), content);
  assert.deepEqual(state.transitions.slice(-3), ["prepared", "applying", "applied"]);
});
