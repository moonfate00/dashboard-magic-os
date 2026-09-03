"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  analyzeLearningHierarchy,
  attachIntakeProposal,
  beginIntakeUnderstanding,
  createIntakeAdapterRegistry,
  createIntakeRuntime,
  createIntakeSession,
  intakeSessionSummary,
  selectIntakeCandidates,
  summarizeAssetMedia,
  updateIntakeMaterial
} = require("../src/intake");
const { createCoreServices } = require("../src/services");

test("intake session preserves manual locks while an assistant proposes editable candidates", () => {
  const captured = createIntakeSession({
    id: "intake-assets-1",
    cabinId: "assets",
    typeId: "asset-image",
    typeLocked: true,
    presetKeys: ["image_reference"],
    draft: "Reference image",
    media: [{ kind: "image", name: "reference.png" }],
    now: "2026-09-03T08:00:00.000Z"
  });
  const changed = updateIntakeMaterial(captured, { presetKeys: ["image_reference", "image_cover"] }, {
    reason: "human-locked-purpose",
    now: "2026-09-03T08:01:00.000Z"
  });
  const understanding = beginIntakeUnderstanding(changed, { now: "2026-09-03T08:02:00.000Z" });
  const proposed = attachIntakeProposal(understanding, {
    summary: "Image asset and scene projection",
    questions: ["Use as a hall background?"],
    objects: [
      { id: "asset-1", primary: true, module: "assets", type: "asset-image", title: "Reference image" },
      { id: "scene-1", module: "assets", type: "asset-scene", title: "Reference scene" }
    ]
  }, { jobPath: "MagicOS/System/AI-Classify/job.md", now: "2026-09-03T08:03:00.000Z" });
  const reviewed = selectIntakeCandidates(proposed, ["asset-1"], { now: "2026-09-03T08:04:00.000Z" });
  assert.deepEqual(reviewed.manualLocks.presetKeys, ["image_reference", "image_cover"]);
  assert.deepEqual(reviewed.selectedCandidateIds, ["asset-1"]);
  assert.equal(reviewed.stage, "reviewed");
  assert.deepEqual(intakeSessionSummary(reviewed), {
    sourceCount: 1,
    candidateCount: 2,
    selectedCount: 1,
    relationCount: 0,
    warningCount: 1,
    lockedCount: 3
  });
  assert.equal(Object.isFrozen(reviewed), true);
});

test("asset intake distinguishes mixed media and keeps the primary object type", () => {
  const summary = summarizeAssetMedia([
    { name: "cover.png" },
    { kind: "image", name: "detail.jpg" },
    { name: "trailer.mp4" }
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.primaryKind, "image");
  assert.equal(summary.suggestedTypeId, "asset-image");
  assert.equal(summary.mixed, true);
});

test("one intake registry supplies an adapter for every cabin", () => {
  const registry = createIntakeAdapterRegistry();
  assert.deepEqual(registry.ids, ["command", "assets", "social", "navigation", "memory"]);
  assert.equal(registry.inspect("navigation", { typeId: "study-note" }).suggestedTypeId, "study-note");
  assert.equal(registry.inspect("assets", { media: [{ kind: "audio" }] }).suggestedTypeId, "asset-audio");
});

test("learning intake maps P1 P2 P3 and flattens deeper headings without creating P4", () => {
  const hierarchy = analyzeLearningHierarchy({
    draft: [
      "# 公文",
      "## 法定公文文种",
      "### 函",
      "#### 函的适用范围",
      "## 公文格式",
      "### 版记"
    ].join("\n"),
    learningRoots: [{
      path: "Navigation/Threads/official.md",
      title: "公文",
      branches: [
        { path: "Navigation/Branches/genres.md", title: "法定公文文种" },
        { path: "Navigation/Branches/format.md", title: "法定公文格式" }
      ]
    }]
  });
  assert.equal(hierarchy.levelCount, 3);
  assert.equal(hierarchy.noP4, true);
  assert.equal(hierarchy.root.title, "公文");
  assert.equal(hierarchy.branches.length, 2);
  assert.equal(hierarchy.branches[0].matchedBranchPath, "Navigation/Branches/genres.md");
  assert.equal(hierarchy.branches[1].matchedBranchPath, "Navigation/Branches/format.md");
  assert.equal(hierarchy.summary.p3Count, 2);
  assert.equal(hierarchy.branches[0].cardHints[0].title, "函的适用范围");
});

test("core services expose one in-memory intake runtime without Vault writes", () => {
  const services = createCoreServices();
  assert.equal(typeof services.intakeRuntime.create, "function");
  assert.equal(services.intakeRuntime.adapters, services.intakeRuntime.adapters);
  const session = services.intakeRuntime.create({ id: "session-1", cabinId: "social", typeId: "person" });
  assert.equal(services.intakeRuntime.get("session-1"), session);
  assert.equal(Object.isFrozen(services.intakeRuntime), true);
});

test("standalone intake runtime is session-scoped and removable", () => {
  const runtime = createIntakeRuntime();
  const session = runtime.create({ id: "session-2", cabinId: "memory", typeId: "workflow" });
  assert.equal(runtime.get(session.id), session);
  assert.equal(runtime.remove(session.id), true);
  assert.equal(runtime.get(session.id), null);
});
