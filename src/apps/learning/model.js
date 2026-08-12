"use strict";

const {
  buildRecordQueryIndex,
  isKnowledgeCardRecord,
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

function knowledgeCardProgress(record) {
  const frontmatter = recordFrontmatter(record);
  const explicit = Number(frontmatter.learning_progress);
  if (Number.isFinite(explicit) && explicit >= 0) return clamp(explicit, 0, 100);
  const reads = Math.max(0, Number(frontmatter.read_count || 0));
  const passes = Math.max(0, Number(frontmatter.review_pass_count || 0));
  return Math.min(100,
    (reads > 0 ? 25 : 0)
    + (passes >= 1 ? 25 : 0)
    + (passes >= 2 ? 20 : 0)
    + (passes >= 3 ? 15 : 0)
    + (passes >= 4 ? 15 : 0));
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

function buildLearningModel(records = [], options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const recordIndex = buildRecordQueryIndex(records, { isStoryThreadRecord });
  const relationIndex = buildRecordRelationIndex(recordIndex, {
    fieldRules: [
      { field: "related_thread", type: "thread-knowledge" },
      { field: "related_threads", type: "thread-member" },
      { field: "thread", type: "thread-knowledge" },
      { field: "threads", type: "thread-member" },
      { field: "project", type: "thread-member" },
      { field: "context_thread", type: "thread-member" }
    ],
    resolvedLinks: options.resolvedLinks
  });

  const threads = recordIndex.storyThreads.map((record) => {
    const frontmatter = recordFrontmatter(record);
    const linked = relatedRecords(relationIndex, record, { direction: "either" });
    const cards = linked.filter(isKnowledgeCardRecord).map((card) => cardPreview(card, now));
    const cardPaths = new Set(cards.map((card) => card.record.path));
    const members = linked.filter((candidate) => !cardPaths.has(candidate.path) && !isStoryThreadRecord(candidate));
    const progress = cards.length ? Math.round(cards.reduce((sum, card) => sum + card.progress, 0) / cards.length) : 0;
    return {
      id: recordEntityId(record) || record.path,
      record,
      title: String(frontmatter.title || record?.title || record?.name || ""),
      summary: String(frontmatter.learning_goal || frontmatter.summary || frontmatter.description || ""),
      status: threadStatus(record),
      mode: String(frontmatter.learning_mode || ""),
      level: String(frontmatter.learning_level || ""),
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
  }).sort((a, b) => {
    const statusOrder = { active: 0, planned: 1, paused: 2, completed: 3, archived: 4 };
    return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
      || b.dueCount - a.dueCount
      || Number(b.record?.mtime || 0) - Number(a.record?.mtime || 0)
      || a.title.localeCompare(b.title);
  });

  return {
    recordIndex,
    relationIndex,
    threads,
    byId: new Map(threads.map((thread) => [thread.id, thread])),
    totals: {
      threads: threads.length,
      cards: threads.reduce((sum, thread) => sum + thread.cardCount, 0),
      due: threads.reduce((sum, thread) => sum + thread.dueCount, 0),
      mastered: threads.reduce((sum, thread) => sum + thread.masteredCount, 0)
    }
  };
}

module.exports = {
  buildLearningModel,
  dateKey,
  isStoryThreadRecord,
  knowledgeCardProgress,
  knowledgeCardState,
  threadStatus,
  todayKey
};
