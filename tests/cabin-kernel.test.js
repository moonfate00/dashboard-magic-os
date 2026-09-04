"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { DEFAULT_CABIN_MANIFESTS } = require("../src/cabins");
const {
  CABIN_IDS,
  createCabinRegistry,
  createCabinRuntime,
  createEventBus,
  defineCabinManifest
} = require("../src/kernel");
const { createCoreServices } = require("../src/services");
const { buildCabinShellModel, SHELL_COUNTERS } = require("../src/ui/shared-shell");

test("the registry owns exactly one ordered contract for all five cabins", () => {
  const registry = createCabinRegistry();
  assert.deepEqual(registry.ids, ["command", "assets", "social", "navigation", "memory"]);
  assert.deepEqual(registry.list().map((item) => item.id), CABIN_IDS);
  assert.equal(registry.get("assets").views.filter((item) => item.primary).length, 1);
  assert.equal(Object.isFrozen(registry.get("social").objectTypes), true);
  assert.equal(Object.isFrozen(DEFAULT_CABIN_MANIFESTS), true);
});

test("write actions cannot bypass the shared transaction contract", () => {
  const registry = createCabinRegistry();
  registry.list().flatMap((cabin) => cabin.actions).forEach((action) => {
    if (action.authority === "write") assert.equal(action.transactionRequired, true);
  });
  assert.throws(() => defineCabinManifest({
    id: "command",
    objectTypes: [{ id: "task" }],
    views: [{ id: "queue", labelKey: "test.queue", kind: "list", primary: true }],
    actions: [{ id: "unsafe-write", labelKey: "test.write", authority: "write" }]
  }), /transaction/);
});

test("legacy type aliases resolve through one cabin and object registry", () => {
  const registry = createCabinRegistry();
  const health = { path: "Old/Health.md", frontmatter: { type: "medical_record" } };
  const course = { path: "Old/Course.md", frontmatter: { type: "course" } };
  assert.equal(registry.resolveRecord(health).id, "social");
  assert.equal(registry.objectTypeForRecord(health).id, "health-record");
  assert.equal(registry.resolveRecord(course).id, "navigation");
  assert.equal(registry.objectTypeForRecord(course).id, "learning-thread");
});

test("one runtime produces cabin counts, virtual identities, relations, and health findings", () => {
  const runtime = createCabinRuntime();
  const records = [
    {
      path: "MagicOS/Modules/Assets/inbox.md",
      title: "Inbox image",
      frontmatter: { entity_id: "asset-1", type: "asset_image", module: "assets", status: "inbox" }
    },
    {
      path: "Legacy/Tasks/todo.md",
      title: "Legacy task",
      frontmatter: { type: "task", module: "command", status: "active" }
    },
    {
      path: "MagicOS/Modules/Social/Health/checkup.md",
      title: "Checkup",
      frontmatter: { entity_id: "health-1", type: "health_record", module: "social", person: "missing-person" }
    },
    {
      path: "MagicOS/Modules/Memory/workflow.md",
      title: "Workflow",
      frontmatter: { entity_id: "memory-1", type: "workflow", module: "memory" }
    }
  ];
  const snapshot = runtime.snapshot(records, {
    relations: { fieldRules: [{ field: "person", type: "person-health" }] }
  });
  assert.deepEqual(snapshot.cabins.assets.counts, {
    indexed: 1,
    formal: 1,
    visible: 1,
    inbox: 1,
    attention: 1
  });
  assert.equal(snapshot.cabins.command.records[0].identityKind, "virtual");
  assert.match(snapshot.cabins.command.records[0].entityId, /^virtual:command:/);
  assert.equal(snapshot.health.findings.some((item) => item.ruleId === "missing-entity-id" && item.cabinId === "command"), true);
  assert.equal(snapshot.health.findings.some((item) => item.ruleId === "sensitive-record-missing-privacy" && item.cabinId === "social"), true);
  assert.equal(snapshot.health.findings.some((item) => item.ruleId === "memory-missing-review-status"), true);
  assert.equal(snapshot.health.findings.some((item) => item.ruleId === "unresolved-relation"), true);
});

