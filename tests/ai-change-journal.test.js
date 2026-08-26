"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createAIChangeJournal } = require("../src/services/ai-change-journal");
const { validateChangePlan } = require("../src/services/ai-change-plan");
const { PORTABLE_STORAGE_PROFILE } = require("../src/storage/profiles");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHarness(initial = {}) {
  const files = new Map(Object.entries(initial));
  const entries = new Map();
  const writes = [];
  const persistence = {
    async write(entry) {
      writes.push({ kind: "journal-write", id: entry.id, status: entry.status });
      entries.set(entry.id, clone(entry));
    },
    async readAll() { return [...entries.values()].map(clone); },
    async remove(id) {
      writes.push({ kind: "journal-remove", id });
      entries.delete(id);
    }
  };
  const capabilities = {
    async exists(path) { return files.has(path); },
    async read(path) {
      if (!files.has(path)) throw new Error("missing");
      return files.get(path);
    },
    async modify(path, content) {
      if (!files.has(path)) throw new Error("missing");
      writes.push({ kind: "modify", path });
      files.set(path, content);
    },
    async remove(path) {
      writes.push({ kind: "remove", path });
      files.delete(path);
    }
  };
  const journal = createAIChangeJournal({
    persistence,
    capabilities,
    profile: PORTABLE_STORAGE_PROFILE,
    randomId: () => "journal-1",
    now: () => Date.parse("2026-08-14T10:00:00.000Z")
  });
  return { files, entries, writes, persistence, capabilities, journal };
}

function preparedPlan() {
  const plan = validateChangePlan({
    version: 1,
    id: "plan-1",
    featureId: "assistant",
    operations: [
      { id: "one", kind: "update", path: "MagicOS/Records/Memory/existing.md", content: "after" },
      { id: "two", kind: "create", path: "MagicOS/Records/Memory/new.md", content: "new" }
    ]
  }, { profile: PORTABLE_STORAGE_PROFILE });
  return {
    plan,
    snapshots: [
      Object.freeze({ operation: plan.operations[0], existed: true, content: "before" }),
      Object.freeze({ operation: plan.operations[1], existed: false, content: "" })
    ]
  };
}

test("journal is durable before writes and recovery reports never expose contents", async () => {
  const harness = createHarness({ "MagicOS/Records/Memory/existing.md": "before" });
  const { plan, snapshots } = preparedPlan();
  await harness.journal.begin(plan, snapshots);
  assert.equal(harness.entries.size, 1);
  const persisted = [...harness.entries.values()][0];
  assert.equal(persisted.operations[0].beforeContent, "before");
  assert.equal(persisted.operations[0].afterContent, "after");
  const [report] = await harness.journal.inspect();
  assert.equal(report.action, "abandon-safe");
  assert.equal(JSON.stringify(report).includes("before"), false);
  assert.equal(JSON.stringify(report).includes('"after"'), false);
});

test("management logs are journaled inside the storage profile without opening arbitrary roots", async () => {
  const harness = createHarness();
  const operation = { id: "log", kind: "create", path: "MagicOS/Logs/agent-run.md", content: "safe management summary" };
  await harness.journal.begin({ id: "plan-log", operations: [operation] }, [
    Object.freeze({ operation, existed: false, content: "" })
  ]);
  assert.equal(harness.entries.size, 1);

  const outside = { id: "outside", kind: "create", path: "Unmanaged/agent-run.md", content: "no" };
  await assert.rejects(
    harness.journal.begin({ id: "plan-outside", operations: [outside] }, [Object.freeze({ operation: outside, existed: false, content: "" })]),
    (error) => error.code === "journal-corrupt" && /unmanaged storage/.test(error.message)
  );
});

test("crash after a write but before its applied marker is detected and rolled back", async () => {
  const path = "MagicOS/Records/Memory/existing.md";
  const harness = createHarness({ [path]: "before" });
  const { plan, snapshots } = preparedPlan();
  const session = await harness.journal.begin(plan, snapshots);
  await harness.journal.markApplying(session, "one");
  harness.files.set(path, "after");

  const [report] = await harness.journal.inspect();
  assert.equal(report.action, "rollback-safe");
  assert.equal(report.operations[0].observed, "applied");
  const recovered = await harness.journal.recover(report.token, { confirmed: true });
  assert.equal(recovered.status, "rolled-back");
  assert.equal(harness.files.get(path), "before");
  assert.equal(harness.entries.size, 0);
});

