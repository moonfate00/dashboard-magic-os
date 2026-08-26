"use strict";

const {
  buildRecordQueryIndex,
  isKnowledgeCardRecord,
  isLearningBranchRecord,
  learningBranches,
  learningContentTarget,
  learningRootThreads,
  recordEntityId,
  recordFrontmatter,
  recordModule,
  recordType
} = require("../../services/record-query");
const {
  buildRecordRelationIndex,
  relatedRecords
} = require("../../services/record-relations");

const THREAD_TYPES = new Set([
  "context-thread",
  "story-thread",
  "plotline",
  "thread",
  "project",
  "goal",
  "course",
  "collection"
]);

function isStoryThreadRecord(record) {
  const frontmatter = recordFrontmatter(record);
  const path = String(record?.path || "").toLowerCase();
  if (path.includes("/templates/") || path.includes("/template/")) return false;
  if (recordType(record) === "knowledge-card" || recordType(record) === "learning-card") return false;
  return String(frontmatter.entity_kind || "").trim().toLowerCase().replace(/_/g, "-") === "thread"
    || Boolean(String(frontmatter.thread_type || "").trim())
    || THREAD_TYPES.has(recordType(record));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function knowledgeCardComputedProgress(frontmatter = {}) {
  const reads = Math.max(0, Number(frontmatter.read_count || 0));
  const passes = Math.max(0, Number(frontmatter.review_pass_count || 0));
  return Math.min(100,
    (reads > 0 ? 25 : 0)
    + (passes >= 1 ? 25 : 0)
    + (passes >= 2 ? 20 : 0)
    + (passes >= 3 ? 15 : 0)
    + (passes >= 4 ? 15 : 0));
}

function knowledgeCardProgress(record) {
  const frontmatter = recordFrontmatter(record);
  const explicit = Number(frontmatter.learning_progress);
  if (Number.isFinite(explicit) && explicit >= 0) return clamp(explicit, 0, 100);
  return knowledgeCardComputedProgress(frontmatter);
}

function dateKey(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function todayKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function knowledgeCardState(record, now = new Date()) {
  const frontmatter = recordFrontmatter(record);
  const pool = String(frontmatter.learning_pool || frontmatter.status || "active").toLowerCase();
  const mastered = pool === "mastered";
  const reads = Math.max(0, Number(frontmatter.read_count || 0));
  const due = dateKey(frontmatter.review_due);
  const isDue = !mastered && Boolean(due) && due <= todayKey(now);
  return {
    pool: mastered ? "mastered" : "active",
    mastered,
    isNew: !mastered && reads === 0,
    isDue,
    due,
    readCount: reads,
    reviewCount: Math.max(0, Number(frontmatter.review_count || 0)),
    passCount: Math.max(0, Number(frontmatter.review_pass_count || 0)),
    progress: knowledgeCardProgress(record)
  };
}

function threadStatus(record) {
  const frontmatter = recordFrontmatter(record);
  const raw = String(frontmatter.status || frontmatter.stage || "active").trim().toLowerCase();
  if (["done", "complete", "completed", "finished", "closed"].includes(raw)) return "completed";
  if (["archive", "archived"].includes(raw)) return "archived";
  if (["pause", "paused", "hold", "on-hold"].includes(raw)) return "paused";
  if (["plan", "planned", "backlog", "idea"].includes(raw)) return "planned";
  return "active";
}

function learningThreadConfig(record, options = {}) {
  const frontmatter = recordFrontmatter(record);
  const modes = new Set(Array.isArray(options.modes) && options.modes.length
    ? options.modes.map(String)
    : ["understand", "exam", "research", "output"]);
  const levels = new Set(Array.isArray(options.levels) && options.levels.length
    ? options.levels.map(String)
    : ["new", "basic", "familiar", "sprint"]);
  const frequencies = options.frequencies && typeof options.frequencies === "object"
    ? options.frequencies
    : { light: { dailyLimit: 12 }, normal: { dailyLimit: 24 }, intensive: { dailyLimit: 40 } };
  const mode = modes.has(String(frontmatter.learning_mode || ""))
    ? String(frontmatter.learning_mode)
    : String(options.defaultMode || "exam");
  const legacyLevel = isLearningBranchRecord(record) ? "" : String(frontmatter.learning_level || "");
  const storedLevel = String(frontmatter.learning_difficulty || legacyLevel || "");
  const level = levels.has(storedLevel) ? storedLevel : String(options.defaultLevel || "basic");
  const requestedFrequency = String(frontmatter.review_frequency || "");
  const frequency = frequencies[requestedFrequency] ? requestedFrequency : String(options.defaultFrequency || "normal");
  const defaultLimit = Math.max(5, Number(frequencies[frequency]?.dailyLimit || 24));
  const sourceExcluded = Array.isArray(frontmatter.learning_source_excluded)
    ? frontmatter.learning_source_excluded
    : frontmatter.learning_source_excluded ? [frontmatter.learning_source_excluded] : [];
  return {
    enabled: frontmatter.learning_enabled === true || String(frontmatter.learning_enabled || "").toLowerCase() === "true",
    mode,
    level,
    goal: String(frontmatter.learning_goal || frontmatter.summary || "").trim(),
    frequency,
    dailyNewCards: clamp(frontmatter.daily_new_cards || 8, 1, 30),
    dailyReviewLimit: clamp(frontmatter.daily_review_limit || defaultLimit, 5, 100),
    passScore: clamp(frontmatter.learning_pass_score || 70, 60, 100),
    activeReadSeconds: 60,
    sourceExcluded
  };
}

function moduleCounts(records) {
  return records.reduce((counts, record) => {
    const moduleId = recordModule(record) || "global";
    counts[moduleId] = (counts[moduleId] || 0) + 1;
    return counts;
  }, {});
}

function cardPreview(record, now) {
  const frontmatter = recordFrontmatter(record);
  return {
    id: recordEntityId(record) || record.path,
    record,
    title: String(frontmatter.title || record?.title || record?.name || ""),
    topic: String(frontmatter.knowledge_topic || frontmatter.topic || ""),
    level: String(frontmatter.cognitive_level || ""),
    prompt: String(frontmatter.prompt || ""),
    answer: String(frontmatter.answer || frontmatter.summary || ""),
    sourceCount: Array.isArray(frontmatter.source_refs) ? frontmatter.source_refs.length : frontmatter.source_refs ? 1 : 0,
    ...knowledgeCardState(record, now)
  };
}

function sortLearningThreads(a, b) {
  const statusOrder = { active: 0, planned: 1, paused: 2, completed: 3, archived: 4 };
  return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
    || b.dueCount - a.dueCount
    || Number(b.record?.mtime || 0) - Number(a.record?.mtime || 0)
    || a.title.localeCompare(b.title);
}

function buildLearningModel(records = [], options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const storyClassifier = typeof options.isStoryThreadRecord === "function"
    ? options.isStoryThreadRecord
    : isStoryThreadRecord;
  const recordIndex = buildRecordQueryIndex(records, { isStoryThreadRecord: storyClassifier });
  const relationIndex = buildRecordRelationIndex(recordIndex, {
    fieldRules: [
      { field: "related_thread", type: "thread-knowledge" },
      { field: "related_threads", type: "thread-member" },
      { field: "thread", type: "thread-knowledge" },
      { field: "threads", type: "thread-member" },
      { field: "project", type: "thread-member" },
      { field: "context_thread", type: "thread-member" },
      { field: "parent_thread", type: "thread-parent" }
    ],
    resolvedLinks: options.resolvedLinks
  });

  const allThreads = recordIndex.storyThreads.map((record) => {
    const frontmatter = recordFrontmatter(record);
    const isBranch = isLearningBranchRecord(record);
    const linked = relatedRecords(relationIndex, record, { direction: "either" });
    const cardRecords = relatedRecords(relationIndex, record, {
      direction: "either",
      fields: ["related_thread", "related_threads", "thread", "threads"],
      recordPredicate: isKnowledgeCardRecord
    });
    const cards = cardRecords.map((card) => cardPreview(card, now));
    const cardPaths = new Set(cards.map((card) => card.record.path));
    const members = linked.filter((candidate) => !cardPaths.has(candidate.path) && !isKnowledgeCardRecord(candidate) && !storyClassifier(candidate));
    const progress = cards.length ? Math.round(cards.reduce((sum, card) => sum + card.progress, 0) / cards.length) : 0;
    return {
      id: recordEntityId(record) || record.path,
      record,
      title: String(frontmatter.title || record?.title || record?.name || ""),
      summary: String(frontmatter.learning_goal || frontmatter.summary || frontmatter.description || ""),
      status: threadStatus(record),
      mode: String(frontmatter.learning_mode || ""),
      level: String(frontmatter.learning_level || frontmatter.thread_level || (isBranch ? "P2" : "P1")),
      isBranch,
      parentId: "",
      contentId: isBranch ? (recordEntityId(record) || record.path) : "",
      branches: [],
      enabled: frontmatter.learning_enabled === true || String(frontmatter.learning_enabled || "").toLowerCase() === "true",
      progress,
      cardCount: cards.length,
      dueCount: cards.filter((card) => card.isDue).length,
      newCount: cards.filter((card) => card.isNew).length,
      masteredCount: cards.filter((card) => card.mastered).length,
      memberCount: members.length,
      moduleCounts: moduleCounts(members),
      cards: cards.sort((a, b) => Number(b.isDue) - Number(a.isDue) || a.progress - b.progress || a.title.localeCompare(b.title)),
      members: members.sort((a, b) => recordModule(a).localeCompare(recordModule(b)) || Number(b.mtime || 0) - Number(a.mtime || 0))
    };
  }).sort(sortLearningThreads);

  const modelByPath = new Map(allThreads.map((thread) => [thread.record.path, thread]));
  const threads = learningRootThreads(recordIndex)
    .map((record) => modelByPath.get(record.path))
    .filter(Boolean)
    .sort(sortLearningThreads);
  const branches = learningBranches(recordIndex)
    .map((record) => modelByPath.get(record.path))
    .filter(Boolean)
    .sort(sortLearningThreads);

  threads.forEach((thread) => {
    thread.branches = learningBranches(recordIndex, thread.record)
      .map((record) => modelByPath.get(record.path))
      .filter(Boolean)
      .sort(sortLearningThreads);
    thread.branches.forEach((branch) => {
      branch.parentId = thread.id;
    });
    const contentRecord = learningContentTarget(recordIndex, thread.record);
    thread.contentId = contentRecord ? modelByPath.get(contentRecord.path)?.id || "" : "";
  });

  return {
    recordIndex,
    relationIndex,
    threads,
    branches,
    byId: new Map(allThreads.map((thread) => [thread.id, thread])),
    totals: {
      threads: threads.length,
      branches: branches.length,
      cards: branches.reduce((sum, thread) => sum + thread.cardCount, 0),
      due: branches.reduce((sum, thread) => sum + thread.dueCount, 0),
      mastered: branches.reduce((sum, thread) => sum + thread.masteredCount, 0)
    }
  };
}

function learningThreadEntry(model, record) {
  if (!model || !record) return null;
  const id = recordEntityId(record) || record.path;
  return model.byId?.get(id)
    || [...(model.byId?.values?.() || [])].find((entry) => entry.record?.path === record.path)
    || null;
}

function learningContentEntry(model, record) {
  const entry = learningThreadEntry(model, record);
  if (!entry) return null;
  if (entry.isBranch) return entry;
  return entry.contentId ? model.byId?.get(entry.contentId) || null : null;
}

module.exports = {
  buildLearningModel,
  dateKey,
  isStoryThreadRecord,
  knowledgeCardComputedProgress,
  knowledgeCardProgress,
  knowledgeCardState,
  learningContentEntry,
  learningThreadConfig,
  learningThreadEntry,
  threadStatus,
  todayKey
};
