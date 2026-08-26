"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  normalizeAgentPlan,
  normalizeLinkRoute,
  prepareAgentPlanning,
  prepareLinkRouting,
  publicURL
} = require("../src/services/ai-planning-contracts");

const catalog = [{
  moduleId: "navigation",
  moduleName: "Navigation",
  typeId: "study-note",
  typeLabel: "Study note",
  typeDesc: "Reviewed notes",
  presets: [{ key: "topic-history", label: "History", tag: "#topic/history" }]
}];

test("Agent planning fixes permissions and prevents model-invented local paths", () => {
  const prepared = prepareAgentPlanning("整理 [[Dashboard/Private/Source.md]] 和 @SecretNote 并复盘");
  assert.equal(prepared.prompt.includes("Dashboard/Private/Source.md"), false);
  assert.equal(prepared.prompt.includes("SecretNote"), false);
  assert.equal(prepared.prompt.includes("[attached local file]"), true);
  const plan = normalizeAgentPlan({
    summary: "先搜索，再整理。",
    steps: [
      { step_id: "s1", kind: "search", label: "搜索", permission: "P3", params: { query: "资料", scope: "all", limit: 500, extra: "ignored" }, uses: "" },
      { step_id: "s2", kind: "existing", label: "整理", permission: "P1", params: { sourceFiles: ["{result}", "Dashboard/Private/Invented.md"], targetModule: "navigation" }, uses: "s1" }
    ]
  }, prepared);
  assert.equal(plan.steps[0].permission, "P1");
  assert.equal(plan.steps[0].params.limit, 60);
  assert.equal("extra" in plan.steps[0].params, false);
  assert.equal(plan.steps[1].permission, "P2");
  assert.deepEqual(plan.steps[1].params.sourceFiles, ["{result}"]);
  assert.equal(JSON.stringify(plan).includes("Invented"), false);
});

test("planning contracts reject credential-bearing goals and routing queries", () => {
  assert.throws(() => prepareAgentPlanning("api_key: abcdefghijklmnop123456"), (error) => error.code === "validation");
  assert.throws(() => prepareLinkRouting({
    url: "https://example.org/article",
    sourceKind: "web-article",
    query: "password: private-password",
    catalog
  }), (error) => error.code === "validation");
});

test("Agent planning rejects unsafe dependencies and unapproved link targets", () => {
  const prepared = prepareAgentPlanning("整理 https://example.org/article");
  assert.throws(() => normalizeAgentPlan({
    summary: "bad",
    steps: [{ step_id: "s1", kind: "existing", label: "bad", permission: "P2", params: {}, uses: "future" }]
  }, prepared), (error) => error.code === "validation");
  assert.throws(() => normalizeAgentPlan({
    summary: "bad",
    steps: [{ step_id: "s1", kind: "link-intake", label: "bad", permission: "P2", params: { sourceUrl: "https://attacker.invalid/" }, uses: "" }]
  }, prepared), (error) => error.code === "validation");
});

test("link routing accepts only a reviewed catalog pair, preset, profile, and tags", () => {
  const prepared = prepareLinkRouting({
    url: "https://example.org/article",
    sourceKind: "web-article",
    query: "详细梳理",
    catalog
  });
  const route = normalizeLinkRoute({
    moduleId: "navigation",
    typeId: "study-note",
    presetKeys: ["topic-history", "invented"],
    customTags: ["#topic/review", "not-a-tag"],
    profileId: "web-article-deep",
    reason: "The reviewed study-note route matches."
  }, prepared);
  assert.deepEqual(route.presetKeys, ["topic-history"]);
  assert.deepEqual(route.customTags, ["#topic/review"]);
  assert.equal(route.profileId, "web-article-deep");
  assert.equal(Object.isFrozen(route), true);
});

test("link routing rejects internal, credential-bearing, and mismatched Bilibili URLs", () => {
  for (const url of [
    "http://127.0.0.1/private",
    "http://192.168.1.2/private",
    "https://user:pass@example.org/private",
    "http://service.local/private"
  ]) {
    assert.throws(() => publicURL(url), (error) => error.code === "validation");
  }
  assert.throws(() => prepareLinkRouting({
    url: "https://example.org/video",
    sourceKind: "bilibili",
    catalog
  }), (error) => error.code === "validation");
});

test("link routing rejects routes and profiles outside the reviewed input", () => {
  const prepared = prepareLinkRouting({ url: "https://example.org/article", sourceKind: "web-article", catalog });
  assert.throws(() => normalizeLinkRoute({
    moduleId: "social",
    typeId: "person",
    presetKeys: [],
    customTags: [],
    profileId: "web-article-deep",
    reason: "invented route"
  }, prepared), (error) => error.code === "validation");
  assert.throws(() => normalizeLinkRoute({
    moduleId: "navigation",
    typeId: "study-note",
    presetKeys: [],
    customTags: [],
    profileId: "bili-verbatim-deep",
    reason: "wrong profile"
  }, prepared), (error) => error.code === "validation");
});
