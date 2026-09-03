"use strict";

const {
  buildRecordQueryIndex,
  recordEntityId,
  recordFrontmatter,
  recordType
} = require("../../services/record-query");
const { buildRecordRelationIndex, relatedRecords } = require("../../services/record-relations");
const { buildCabinShellModel } = require("../../ui/shared-shell");

const COMMAND_TYPES = new Set([
  "task", "action", "todo", "project", "mission", "goal", "objective", "checkpoint", "milestone", "review", "retrospective"
]);
const TASK_TYPES = new Set(["task", "action", "todo"]);
const PROJECT_TYPES = new Set(["project", "mission"]);
const GOAL_TYPES = new Set(["goal", "objective"]);
const CHECKPOINT_TYPES = new Set(["checkpoint", "milestone"]);
const REVIEW_TYPES = new Set(["review", "retrospective"]);

function commandType(record) {
  return recordType(record).replace(/_/g, "-");
}

function isCommandRecord(record) {
  return COMMAND_TYPES.has(commandType(record)) || String(record?.module || "").trim().toLowerCase() === "command";
}

function normalizeStatus(value) {
  const raw = String(value || "active").trim().toLowerCase().replace(/_/g, "-");
  if (["done", "complete", "completed", "finished", "closed"].includes(raw)) return "completed";
  if (["archive", "archived"].includes(raw)) return "archived";
  if (["blocked", "stuck", "waiting"].includes(raw)) return "blocked";
  if (["paused", "pause", "on-hold", "hold"].includes(raw)) return "paused";
  if (["planned", "plan", "backlog", "idea", "queued"].includes(raw)) return "planned";
  return "active";
}

