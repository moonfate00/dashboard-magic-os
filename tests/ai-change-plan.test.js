"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_FILE_BYTES,
  createAIChangeProtocol,
  validateChangePlan
} = require("../src/services/ai-change-plan");
const { PORTABLE_STORAGE_PROFILE } = require("../src/storage/profiles");

function createStorage(initial = {}, options = {}) {
  const files = new Map(Object.entries(initial));
  const folders = new Set([
    "MagicOS/Records/Command",
    "MagicOS/Records/Assets",
    "MagicOS/Records/Social",
    "MagicOS/Records/Navigation",
    "MagicOS/Records/Memory"
  ]);
  const writes = [];
  let mutationCount = 0;
  async function mutate(kind, path, content) {
    mutationCount += 1;
    writes.push({ kind, path });
    if (options.failMutation === mutationCount) throw new Error("private storage failure");
    files.set(path, content);
    if (options.failAfterMutation === mutationCount) throw new Error("private post-write failure");
  }
  return {
    files,
    folders,
    writes,
    capabilities: {
      async exists(path) { return files.has(path) || folders.has(path); },
      async read(path) {
        if (!files.has(path)) throw new Error("missing");
        return files.get(path);
      },
      async create(path, content) {
        if (files.has(path)) throw new Error("exists");
        await mutate("create", path, content);
      },
      async modify(path, content) {
        if (!files.has(path)) throw new Error("missing");
        if (options.failRollback && content === options.rollbackContent) throw new Error("private rollback failure");
        await mutate("modify", path, content);
      },
      async remove(path) {
        writes.push({ kind: "remove", path });
        if (options.failRemove) throw new Error("private rollback failure");
        files.delete(path);
      }
    }
  };
}

function plan(operations) {
  return { version: 1, id: "plan-1", featureId: "assistant", operations };
}

function protocol(storage, options = {}) {
  return createAIChangeProtocol({
    capabilities: storage.capabilities,
    profile: PORTABLE_STORAGE_PROFILE,
    randomId: () => "confirmation-1",
    now: options.now || (() => Date.parse("2026-08-12T00:00:00.000Z")),
    confirmationTtlMs: options.confirmationTtlMs,
    onTransition: options.onTransition
  });
}

test("preview validates a bounded managed-record plan without touching storage", () => {
  const storage = createStorage();
  const service = protocol(storage);
  const preview = service.preview(plan([
    { kind: "create", path: "MagicOS/Records/Memory/idea.md", content: "# Idea" }
  ]));
  assert.deepEqual(preview.summary, { operations: 1, creates: 1, updates: 0, totalBytes: 6 });
  assert.equal(Object.isFrozen(preview), true);
  assert.deepEqual(storage.writes, []);
});

test("validation rejects traversal, system paths, deletion, duplicates, binary paths, and oversized content", () => {
  const invalidPlans = [
    plan([{ kind: "create", path: "MagicOS/Records/Memory/../../System/a.md", content: "x" }]),
    plan([{ kind: "create", path: "MagicOS/System/AI-Knowledge/a.md", content: "x" }]),
    plan([{ kind: "delete", path: "MagicOS/Records/Memory/a.md", content: "" }]),
    plan([
      { kind: "create", path: "MagicOS/Records/Memory/a.md", content: "x" },
      { kind: "update", path: "MagicOS/Records/Memory/a.md", content: "y" }
    ]),
    plan([{ kind: "create", path: "MagicOS/Records/Assets/a.png", content: "x" }]),
    plan([{ kind: "create", path: "MagicOS/Records/Memory/.hidden.md", content: "x" }]),
    plan([{ kind: "create", path: "MagicOS/Records/Memory/large.md", content: "x".repeat(MAX_FILE_BYTES + 1) }])
  ];
  invalidPlans.forEach((candidate) => {
    assert.throws(() => validateChangePlan(candidate, { profile: PORTABLE_STORAGE_PROFILE }), (error) => error.code === "validation");
  });
});

test("prepare freezes originals and apply requires explicit single-use confirmation", async () => {
  const storage = createStorage({ "MagicOS/Records/Memory/existing.md": "before" });
  const transitions = [];
  const service = protocol(storage, { onTransition: async (event) => transitions.push(event) });
  const prepared = await service.prepare(plan([
    { id: "one", kind: "update", path: "MagicOS/Records/Memory/existing.md", content: "after" },
    { id: "two", kind: "create", path: "MagicOS/Records/Memory/new.md", content: "new" }
  ]));
  await assert.rejects(service.apply(prepared.confirmation), (error) => error.code === "confirmation-required");
  const result = await service.apply(prepared.confirmation, { confirmed: true });
  assert.equal(result.status, "applied");
  assert.equal(storage.files.get("MagicOS/Records/Memory/existing.md"), "after");
  assert.equal(storage.files.get("MagicOS/Records/Memory/new.md"), "new");
  assert.equal(JSON.stringify(result).includes("before"), false);
  assert.equal(JSON.stringify(result).includes('"content"'), false);
  assert.deepEqual(transitions.map(({ status }) => status), ["prepared", "applying", "applied"]);
  await assert.rejects(service.apply(prepared.confirmation, { confirmed: true }), (error) => error.code === "confirmation-used");
});

