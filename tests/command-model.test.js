"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildCommandModel, normalizeStatus } = require("../src/apps/command/model");
const { createCabinRuntime } = require("../src/kernel");

function record(id, type, title, frontmatter = {}) {
  return {
    path: `Legacy/Command/${id}.md`,
    title,
    type,
    module: "command",
    frontmatter: { entity_id: id, type, module: "command", title, ...frontmatter }
  };
}

const project = record("project-1", "project", "公文学习计划", { summary: "完成公文结构学习" });
const goal = record("goal-1", "goal", "掌握六个 P2 层级", { project: "project-1" });
const task = record("task-1", "task", "整理法定公文文种", {
  project: "project-1",
  goal: "goal-1",
  due_date: "2026-08-30",
  priority: 3,
  next_action: "补齐命令、公报和函的卡片",
  status: "active"
});
const blocked = record("task-2", "todo", "等待资料", { project: "project-1", status: "blocked", waiting_for: "原始资料" });

test("command model projects tasks, projects, goals, and actionable state", () => {
  const model = buildCommandModel([project, goal, task, blocked], {
    now: new Date(2026, 7, 30, 12, 0, 0),
    cabinRuntime: createCabinRuntime()
  });
  assert.deepEqual(model.totals, {
    tasks: 2,
    active: 1,
    planned: 0,
    blocked: 1,
    due: 1,
    overdue: 0,
    projects: 1,
    goals: 1,
    checkpoints: 0,
    reviews: 0
  });
  assert.equal(model.tasks[0].nextAction, "补齐命令、公报和函的卡片");
  assert.equal(model.tasks[0].projectTitle, "公文学习计划");
  assert.equal(model.tasks[0].isActionable, true);
  assert.equal(model.tasks[1].blocked, true);
  assert.equal(model.projects[0].activeTaskCount, 1);
  assert.equal(model.shell.manifest.id, "command");
});

test("command status normalization preserves common legacy values", () => {
  assert.equal(normalizeStatus("doing"), "active");
  assert.equal(normalizeStatus("backlog"), "planned");
  assert.equal(normalizeStatus("on_hold"), "paused");
  assert.equal(normalizeStatus("waiting"), "blocked");
  assert.equal(normalizeStatus("done"), "completed");
});

test("legacy command notes without stable IDs stay readable through the shared shell", () => {
  const legacy = { path: "10-wiki/任务/未命名.md", title: "阅读公文", module: "command", type: "task", frontmatter: { type: "task", module: "command", status: "planned" } };
  const model = buildCommandModel([legacy], { cabinRuntime: createCabinRuntime() });
  assert.equal(model.tasks[0].id, "10-wiki/任务/未命名.md");
  assert.equal(model.shell.records[0].identityKind, "virtual");
  assert.equal(model.shell.records[0].formal, false);
});
