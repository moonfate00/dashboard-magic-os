"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildLearningModel,
  isStoryThreadRecord,
  knowledgeCardComputedProgress,
  knowledgeCardProgress,
  knowledgeCardState,
  learningContentEntry,
  learningThreadConfig,
  learningThreadEntry,
  threadStatus
} = require("../src/apps/learning/model");

function record(id, type, title, module, frontmatter = {}, tags = []) {
  return {
    path: `MagicOS/Records/${module}/${id}.md`,
    title,
    name: title,
    type,
    module: module.toLowerCase(),
    tags,
    mtime: frontmatter.mtime || 0,
    frontmatter: {
      entity_id: id,
      type,
      module: module.toLowerCase(),
      title,
      ...frontmatter
    }
  };
}

const thread = record("thread-1", "course", "Public architecture", "Navigation", {
  learning_enabled: true,
  learning_goal: "Understand safe public and private boundaries",
  status: "active"
});
const dueCard = record("card-due", "knowledge-card", "Data boundary", "Navigation", {
  related_thread: "thread-1",
  knowledge_topic: "Privacy",
  read_count: 1,
  review_count: 2,
  review_pass_count: 1,
  review_due: "2026-08-11"
}, ["#type/knowledge-card"]);
const newCard = record("card-new", "learning_card", "Storage profile", "Navigation", {
  related_thread: "[[MagicOS/Records/Navigation/thread-1|Public architecture]]",
  read_count: 0
});
const masteredCard = record("card-mastered", "knowledge-card", "Release audit", "Navigation", {
  related_thread: { entity_id: "thread-1" },
  read_count: 2,
  review_count: 5,
  review_pass_count: 4,
  learning_pool: "mastered"
});
const sourceAsset = record("asset-1", "asset-pdf", "Architecture notes", "Assets", {
  related_threads: ["thread-1"]
});
const sourceTask = record("task-1", "task", "Review services", "Command", {
  project: "thread-1"
});
const branch = record("branch-1", "learning-branch", "Public data boundary", "Navigation", {
  entity_kind: "thread",
  thread_type: "learning-branch",
  learning_level: "P2",
  parent_thread: "thread-1",
  learning_goal: "Study the public/private boundary in depth"
});
const branchCard = record("card-branch", "knowledge-card", "Sanitized fixtures", "Navigation", {
  related_thread: "branch-1",
  read_count: 1,
  review_pass_count: 1
});
const branchSource = record("asset-branch", "asset-pdf", "Fixture design", "Assets", {
  related_threads: ["branch-1"]
});
const unrelated = record("note-1", "note", "Unrelated", "Memory");
const records = [thread, dueCard, newCard, masteredCard, sourceAsset, sourceTask, unrelated];

test("learning model joins one thread to cards and source records", () => {
  const model = buildLearningModel(records, { now: new Date(2026, 7, 12, 12, 0, 0) });
  assert.equal(model.threads.length, 1);
  const item = model.byId.get("thread-1");
  assert.deepEqual(item.cards.map((card) => card.id), ["card-due", "card-new", "card-mastered"]);
  assert.deepEqual(item.members.map((member) => member.frontmatter.entity_id), ["asset-1", "task-1"]);
  assert.equal(item.cardCount, 3);
  assert.equal(item.dueCount, 1);
  assert.equal(item.newCount, 1);
  assert.equal(item.masteredCount, 1);
  assert.deepEqual(item.moduleCounts, { assets: 1, command: 1 });
});

test("card progress and review state follow the existing learning contract", () => {
  assert.equal(knowledgeCardComputedProgress({ read_count: 1, review_pass_count: 1 }), 50);
  assert.equal(knowledgeCardProgress(dueCard), 50);
  assert.equal(knowledgeCardProgress(masteredCard), 100);
  assert.deepEqual(knowledgeCardState(dueCard, new Date(2026, 7, 12)), {
    pool: "active",
    mastered: false,
    isNew: false,
    isDue: true,
    due: "2026-08-11",
    readCount: 1,
    reviewCount: 2,
    passCount: 1,
    progress: 50
  });
});

test("learning configuration separates P2 hierarchy from learning difficulty", () => {
  assert.deepEqual(learningThreadConfig(branch, {
    frequencies: { normal: { dailyLimit: 24 } }
  }), {
    enabled: false,
    mode: "exam",
    level: "basic",
    goal: "Study the public/private boundary in depth",
    frequency: "normal",
    dailyNewCards: 8,
    dailyReviewLimit: 24,
    passScore: 70,
    activeReadSeconds: 60,
    sourceExcluded: []
  });
});

test("thread classification excludes knowledge cards and templates", () => {
  assert.equal(isStoryThreadRecord(thread), true);
  assert.equal(isStoryThreadRecord(dueCard), false);
  assert.equal(isStoryThreadRecord({
    ...thread,
    path: "MagicOS/Templates/course.md"
  }), false);
  assert.equal(threadStatus({ frontmatter: { status: "on-hold" } }), "paused");
  assert.equal(threadStatus({ frontmatter: { status: "completed" } }), "completed");
});

test("learning totals do not count unrelated records", () => {
  const model = buildLearningModel(records, { now: new Date(2026, 7, 12) });
  assert.deepEqual(model.totals, { threads: 1, branches: 0, cards: 0, due: 0, mastered: 0 });
  assert.equal(model.threads[0].contentId, "");
  assert.equal(model.threads[0].members.some((record) => record.frontmatter.entity_id === "note-1"), false);
});

test("learning model nests customizable P2 branches below their P1 shelf", () => {
  const model = buildLearningModel(
    [...records, branch, branchCard, branchSource],
    { now: new Date(2026, 7, 12) }
  );
  assert.deepEqual(model.threads.map((item) => item.id), ["thread-1"]);
  assert.deepEqual(model.branches.map((item) => item.id), ["branch-1"]);
  assert.deepEqual(model.threads[0].branches.map((item) => item.id), ["branch-1"]);
  assert.equal(model.byId.get("branch-1").parentId, "thread-1");
  assert.equal(model.byId.get("thread-1").contentId, "branch-1");
  assert.equal(learningThreadEntry(model, thread).id, "thread-1");
  assert.equal(learningContentEntry(model, thread).id, "branch-1");
  assert.equal(learningContentEntry(model, branch).id, "branch-1");
  assert.deepEqual(model.byId.get("branch-1").cards.map((card) => card.id), ["card-branch"]);
  assert.deepEqual(model.byId.get("branch-1").members.map((item) => item.frontmatter.entity_id), ["asset-branch"]);
  assert.deepEqual(model.totals, { threads: 1, branches: 1, cards: 1, due: 0, mastered: 0 });
});

test("a body WikiLink does not silently make a knowledge card belong to a thread", () => {
  const linkOnlyCard = record("card-link-only", "knowledge-card", "Link only", "Navigation", {});
  const model = buildLearningModel([thread, linkOnlyCard], {
    resolvedLinks: {
      [linkOnlyCard.path]: { [thread.path]: 1 }
    }
  });
  assert.deepEqual(model.byId.get("thread-1").cards, []);
});