test("confirmation cannot be forged, replayed concurrently, used after cancellation, or used after expiry", async () => {
  const storage = createStorage();
  let clock = 1000;
  const service = protocol(storage, { now: () => clock, confirmationTtlMs: 1000 });
  await assert.rejects(service.apply({ id: "confirmation-1" }, { confirmed: true }), (error) => error.code === "confirmation-required");

  const cancelled = await service.prepare(plan([{ kind: "create", path: "MagicOS/Records/Memory/a.md", content: "a" }]));
  assert.equal(service.cancel(cancelled.confirmation).status, "cancelled");
  await assert.rejects(service.apply(cancelled.confirmation, { confirmed: true }), (error) => error.code === "confirmation-used");

  const expiring = await service.prepare(plan([{ kind: "create", path: "MagicOS/Records/Memory/b.md", content: "b" }]));
  clock = 2001;
  await assert.rejects(service.apply(expiring.confirmation, { confirmed: true }), (error) => error.code === "confirmation-expired");

  clock = 3000;
  const concurrent = await service.prepare(plan([{ kind: "create", path: "MagicOS/Records/Memory/c.md", content: "c" }]));
  const first = service.apply(concurrent.confirmation, { confirmed: true });
  const second = service.apply(concurrent.confirmation, { confirmed: true });
  await assert.rejects(second, (error) => error.code === "confirmation-used");
  assert.equal((await first).status, "applied");
});

test("a target changed after preview is rejected without overwriting it", async () => {
  const path = "MagicOS/Records/Memory/existing.md";
  const storage = createStorage({ [path]: "before" });
  const service = protocol(storage);
  const prepared = await service.prepare(plan([{ kind: "update", path, content: "AI content" }]));
  storage.files.set(path, "user edit");
  await assert.rejects(service.apply(prepared.confirmation, { confirmed: true }), (error) => (
    error.code === "conflict" && error.outcome === "failed"
  ));
  assert.equal(storage.files.get(path), "user edit");
  assert.deepEqual(storage.writes, []);
});

test("partial application failure restores prior writes in reverse order", async () => {
  const first = "MagicOS/Records/Memory/first.md";
  const second = "MagicOS/Records/Memory/second.md";
  const storage = createStorage({ [first]: "original" }, { failMutation: 2 });
  const service = protocol(storage);
  const prepared = await service.prepare(plan([
    { kind: "update", path: first, content: "changed" },
    { kind: "create", path: second, content: "new" }
  ]));
  await assert.rejects(service.apply(prepared.confirmation, { confirmed: true }), (error) => (
    error.code === "application-failed" && error.outcome === "rolled-back"
  ));
  assert.equal(storage.files.get(first), "original");
  assert.equal(storage.files.has(second), false);
  assert.deepEqual(storage.writes.map(({ kind }) => kind), ["modify", "create", "modify"]);
});

test("a write that mutates then rejects is detected and rolled back", async () => {
  const path = "MagicOS/Records/Memory/new.md";
  const storage = createStorage({}, { failAfterMutation: 1 });
  const service = protocol(storage);
  const prepared = await service.prepare(plan([{ kind: "create", path, content: "new" }]));
  await assert.rejects(service.apply(prepared.confirmation, { confirmed: true }), (error) => (
    error.code === "application-failed" && error.outcome === "rolled-back"
  ));
  assert.equal(storage.files.has(path), false);
  assert.deepEqual(storage.writes.map(({ kind }) => kind), ["create", "remove"]);
});

test("rollback conflicts are surfaced without deleting or overwriting unknown content", async () => {
  const first = "MagicOS/Records/Memory/first.md";
  const second = "MagicOS/Records/Memory/second.md";
  const storage = createStorage({}, { failMutation: 2, failRemove: true });
  const service = protocol(storage);
  const prepared = await service.prepare(plan([
    { kind: "create", path: first, content: "one" },
    { kind: "create", path: second, content: "two" }
  ]));
  await assert.rejects(service.apply(prepared.confirmation, { confirmed: true }), (error) => {
    assert.equal(error.code, "rollback-failed");
    assert.equal(error.outcome, "rollback-failed");
    assert.equal(JSON.stringify(error).includes("one"), false);
    return true;
  });
  assert.equal(storage.files.get(first), "one");
});

test("an uncertain rejected write is reported for recovery instead of overwriting unknown content", async () => {
  const path = "MagicOS/Records/Memory/existing.md";
  const storage = createStorage({ [path]: "original" });
  storage.capabilities.modify = async (target) => {
    storage.files.set(target, "concurrent unknown edit");
    throw new Error("private ambiguous failure");
  };
  const service = protocol(storage);
  const prepared = await service.prepare(plan([{ kind: "update", path, content: "AI content" }]));
  await assert.rejects(service.apply(prepared.confirmation, { confirmed: true }), (error) => (
    error.code === "rollback-failed" && error.outcome === "rollback-failed"
  ));
  assert.equal(storage.files.get(path), "concurrent unknown edit");
});

test("transition projection failures cannot interrupt a required rollback", async () => {
  const first = "MagicOS/Records/Memory/first.md";
  const second = "MagicOS/Records/Memory/second.md";
  const storage = createStorage({ [first]: "original" }, { failMutation: 2 });
  const service = protocol(storage, { onTransition: async () => { throw new Error("private projection failure"); } });
  const prepared = await service.prepare(plan([
    { kind: "update", path: first, content: "changed" },
    { kind: "create", path: second, content: "new" }
  ]));
  await assert.rejects(service.apply(prepared.confirmation, { confirmed: true }), (error) => error.outcome === "rolled-back");
  assert.equal(storage.files.get(first), "original");
  assert.equal(storage.files.has(second), false);
});
