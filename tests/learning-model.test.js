"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildLearningModel,
  isStoryThreadRecord,
  knowledgeCardProgress,
  knowledgeCardState,
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
  assert.deepEqual(model.totals, { threads: 1, cards: 3, due: 1, mastered: 1 });
  assert.equal(model.threads[0].members.some((record) => record.frontmatter.entity_id === "note-1"), false);
});
