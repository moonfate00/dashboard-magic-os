"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  normalizeSkillReport,
  prepareSkillExecution
} = require("../src/services/ai-skill-contracts");

test("Skill input removes local references from both definition and task", () => {
  const prepared = prepareSkillExecution({
    skillName: "review-notes",
    skillDefinition: "Review [[Dashboard/Private/Plan]] and file:///private/secret.md without writing.",
    task: "Summarize MagicOS/Navigation/Topic.md and ~/.workbuddy/local.txt"
  });
  assert.equal(prepared.prompt.includes("Dashboard/Private"), false);
  assert.equal(prepared.prompt.includes("file:///private"), false);
  assert.equal(prepared.prompt.includes("MagicOS/Navigation"), false);
  assert.equal(prepared.prompt.includes(".workbuddy"), false);
  assert.equal(prepared.prompt.includes("[LOCAL_REFERENCE]"), true);
});

test("Skill report is bounded, safe, and deeply immutable", () => {
  const report = normalizeSkillReport({
    matched: true,
    summary: "The task matches the reviewed workflow.",
    completed: [{ item: "Compared the supplied text", evidence: "The task contains two stated positions." }],
    failed: [],
    approvals: [{ action: "Create a note", impact: "Would add one record", reason: "Requires explicit confirmation" }],
    report_markdown: "## Result\n\nPublic reference: https://example.com/source"
  });
  assert.equal(report.matched, true);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.completed), true);
  assert.equal(Object.isFrozen(report.completed[0]), true);
});

test("Skill input rejects credentials in either authority source", () => {
  assert.throws(() => prepareSkillExecution({
    skillName: "unsafe-skill",
    skillDefinition: "Use api_key=sk-example-1234567890",
    task: "Summarize this"
  }), (error) => error.code === "validation");
  assert.throws(() => prepareSkillExecution({
    skillName: "unsafe-skill",
    skillDefinition: "Summarize text only",
    task: "password: hunter22"
  }), (error) => error.code === "validation");
});

test("Skill output rejects local paths, WikiLinks, active content, and private URLs", () => {
  const base = { matched: true, completed: [], failed: [], approvals: [], report_markdown: "" };
  for (const summary of [
    "Open [[Dashboard/Private/Plan]]",
    "Read file:///private/private.md",
    "<iframe src=\"https://example.com\"></iframe>",
    "Fetch http://127.0.0.1/private"
  ]) {
    assert.throws(() => normalizeSkillReport({ ...base, summary }), (error) => error.code === "validation");
  }
});
