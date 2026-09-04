"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  assessObjectTransition,
  createCabinRegistry,
  createCabinRuntime,
  createObjectOperationPlan,
  createWorkspaceCheckpoint,
  discoverUnprofiledObjects
} = require("../src/kernel");

const records = [
  {
    path: "MagicOS/Modules/Social/People/Zhang.md",
    title: "张姐",
    tags: ["#类型/人物"],
    frontmatter: {
      entity_id: "person-zhang",
      type: "person",
      module: "social",
      scope: "personal",
      privacy: "private",
      organizations: ["[[青禾公司]]"],
      related_people: ["[[李老师]]", "[[李老师]]"]
    }
  },
  {
    path: "MagicOS/Modules/Social/Health/Zhang-checkup.md",
    title: "张姐复查",
    tags: ["#健康/体检"],
    frontmatter: {
      entity_id: "health-zhang",
      type: "health-record",
      module: "social",
      privacy: "sensitive",
      person: "person-zhang",
      status: "active"
    }
  },
  {
    path: "External/Tasks/follow-up.md",
    title: "跟进张姐",
    sourceMount: { id: "mount-work" },
    frontmatter: {
      entity_id: "task-follow-up",
      type: "task",
      module: "command",
      privacy: "internal",
      project: "[[家庭健康]]"
    }
  },
  {
    path: "MagicOS/Modules/Assets/Images/moon.md",
    title: "月亮",
    frontmatter: {
      entity_id: "asset-moon",
      type: "asset-image",
      module: "assets",
      privacy: "internal"
    }
  }
];

const fieldRules = [
  { field: "organizations", type: "member-of" },
  { field: "related_people", type: "related-person" },
  { field: "person", type: "person-health" },
  { field: "project", type: "project-task" }
];

test("one inspector projects identity, fields, relations, warnings, and unprofiled candidates", () => {
  const runtime = createCabinRuntime();
  const snapshot = runtime.snapshot(records, { relations: { fieldRules } });
  const inspector = snapshot.workbench.inspect("person-zhang");
  assert.equal(inspector.envelope.entityId, "person-zhang");
  assert.equal(inspector.envelope.cabinId, "social");
  assert.equal(inspector.fields.some((section) => section.id === "identity"), true);
  assert.equal(inspector.relations.incoming, 1);
  assert.deepEqual(inspector.candidates.map((item) => item.label), ["李老师", "青禾公司"]);
  assert.equal(inspector.candidates.find((item) => item.label === "李老师").occurrences, 2);
  assert.equal(inspector.candidates.find((item) => item.label === "李老师").suggestedType, "person");
  assert.equal(inspector.candidates.find((item) => item.label === "青禾公司").suggestedType, "organization");
  assert.equal(inspector.summary.candidateCount, 2);
  assert.equal(Object.isFrozen(inspector), true);
});

test("unprofiled discovery groups repeated unresolved references across source records", () => {
  const snapshot = createCabinRuntime().snapshot(records, { relations: { fieldRules } });
  const candidates = discoverUnprofiledObjects(snapshot.relationIndex);
  assert.equal(candidates.find((item) => item.label === "李老师").occurrences, 2);
  assert.equal(candidates.find((item) => item.label === "家庭健康").suggestedCabinId, "command");
  assert.deepEqual(snapshot.workbench.discover().map((item) => item.id), candidates.map((item) => item.id));
});

test("the scope guard requires confirmation for exposure, scope changes, and mounted writes", () => {
  const registry = createCabinRegistry();
  const person = records[0];
  const exposure = assessObjectTransition(person, { privacy: "public", scope: "public" }, registry);
  assert.equal(exposure.decision, "confirm");
  assert.equal(exposure.risks.some((item) => item.id === "privacy-exposure"), true);
  assert.equal(exposure.risks.some((item) => item.id === "cross-scope-move"), true);
  const mounted = assessObjectTransition(records[2], { status: "done" }, registry);
  assert.equal(mounted.decision, "confirm");
  assert.equal(mounted.risks.some((item) => item.id === "mounted-source-write"), true);
});

test("the scope guard blocks identity replacement, public health records, and destructive asset conversion", () => {
  const registry = createCabinRegistry();
  assert.equal(assessObjectTransition(records[0], { entity_id: "person-other" }, registry).decision, "block");
  assert.equal(assessObjectTransition(records[1], { privacy: "public" }, registry).decision, "block");
  const assetConversion = assessObjectTransition(records[3], { type: "source-note", module: "navigation" }, registry);
  assert.equal(assetConversion.decision, "block");
  assert.equal(assetConversion.risks.some((item) => item.id === "asset-source-loss"), true);
  const projection = assessObjectTransition(records[3], { type: "source-note", module: "navigation" }, registry, { preserveSource: true });
  assert.equal(projection.decision, "confirm");
});

test("object operation plans always carry a reversible checkpoint and cannot hide blocked changes", () => {
  const registry = createCabinRegistry();
  const plan = createObjectOperationPlan({
    kind: "move",
    records: [records[0]],
    patch: { privacy: "public", scope: "public" },
    registry
  });
  assert.equal(plan.schema, "magic-os-object-operation/v1");
  assert.equal(plan.transactionRequired, true);
  assert.equal(plan.reversible, true);
  assert.equal(plan.confirmationRequired, true);
  assert.equal(plan.checkpoint[0].entityId, "person-zhang");
  assert.equal(Object.isFrozen(plan.checkpoint[0].frontmatter), true);
  const blocked = createObjectOperationPlan({
    kind: "update",
    record: records[1],
    patch: { privacy: "public" },
    registry
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blocked, true);
});

test("workspace checkpoints retain navigation context with bounded viewport values", () => {
  const checkpoint = createWorkspaceCheckpoint({
    cabinId: "Navigation",
    viewId: "Knowledge-Graph",
    query: "公文",
    scope: "Current",
    selectedEntityId: "thread-documents",
    selectedPath: "MagicOS/公文.md",
    viewport: { zoom: 99, x: -120, y: 40, scrollTop: -5 },
    savedAt: "2026-09-04T10:00:00.000Z"
  });
  assert.equal(checkpoint.cabinId, "navigation");
  assert.equal(checkpoint.viewport.zoom, 8);
  assert.equal(checkpoint.viewport.scrollTop, 0);
  assert.equal(checkpoint.savedAt, "2026-09-04T10:00:00.000Z");
});