function dateKey(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function todayKey(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function textField(frontmatter, fields) {
  return fields.map((field) => String(frontmatter[field] || "").trim()).find(Boolean) || "";
}

function refTargets(frontmatter, fields) {
  return fields.flatMap((field) => {
    const value = frontmatter[field];
    const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    return values.map((item) => {
      if (item && typeof item === "object") return item.target_id || item.entity_id || item.target || item.path || item.value || "";
      return item;
    }).map((item) => String(item || "").replace(/^!?\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim()).filter(Boolean);
  });
}

function titleOf(record) {
  const frontmatter = recordFrontmatter(record);
  return String(frontmatter.title || record?.title || record?.name || record?.path || "").trim();
}

function projectionBase(record, kind) {
  const frontmatter = recordFrontmatter(record);
  const due = dateKey(textField(frontmatter, ["due", "due_date", "deadline", "scheduled_for"]));
  const status = normalizeStatus(frontmatter.status || frontmatter.stage || frontmatter.state);
  return {
    id: recordEntityId(record) || String(record?.path || ""),
    path: String(record?.path || ""),
    file: record?.file || null,
    kind,
    type: commandType(record),
    title: titleOf(record),
    status,
    priority: Math.max(0, Number(frontmatter.priority || frontmatter.urgency || 0) || 0),
    due,
    overdue: Boolean(due && due < todayKey()),
    created: dateKey(frontmatter.created || frontmatter.created_at),
    updated: dateKey(frontmatter.updated || frontmatter.updated_at),
    tags: Array.isArray(record?.tags) ? record.tags.map(String) : []
  };
}

function taskProjection(record, relationIndex, now = new Date()) {
  const frontmatter = recordFrontmatter(record);
  const item = projectionBase(record, "task");
  const taskDue = dateKey(textField(frontmatter, ["due", "due_date", "deadline", "scheduled_for"]));
  const today = todayKey(now);
  const project = relatedRecords(relationIndex, record, { direction: "outgoing", fields: ["project", "parent_project"] })[0] || null;
  const goal = relatedRecords(relationIndex, record, { direction: "outgoing", fields: ["goal"] })[0] || null;
  const dependencyIds = refTargets(frontmatter, ["depends_on", "dependencies"]);
  return Object.freeze({
    ...item,
    due: taskDue,
    overdue: Boolean(taskDue && taskDue < today && item.status !== "completed"),
    isDue: Boolean(taskDue && taskDue <= today && item.status !== "completed"),
    blocked: item.status === "blocked" || Boolean(frontmatter.blocked_by || frontmatter.waiting_for),
    nextAction: textField(frontmatter, ["next_action", "next_step", "action", "next"]),
    projectId: project ? recordEntityId(project) || project.path : "",
    projectTitle: project ? titleOf(project) : "",
    goalId: goal ? recordEntityId(goal) || goal.path : "",
    goalTitle: goal ? titleOf(goal) : "",
    dependencyIds: Object.freeze(dependencyIds),
    isActionable: item.status === "active" && !frontmatter.blocked_by && !frontmatter.waiting_for
  });
}

function projectProjection(record, relationIndex, now) {
  const item = projectionBase(record, "project");
  const tasks = relatedRecords(relationIndex, record, {
    direction: "incoming",
    fields: ["project", "parent_project"],
    recordPredicate: (candidate) => TASK_TYPES.has(commandType(candidate))
  }).map((task) => taskProjection(task, relationIndex, now));
  const goals = relatedRecords(relationIndex, record, {
    direction: "incoming",
    fields: ["project", "parent_project"],
    recordPredicate: (candidate) => GOAL_TYPES.has(commandType(candidate))
  }).map((goal) => projectionBase(goal, "goal"));
  return Object.freeze({
    ...item,
    description: textField(recordFrontmatter(record), ["summary", "description", "goal"]),
    nextAction: textField(recordFrontmatter(record), ["next_action", "next_step"]),
    taskCount: tasks.length,
    activeTaskCount: tasks.filter((task) => task.status === "active").length,
    blockedTaskCount: tasks.filter((task) => task.blocked).length,
    dueTaskCount: tasks.filter((task) => task.isDue).length,
    goalCount: goals.length,
    tasks: Object.freeze(tasks),
    goals: Object.freeze(goals)
  });
}

function buildCommandModel(records = [], options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const relationOptions = {
    fieldRules: [
      { field: "project", type: "task-project" },
      { field: "goal", type: "task-goal" },
      { field: "parent_project", type: "project-parent" },
      { field: "depends_on", type: "task-dependency" },
      { field: "dependencies", type: "task-dependency" }
    ]
  };
  const sharedSnapshot = options.cabinRuntime?.snapshot?.(records, { relations: relationOptions });
  const recordIndex = sharedSnapshot?.index || buildRecordQueryIndex(records);
  const relationIndex = sharedSnapshot?.relationIndex || buildRecordRelationIndex(recordIndex, relationOptions);
  const commandRecords = recordIndex.all.filter(isCommandRecord);
  const taskRecords = commandRecords.filter((record) => TASK_TYPES.has(commandType(record)));
  const projectRecords = commandRecords.filter((record) => PROJECT_TYPES.has(commandType(record)));
  const goalRecords = commandRecords.filter((record) => GOAL_TYPES.has(commandType(record)));
  const checkpointRecords = commandRecords.filter((record) => CHECKPOINT_TYPES.has(commandType(record)));
  const reviewRecords = commandRecords.filter((record) => REVIEW_TYPES.has(commandType(record)));
  const tasks = taskRecords.map((record) => taskProjection(record, relationIndex, now))
    .sort((a, b) => Number(b.isDue) - Number(a.isDue) || b.priority - a.priority || (a.due || "9999").localeCompare(b.due || "9999") || a.title.localeCompare(b.title));
  const projects = projectRecords.map((record) => projectProjection(record, relationIndex, now))
    .sort((a, b) => b.activeTaskCount - a.activeTaskCount || a.title.localeCompare(b.title));
  const goals = goalRecords.map((record) => Object.freeze({ ...projectionBase(record, "goal"), description: textField(recordFrontmatter(record), ["summary", "description", "goal"]) }));
  const checkpoints = checkpointRecords.map((record) => Object.freeze({ ...projectionBase(record, "checkpoint") }));
  const reviews = reviewRecords.map((record) => Object.freeze({ ...projectionBase(record, "review") }));
  const byId = new Map([...tasks, ...projects, ...goals, ...checkpoints, ...reviews].map((item) => [item.id, item]));
  return Object.freeze({
    recordIndex,
    relationIndex,
    shell: sharedSnapshot ? buildCabinShellModel(sharedSnapshot, "command", options.shell) : null,
    tasks: Object.freeze(tasks),
    projects: Object.freeze(projects),
    goals: Object.freeze(goals),
    checkpoints: Object.freeze(checkpoints),
    reviews: Object.freeze(reviews),
    byId,
    totals: Object.freeze({
      tasks: tasks.length,
      active: tasks.filter((task) => task.status === "active").length,
      planned: tasks.filter((task) => task.status === "planned").length,
      blocked: tasks.filter((task) => task.blocked).length,
      due: tasks.filter((task) => task.isDue).length,
      overdue: tasks.filter((task) => task.overdue).length,
      projects: projects.length,
      goals: goals.length,
      checkpoints: checkpoints.length,
      reviews: reviews.length
    })
  });
}

module.exports = {
  buildCommandModel,
  commandType,
  dateKey,
  isCommandRecord,
  normalizeStatus,
  taskProjection,
  todayKey
};