test("a committed transaction is archived without undoing confirmed changes", async () => {
  const path = "MagicOS/Records/Memory/existing.md";
  const harness = createHarness({ [path]: "before" });
  const { plan, snapshots } = preparedPlan();
  const session = await harness.journal.begin(plan, snapshots);
  await harness.journal.markApplying(session, "one");
  harness.files.set(path, "after");
  await harness.journal.markApplied(session, "one");
  await harness.journal.markApplying(session, "two");
  harness.files.set("MagicOS/Records/Memory/new.md", "new");
  await harness.journal.markApplied(session, "two");
  await harness.journal.finish(session, "applied");

  const [report] = await harness.journal.inspect();
  assert.equal(report.action, "completed");
  const recovered = await harness.journal.recover(report.token, { confirmed: true });
  assert.equal(recovered.status, "completed");
  assert.equal(harness.files.get(path), "after");
  assert.equal(harness.files.get("MagicOS/Records/Memory/new.md"), "new");
  assert.equal(harness.entries.size, 0);
});

test("third-party edits require manual review and are never overwritten", async () => {
  const path = "MagicOS/Records/Memory/existing.md";
  const harness = createHarness({ [path]: "before" });
  const { plan, snapshots } = preparedPlan();
  const session = await harness.journal.begin(plan, snapshots);
  await harness.journal.markApplying(session, "one");
  harness.files.set(path, "user edit after crash");
  const [report] = await harness.journal.inspect();
  assert.equal(report.action, "manual-review");
  await assert.rejects(harness.journal.recover(report.token, { confirmed: true }), (error) => error.code === "recovery-conflict");
  assert.equal(harness.files.get(path), "user edit after crash");
  assert.equal(harness.entries.size, 1);
});

test("recovery tokens are explicit, single-use, and stale-state protected", async () => {
  const harness = createHarness({ "MagicOS/Records/Memory/existing.md": "before" });
  const { plan, snapshots } = preparedPlan();
  await harness.journal.begin(plan, snapshots);
  const [first] = await harness.journal.inspect();
  await assert.rejects(harness.journal.recover(first.token), (error) => error.code === "confirmation-required");
  const [second] = await harness.journal.inspect();
  harness.files.set("MagicOS/Records/Memory/existing.md", "external edit");
  await assert.rejects(harness.journal.recover(second.token, { confirmed: true }), (error) => error.code === "recovery-stale");
  await assert.rejects(harness.journal.recover(second.token, { confirmed: true }), (error) => error.code === "recovery-token");
});

test("corrupted recovery paths fail before storage mutation", async () => {
  const harness = createHarness();
  harness.entries.set("journal-unsafe", {
    version: 1,
    id: "journal-unsafe",
    planId: "plan-1",
    status: "applying",
    createdAt: "2026-08-14T10:00:00.000Z",
    updatedAt: "2026-08-14T10:00:00.000Z",
    operations: [{
      id: "one",
      kind: "update",
      path: "../private.md",
      state: "applying",
      beforeExists: true,
      beforeContent: "before",
      afterContent: "after"
    }]
  });
  await assert.rejects(harness.journal.inspect(), (error) => error.code === "journal-corrupt");
  assert.equal(harness.writes.some(({ kind }) => kind === "modify" || kind === "remove"), false);
});

test("private persistence failures are projected as generic journal errors", async () => {
  const journal = createAIChangeJournal({
    persistence: {
      async write() {},
      async readAll() { throw new Error("private-adapter-diagnostic-detail"); },
      async remove() {}
    },
    capabilities: {
      async exists() { return false; },
      async read() { return ""; },
      async modify() {},
      async remove() {}
    },
    profile: PORTABLE_STORAGE_PROFILE
  });
  await assert.rejects(journal.inspect(), (error) => (
    error.code === "journal-persistence"
      && error.message === "AI change journal persistence is unavailable"
      && !error.message.includes("private-adapter-diagnostic-detail")
  ));
});
