"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  normalizeClassificationPlan,
  normalizeLearningCards,
  normalizeLearningMap,
  prepareClassificationPlan,
  prepareLearningCards,
  prepareLearningMap
} = require("../src/services/ai-content-plan-contracts");

const routes = [
  { moduleId: "navigation", typeId: "study-note", label: "Study note" },
  { moduleId: "social", typeId: "person", label: "Person" }
];

test("classification context redacts local paths and output stays on reviewed routes", () => {
  const prepared = prepareClassificationPlan({
    content: "source_files: [Dashboard/Private/Notes/One.md]\nRead [[Dashboard/Private/Notes/One.md|One]] and classify it.",
    localPaths: ["Dashboard/Private/Notes/One.md"],
    routes,
    targetModule: "navigation",
    targetType: "study-note",
    bodyProfile: "os-intake-standard"
  });
  assert.equal(prepared.prompt.includes("Dashboard/Private"), false);
  assert.equal(prepared.prompt.includes("source-1"), true);
  const plan = normalizeClassificationPlan({
    version: 1,
    summary: "One reviewed object.",
    questions: [],
    objects: [{
      id: "primary-1", primary: true, enabled: true, module: "navigation", type: "study-note",
      title: "Note", reason: "Useful", body_profile: "invented-profile", body: "# Note\n\n## Content\nSafe.",
      fields: [{ key: "summary", value_json: "\"Safe summary\"" }], tags: ["#topic/test"], links: [], relations: []
    }]
  }, prepared);
  assert.equal(plan.objects[0].body_profile, "os-intake-standard");
  assert.equal(Object.isFrozen(plan), true);
  assert.throws(() => normalizeClassificationPlan({
    version: 1, summary: "bad", questions: [],
    objects: [{
      id: "primary-1", primary: true, enabled: true, module: "social", type: "person", title: "Wrong",
      reason: "", body_profile: "os-intake-person", body: "# Wrong", fields: [], tags: [], links: [], relations: []
    }]
  }, prepared), (error) => error.code === "validation");
});

test("classification output rejects invented Vault references and active HTML", () => {
  const prepared = prepareClassificationPlan({
    content: "Classify safe text.", localPaths: [], routes,
    targetModule: "navigation", targetType: "study-note", bodyProfile: "os-intake-standard"
  });
  const base = {
    version: 1, summary: "bad", questions: [],
    objects: [{
      id: "primary-1", primary: true, enabled: true, module: "navigation", type: "study-note", title: "Bad",
      reason: "", body_profile: "os-intake-standard", body: "# Bad", fields: [], tags: [], links: [], relations: []
    }]
  };
  assert.throws(() => normalizeClassificationPlan({
    ...base,
    objects: [{ ...base.objects[0], fields: [{ key: "summary", value_json: "\"[[Dashboard/Private/Invented]]\"" }] }]
  }, prepared), (error) => error.code === "validation");
  assert.throws(() => normalizeClassificationPlan({
    ...base,
    objects: [{ ...base.objects[0], body: "# Bad\n<script>danger</script>" }]
  }, prepared), (error) => error.code === "validation");
});

test("learning cards use opaque source tokens and map them back locally", () => {
  const prepared = prepareLearningCards({
    content: "Sources: Dashboard/Private/Study/Source.md",
    sourcePaths: ["Dashboard/Private/Study/Source.md"],
    coverageKeys: ["coverage-1"],
    maxCards: 1
  });
  assert.equal(prepared.prompt.includes("Dashboard/Private"), false);
  const plan = normalizeLearningCards({
    version: 1, summary: "One card.", warnings: [], cards: [{
      id: "card-1", coverage_key: "coverage-1", coverage_heading: "Heading", title: "Rule",
      prompt: "What is the rule?", answer: "The reviewed answer.", explanation: "Because the source says so.",
      source_refs: ["source-1"],
      questions: [{ type: "single", question: "Which is correct?", options: ["A", "B"], correct: [0], explanation: "A." }]
    }]
  }, prepared);
  assert.deepEqual(plan.cards[0].source_refs, ["Dashboard/Private/Study/Source.md"]);
  assert.throws(() => normalizeLearningCards({
    version: 1, summary: "bad", warnings: [], cards: [{
      id: "card-1", coverage_key: "coverage-1", coverage_heading: "Heading", title: "Rule",
      prompt: "Question", answer: "Answer", explanation: "", source_refs: ["Dashboard/Invented.md"],
      questions: [{ type: "single", question: "Q", options: ["A", "B"], correct: [0], explanation: "" }]
    }]
  }, prepared), (error) => error.code === "validation");
});

test("learning map keeps internal graph references and restores omitted reviewed coverage locally", () => {
  const prepared = prepareLearningMap({
    theme: "Public policy",
    goal: "Build a review map.",
    sourcePaths: ["Dashboard/Private/Study/Source.md"],
    points: [{ coverageKey: "coverage-1", title: "Rule", sourcePath: "Dashboard/Private/Study/Source.md", evidencePreview: "Evidence." }]
  });
  assert.equal(prepared.prompt.includes("Dashboard/Private"), false);
  const plan = normalizeLearningMap({
    version: 1, title: "Policy map", summary: "Reviewed map.", warnings: [],
    nodes: [{
      node_id: "node-1", parent_id: "", title: "Rule", summary: "Summary", node_type: "rule",
      order: 1, importance: 4, exam_focus: "Focus", coverage_keys: ["coverage-1"], prerequisite_ids: ["invented"], contrast_ids: []
    }]
  }, prepared);
  assert.deepEqual(plan.nodes[0].prerequisite_ids, []);
  const recovered = normalizeLearningMap({
    version: 1, title: "Bad", summary: "Missing coverage", warnings: [],
    nodes: [{ node_id: "group", parent_id: "", title: "Group", summary: "", node_type: "group", order: 1, importance: 3, exam_focus: "", coverage_keys: [], prerequisite_ids: [], contrast_ids: [] }]
  }, prepared);
  assert.equal(recovered.nodes.length, 2);
  assert.equal(recovered.nodes[1].fallback, true);
  assert.deepEqual(recovered.nodes[1].coverage_keys, ["coverage-1"]);
});

test("content planning rejects credential-bearing local context", () => {
  assert.throws(() => prepareClassificationPlan({
    content: "api_key: abcdefghijklmnop123456", localPaths: [], routes,
    targetModule: "navigation", targetType: "study-note"
  }), (error) => error.code === "validation");
  assert.throws(() => prepareLearningCards({
    content: "password: private-password", sourcePaths: ["Source.md"], maxCards: 1
  }), (error) => error.code === "validation");
});