test("host assignment can place brownfield records in exactly one cabin without rewriting them", () => {
  const runtime = createCabinRuntime();
  const record = { path: "OldVault/Unsorted/Note.md", title: "Legacy note", frontmatter: {} };
  const before = JSON.stringify(record);
  const snapshot = runtime.snapshot([record], {
    resolveCabinId(candidate) { return candidate.path.startsWith("OldVault/") ? "navigation" : ""; }
  });
  assert.equal(snapshot.cabins.navigation.records.length, 1);
  assert.equal(snapshot.cabins.assets.records.length, 0);
  assert.equal(snapshot.cabins.navigation.records[0].record, record);
  assert.equal(JSON.stringify(record), before);
});

test("a host may supply the one prebuilt query index used by the snapshot", () => {
  const runtime = createCabinRuntime();
  const record = { path: "Tasks/One.md", title: "One", frontmatter: { type: "task", module: "command" } };
  const index = require("../src/services/record-query").buildRecordQueryIndex([record]);
  const snapshot = runtime.snapshot([record], { index });
  assert.equal(snapshot.index, index);
  assert.equal(snapshot.relationIndex.recordIndex, index);
});

test("the Agent catalog exposes callable domain actions without executable functions", () => {
  const catalog = createCabinRuntime().agentCatalog();
  assert.equal(catalog.length, 5);
  assert.equal(catalog.find((item) => item.id === "social").actions.some((item) => item.id === "create-health-record"), true);
  assert.equal(catalog.find((item) => item.id === "assets").actions.some((item) => item.id === "set-os-background"), false);
  assert.doesNotThrow(() => JSON.stringify(catalog));
});

test("event listeners are isolated and can be removed without leaking failures", async () => {
  const events = createEventBus();
  const received = [];
  const unsubscribe = events.subscribe("cabin:updated", (event) => received.push(event.payload.id));
  events.subscribe("cabin:updated", () => { throw new Error("observer failed"); });
  const first = await events.publish("cabin:updated", { id: "assets" });
  assert.deepEqual(received, ["assets"]);
  assert.deepEqual(first.outcomes.map((item) => item.status), ["fulfilled", "rejected"]);
  assert.equal(unsubscribe(), true);
  await events.publish("cabin:updated", { id: "memory" });
  assert.deepEqual(received, ["assets"]);
});

test("the plugin service entry point exposes the same cabin runtime", () => {
  const services = createCoreServices();
  assert.deepEqual(services.cabinRuntime.registry.ids, CABIN_IDS);
  assert.equal(typeof services.cabinKernel.runHealthAudit, "function");
  assert.equal(Object.isFrozen(services.cabinRuntime), true);
});

test("shared shell derives one searchable projection and explicit counter set", () => {
  const runtime = createCabinRuntime();
  const snapshot = runtime.snapshot([
    { path: "MagicOS/Records/Assets/one.md", title: "Moon image", frontmatter: { entity_id: "asset-1", type: "asset-image", module: "assets", status: "inbox" } },
    { path: "Legacy/Assets/two.md", title: "Old video", frontmatter: { type: "asset-video", module: "assets", status: "active" } }
  ]);
  const shell = buildCabinShellModel(snapshot, "assets", { query: "moon" });
  assert.deepEqual(SHELL_COUNTERS, ["indexed", "formal", "visible", "inbox", "attention"]);
  assert.deepEqual(shell.records.map((record) => record.title), ["Moon image"]);
  assert.equal(shell.counts.indexed, 2);
  assert.equal(shell.view.id, "media-wall");
  assert.equal(shell.health.some((item) => item.ruleId === "missing-entity-id"), true);
});
