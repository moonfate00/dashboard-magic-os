"use strict";

const INTAKE_STAGES = Object.freeze([
  "captured",
  "understanding",
  "proposed",
  "reviewed",
  "committing",
  "verified",
  "failed"
]);

const INTAKE_TRANSITIONS = Object.freeze({
  captured: Object.freeze(["understanding", "reviewed", "failed"]),
  understanding: Object.freeze(["proposed", "failed"]),
  proposed: Object.freeze(["understanding", "reviewed", "failed"]),
  reviewed: Object.freeze(["understanding", "committing", "failed"]),
  committing: Object.freeze(["verified", "failed"]),
  verified: Object.freeze([]),
  failed: Object.freeze(["understanding", "reviewed"])
});

function text(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function uniqueStrings(values, max = 240) {
  return Object.freeze([...new Set((Array.isArray(values) ? values : [])
    .map((value) => text(value, 600))
    .filter(Boolean))].slice(0, max));
}

function cloneJSON(value, fallback) {
  if (value === undefined) return fallback;
  try { return JSON.parse(JSON.stringify(value)); } catch (_error) { return fallback; }
}

function freezeSession(value) {
  const copy = cloneJSON(value, {});
  Object.freeze(copy.manualLocks);
  Object.freeze(copy.sourceRefs);
  Object.freeze(copy.media);
  Object.freeze(copy.candidates);
  Object.freeze(copy.selectedCandidateIds);
  Object.freeze(copy.warnings);
  return Object.freeze(copy);
}

function createIntakeSession(input = {}) {
  const id = text(input.id, 160);
  const cabinId = text(input.cabinId, 80).toLowerCase();
  if (!id) throw new TypeError("intake session requires an id");
  if (!cabinId) throw new TypeError("intake session requires a cabin");
  const now = text(input.now || new Date().toISOString(), 80);
  return freezeSession({
    id,
    cabinId,
    stage: "captured",
    revision: 0,
    createdAt: now,
    updatedAt: now,
    reason: "material-captured",
    draft: text(input.draft, 256 * 1024),
    sourceRefs: uniqueStrings(input.sourceRefs),
    media: cloneJSON(Array.isArray(input.media) ? input.media.slice(0, 120) : [], []),
    manualLocks: {
      cabinId,
      typeId: input.typeLocked === false ? "" : text(input.typeId, 100),
      typeLocked: input.typeLocked !== false && Boolean(text(input.typeId, 100)),
      presetKeys: uniqueStrings(input.presetKeys, 120)
    },
    proposalSummary: "",
    proposalJobPath: "",
    candidates: [],
    selectedCandidateIds: [],
    warnings: [],
    verification: null
  });
}

function reviseIntakeSession(session, patch = {}, options = {}) {
  if (!session || !INTAKE_STAGES.includes(session.stage)) throw new TypeError("invalid intake session");
  const nextStage = text(options.stage || session.stage, 40);
  if (nextStage !== session.stage && !(INTAKE_TRANSITIONS[session.stage] || []).includes(nextStage)) {
    const error = new Error(`Invalid intake transition: ${session.stage} -> ${nextStage}`);
    error.code = "invalid-intake-transition";
    throw error;
  }
  const next = {
    ...session,
    ...cloneJSON(patch, {}),
    id: session.id,
    cabinId: session.cabinId,
    stage: nextStage,
    revision: Number(session.revision || 0) + 1,
    updatedAt: text(options.now || new Date().toISOString(), 80),
    reason: text(options.reason || patch.reason || nextStage, 240)
  };
  next.sourceRefs = uniqueStrings(next.sourceRefs);
  next.media = cloneJSON(Array.isArray(next.media) ? next.media.slice(0, 120) : [], []);
  next.manualLocks = {
    cabinId: session.cabinId,
    typeId: next.manualLocks?.typeLocked === false ? "" : text(next.manualLocks?.typeId, 100),
    typeLocked: next.manualLocks?.typeLocked !== false && Boolean(text(next.manualLocks?.typeId, 100)),
    presetKeys: uniqueStrings(next.manualLocks?.presetKeys, 120)
  };
  next.candidates = cloneJSON(Array.isArray(next.candidates) ? next.candidates.slice(0, 40) : [], []);
  next.selectedCandidateIds = uniqueStrings(next.selectedCandidateIds, 40);
  next.warnings = uniqueStrings(next.warnings, 40);
  return freezeSession(next);
}

function updateIntakeMaterial(session, input = {}, options = {}) {
  return reviseIntakeSession(session, {
    draft: text(input.draft ?? session.draft, 256 * 1024),
    sourceRefs: input.sourceRefs ?? session.sourceRefs,
    media: input.media ?? session.media,
    manualLocks: {
      cabinId: session.cabinId,
      typeId: input.typeId ?? session.manualLocks.typeId,
      typeLocked: input.typeLocked ?? session.manualLocks.typeLocked,
      presetKeys: input.presetKeys ?? session.manualLocks.presetKeys
    },
    ...(options.clearProposal ? {
      proposalSummary: "",
      proposalJobPath: "",
      candidates: [],
      selectedCandidateIds: [],
      warnings: []
    } : {})
  }, { stage: options.stage || session.stage, reason: options.reason || "material-updated", now: options.now });
}

function beginIntakeUnderstanding(session, options = {}) {
  return reviseIntakeSession(session, {
    warnings: [],
    verification: null
  }, { stage: "understanding", reason: options.reason || "assistant-analysis-started", now: options.now });
}

function attachIntakeProposal(session, proposal = {}, options = {}) {
  if (session.stage !== "understanding" && session.stage !== "proposed") {
    throw Object.assign(new Error("intake proposal requires an understanding session"), { code: "invalid-intake-proposal-state" });
  }
  const candidates = (Array.isArray(proposal.objects) ? proposal.objects : [])
    .filter((item) => item && typeof item === "object")
    .slice(0, 40)
    .map((item, index) => ({
      ...cloneJSON(item, {}),
      id: text(item.id || `candidate-${index + 1}`, 160),
      title: text(item.title || "Untitled object", 300),
      module: text(item.module || session.cabinId, 80).toLowerCase(),
      type: text(item.type, 100).toLowerCase(),
      enabled: item.enabled !== false
    }));
  if (!candidates.length) throw new TypeError("intake proposal requires candidates");
  const selectedCandidateIds = candidates.filter((item) => item.enabled).map((item) => item.id);
  return reviseIntakeSession(session, {
    proposalSummary: text(proposal.summary || "Assistant proposal ready", 600),
    proposalJobPath: text(options.jobPath, 800),
    candidates,
    selectedCandidateIds,
    warnings: uniqueStrings(proposal.questions, 40)
  }, { stage: "proposed", reason: "assistant-proposal-ready", now: options.now });
}

function selectIntakeCandidates(session, ids, options = {}) {
  if (!session.candidates.length) throw new TypeError("intake session has no candidates");
  const allowed = new Set(session.candidates.map((item) => item.id));
  const selectedCandidateIds = uniqueStrings(ids, 40).filter((id) => allowed.has(id));
  return reviseIntakeSession(session, { selectedCandidateIds }, {
    stage: options.reviewed === false ? session.stage : "reviewed",
    reason: "candidate-selection-reviewed",
    now: options.now
  });
}

function intakeSessionSummary(session) {
  const selected = new Set(session.selectedCandidateIds || []);
  const objects = (session.candidates || []).filter((item) => selected.has(item.id));
  return Object.freeze({
    sourceCount: (session.sourceRefs || []).length + (session.media || []).length || (session.draft ? 1 : 0),
    candidateCount: (session.candidates || []).length,
    selectedCount: objects.length,
    relationCount: objects.reduce((sum, item) => sum + (Array.isArray(item.links) ? item.links.length : 0) + (Array.isArray(item.relations) ? item.relations.length : 0), 0),
    warningCount: (session.warnings || []).length,
    lockedCount: Number(session.manualLocks?.typeLocked === true) + (session.manualLocks?.presetKeys || []).length
  });
}

module.exports = {
  INTAKE_STAGES,
  INTAKE_TRANSITIONS,
  attachIntakeProposal,
  beginIntakeUnderstanding,
  createIntakeSession,
  intakeSessionSummary,
  reviseIntakeSession,
  selectIntakeCandidates,
  updateIntakeMaterial
};
