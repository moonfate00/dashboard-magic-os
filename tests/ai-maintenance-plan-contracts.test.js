"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  normalizeCardLibraryPlan,
  normalizeExistingFilePatches,
  prepareCardLibraryPlan,
  prepareExistingFilePatches
} = require("../src/services/ai-maintenance-plan-contracts");

test("existing-file planning keeps Vault paths local and restores only reviewed source tokens", () => {
  const path = "Dashboard/Private/Modules/Navigation/Study/Policy.md";
  const prepared = prepareExistingFilePatches({
    targetModule: "navigation",
    allowedTypes: ["study-note"],
    files: [{
      path,
      title: "Policy",
      currentFrontmatter: { title: "Policy", related_notes: ["[[Dashboard/Private/Other.md]]"] },
      excerpt: "See [[Dashboard/Private/Other.md|Other]] for context."
    }]
  });
  assert.equal(prepared.prompt.includes(path), false);
  assert.equal(prepared.prompt.includes("Other.md"), false);
  assert.equal(prepared.prompt.includes("source-1"), true);
  const plan = normalizeExistingFilePatches({
    version: 1, mode: "existing-files", target_module: "navigation", summary: "One reviewed patch.",
    files: [{
      source_token: "source-1", title: "Policy", suggested_type: "study-note", confidence: 0.9,
      patches: [{ field: "summary", operation: "add", value_json: "\"Public policy summary\"", confidence: 0.9, reason: "Missing summary", evidence: "The note defines the policy." }],
      warnings: []
    }]
  }, prepared);
  assert.equal(plan.files[0].path, path);
  assert.equal(plan.files[0].patches[0].value, "Public policy summary");
  assert.equal(Object.isFrozen(plan), true);
});

test("existing-file planning rejects protected fields, invented sources, local references, and private URLs", () => {
  const prepared = prepareExistingFilePatches({
    targetModule: "navigation", allowedTypes: ["study-note"],
    files: [{ path: "Notes/One.md", title: "One", currentFrontmatter: {}, excerpt: "Safe excerpt." }]
  });
  const plan = (patch, sourceToken = "source-1") => ({
    version: 1, mode: "existing-files", target_module: "navigation", summary: "bad",
    files: [{ source_token: sourceToken, title: "One", suggested_type: "study-note", confidence: 1, patches: [patch], warnings: [] }]
  });
  const patch = (field, value) => ({ field, operation: "add", value_json: JSON.stringify(value), confidence: 1, reason: "r", evidence: "e" });
  assert.throws(() => normalizeExistingFilePatches(plan(patch("privacy", "public")), prepared), (error) => error.code === "validation");
  assert.throws(() => normalizeExistingFilePatches(plan(patch("related_notes", "[[Notes/Invented.md]]")), prepared), (error) => error.code === "validation");
  assert.throws(() => normalizeExistingFilePatches(plan(patch("source_url", "http://127.0.0.1/private")), prepared), (error) => error.code === "validation");
  assert.throws(() => normalizeExistingFilePatches(plan(patch("summary", "safe"), "source-99"), prepared), (error) => error.code === "validation");
});

test("card-library planning fixes the subject and accepts only reviewed unique topics", () => {
  const prepared = prepareCardLibraryPlan({ subject: "四大名著", topics: ["作者与年代", "作品简介"] });
  const plan = normalizeCardLibraryPlan({
    version: 1, title: "Model changed title", summary: "A public-literature archive.",
    subLibraries: [{
      title: "红楼梦", author: "曹雪芹", era: "清代", summary: "A novel.", excerpt: "满纸荒唐言", excerptSource: "第一回",
      reviews: [{ quoter: "Reviewer", quote: "A sourced review.", source: "Review source" }],
      cards: [{
        topic: "作者与年代", prompt: "Who wrote it?", answer: "曹雪芹", explanation: "Common attribution.",
        quiz: { type: "single", question: "Which author?", options: ["曹雪芹", "罗贯中"], correct: [0], explanation: "The first option." }
      }]
    }]
  }, prepared);
  assert.equal(plan.title, "四大名著");
  assert.equal(plan.subLibraries[0].cards[0].topic, "作者与年代");
  assert.equal(Object.isFrozen(plan.subLibraries[0]), true);
});

test("card-library planning rejects local context, duplicate sub-libraries, and unreviewed topics", () => {
  assert.throws(() => prepareCardLibraryPlan({ subject: "[[Dashboard/Private/Secret.md]]", topics: ["简介"] }), (error) => error.code === "validation");
  const prepared = prepareCardLibraryPlan({ subject: "Public subject", topics: ["Overview"] });
  const sub = (title, topic = "Overview") => ({
    title, author: "", era: "", summary: "Summary", excerpt: "", excerptSource: "", reviews: [],
    cards: [{ topic, prompt: "Prompt", answer: "Answer", explanation: "", quiz: { type: "judge", question: "Correct?", options: [], correct: [0], explanation: "" } }]
  });
  assert.throws(() => normalizeCardLibraryPlan({ version: 1, title: "x", summary: "", subLibraries: [sub("One"), sub("One")] }, prepared), (error) => error.code === "validation");
  assert.throws(() => normalizeCardLibraryPlan({ version: 1, title: "x", summary: "", subLibraries: [sub("One", "Invented")] }, prepared), (error) => error.code === "validation");
});
