"use strict";

const {
  attachIntakeProposal,
  beginIntakeUnderstanding,
  createIntakeSession,
  intakeSessionSummary,
  selectIntakeCandidates,
  updateIntakeMaterial
} = require("./session");
const { createIntakeAdapterRegistry } = require("./adapters/registry");

function createIntakeRuntime(options = {}) {
  const sessions = new Map();
  const adapters = createIntakeAdapterRegistry(options.adapters);
  return Object.freeze({
    adapters,
    create(input) {
      const session = createIntakeSession(input);
      sessions.set(session.id, session);
      return session;
    },
    get(id) { return sessions.get(String(id || "")) || null; },
    update(session, input, updateOptions) {
      const next = updateIntakeMaterial(session, input, updateOptions);
      sessions.set(next.id, next);
      return next;
    },
    begin(session, beginOptions) {
      const next = beginIntakeUnderstanding(session, beginOptions);
      sessions.set(next.id, next);
      return next;
    },
    propose(session, proposal, proposalOptions) {
      const next = attachIntakeProposal(session, proposal, proposalOptions);
      sessions.set(next.id, next);
      return next;
    },
    select(session, ids, selectOptions) {
      const next = selectIntakeCandidates(session, ids, selectOptions);
      sessions.set(next.id, next);
      return next;
    },
    summary: intakeSessionSummary,
    remove(id) { return sessions.delete(String(id || "")); }
  });
}

module.exports = { createIntakeRuntime };
