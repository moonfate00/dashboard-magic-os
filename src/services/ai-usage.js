"use strict";

const { nonNegativeInteger, normalizeFeatureId } = require("./ai-entitlement");
const { normalizeErrorCode } = require("./ai-job-state");

const LEDGER_PROVIDER_IDS = new Set(["openai", "deepseek"]);

function normalizeProviderId(value) {
  const id = String(value || "").trim().toLowerCase();
  return LEDGER_PROVIDER_IDS.has(id) ? id : "unknown";
}

function createUsageManager(options = {}) {
  const reservations = new Map();
  const openTickets = new Map();
  const ticketStates = new WeakMap();
  let sequence = 0;
  let persistenceQueue = Promise.resolve();
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const save = typeof options.save === "function" ? options.save : async () => {};
  const readState = typeof options.readState === "function" ? options.readState : () => ({ trialRemaining: 0, ledger: [] });
  const writeState = typeof options.writeState === "function" ? options.writeState : () => {};

  function reservationCount() {
    return reservations.size;
  }

  function begin(input = {}) {
    const wantsTrial = input.trial === true && input.billable !== false;
    const current = readState() || {};
    if (wantsTrial && nonNegativeInteger(current.trialRemaining) <= reservations.size) {
      const error = new Error("AI trial quota is exhausted or fully reserved");
      error.code = "trial-ended";
      throw error;
    }
    const id = `ai-usage-${now().getTime()}-${++sequence}`;
    const ticket = Object.freeze({
      id,
      providerId: normalizeProviderId(input.providerId),
      featureId: normalizeFeatureId(input.featureId),
      billable: input.billable !== false,
      trialReserved: wantsTrial,
      startedAt: now().toISOString(),
      get state() { return ticketStates.get(ticket) || "settled"; }
    });
    ticketStates.set(ticket, "open");
    openTickets.set(id, ticket);
    if (ticket.trialReserved) reservations.set(id, ticket);
    return ticket;
  }

  async function settleInternal(ticket, outcome = {}) {
    if (!ticket || ticket.state !== "open" || openTickets.get(ticket.id) !== ticket) {
      return { settled: false, duplicate: true };
    }
    const before = readState() || {};
    const succeeded = outcome.status === "ready";
    const next = {
      trialRemaining: succeeded && ticket.trialReserved
        ? Math.max(0, nonNegativeInteger(before.trialRemaining) - 1)
        : nonNegativeInteger(before.trialRemaining),
      ledger: [{
        id: ticket.id,
        provider: ticket.providerId,
        feature: ticket.featureId,
        status: succeeded ? "ready" : "failed",
        billable: ticket.billable,
        trialCharged: succeeded && ticket.trialReserved,
        inputTokens: nonNegativeInteger(outcome.usage?.input),
        outputTokens: nonNegativeInteger(outcome.usage?.output),
        totalTokens: nonNegativeInteger(outcome.usage?.total),
        cachedTokens: nonNegativeInteger(outcome.usage?.cached),
        startedAt: ticket.startedAt,
        finishedAt: now().toISOString(),
        errorCode: succeeded ? "" : normalizeErrorCode(outcome.errorCode)
      }, ...(Array.isArray(before.ledger) ? before.ledger : [])].slice(0, 120)
    };
    try {
      writeState(next);
      await save(next);
    } catch (error) {
      try { writeState(before); } catch (rollbackError) { error.rollbackError = rollbackError; }
      throw error;
    }
    ticketStates.set(ticket, "settled");
    openTickets.delete(ticket.id);
    reservations.delete(ticket.id);
    return { settled: true, duplicate: false, state: next };
  }

  function settle(ticket, outcome = {}) {
    const operation = persistenceQueue.catch(() => {}).then(() => settleInternal(ticket, outcome));
    persistenceQueue = operation.catch(() => {});
    return operation;
  }

  async function run(input, operation) {
    const ticket = begin(input);
    let result;
    try {
      result = await operation(ticket);
    } catch (error) {
      try {
        await settle(ticket, { status: "failed", errorCode: error?.code || error?.name });
      } catch (settleError) {
        settleError.cause = error;
        settleError.usageTicket = ticket;
        throw settleError;
      }
      throw error;
    }
    try {
      await settle(ticket, { status: "ready", usage: result?.usage });
    } catch (error) {
      error.usageTicket = ticket;
      throw error;
    }
    return result;
  }

  return Object.freeze({ begin, reservationCount, run, settle });
}

module.exports = { LEDGER_PROVIDER_IDS, createUsageManager, normalizeProviderId };
