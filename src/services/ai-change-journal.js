"use strict";

const { assertSafeVaultPath } = require("../storage/profiles");

const JOURNAL_VERSION = 1;
const MAX_JOURNAL_OPERATIONS = 100;
const MAX_JOURNAL_FILE_BYTES = 512 * 1024;
const MAX_JOURNAL_BYTES = 2 * 1024 * 1024;
const ENTRY_STATUSES = new Set([
  "prepared", "applying", "applied", "failed", "rollback-required", "rolled-back", "rollback-failed"
]);
const OPERATION_STATES = new Set(["pending", "applying", "applied", "rolled-back", "rollback-failed"]);

class AIChangeJournalError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AIChangeJournalError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new AIChangeJournalError(code, message);
}

function byteLength(value) {
  return typeof Buffer !== "undefined"
    ? Buffer.byteLength(value, "utf8")
    : new TextEncoder().encode(value).length;
}

function safeId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(id)) fail("journal-corrupt", "AI change journal contains an invalid identifier");
  return id;
}

function safeDate(value) {
  const time = Date.parse(String(value || ""));
  if (!Number.isFinite(time)) fail("journal-corrupt", "AI change journal contains an invalid timestamp");
  return new Date(time).toISOString();
}

function managedRoots(profile = {}) {
  const paths = profile.paths || {};
  return [paths.command, paths.assets, paths.social, paths.navigation, paths.memory, paths.logs]
    .filter(Boolean)
    .map((path) => assertSafeVaultPath(path));
}

function safeRecordPath(value, profile) {
  let path;
  try {
    path = assertSafeVaultPath(String(value || "").normalize("NFC"));
  } catch {
    fail("journal-corrupt", "AI change journal contains an unsafe path");
  }
  const roots = managedRoots(profile);
  if (!/\.md$/i.test(path) || !roots.some((root) => path.startsWith(`${root}/`))) {
    fail("journal-corrupt", "AI change journal targets unmanaged storage");
  }
  return path;
}

function safeContent(value) {
  if (typeof value !== "string" || value.includes("\0") || byteLength(value) > MAX_JOURNAL_FILE_BYTES) {
    fail("journal-corrupt", "AI change journal contains invalid record content");
  }
  return value;
}

function cloneEntry(value) {
  return JSON.parse(JSON.stringify(value));
}

function freezeEntry(entry) {
  entry.operations.forEach(Object.freeze);
  Object.freeze(entry.operations);
  return Object.freeze(entry);
}

function normalizeEntry(input = {}, profile) {
  if (Number(input.version) !== JOURNAL_VERSION) fail("journal-corrupt", "Unsupported AI change journal version");
  const status = String(input.status || "");
  if (!ENTRY_STATUSES.has(status)) fail("journal-corrupt", "AI change journal contains an invalid state");
  if (!Array.isArray(input.operations) || !input.operations.length || input.operations.length > MAX_JOURNAL_OPERATIONS) {
    fail("journal-corrupt", "AI change journal has an invalid operation count");
  }
  const paths = new Set();
  let totalBytes = 0;
  const operations = input.operations.map((operation) => {
    const kind = String(operation?.kind || "");
    const state = String(operation?.state || "");
    if (!["create", "update"].includes(kind) || !OPERATION_STATES.has(state)) {
      fail("journal-corrupt", "AI change journal contains an invalid operation");
    }
    const path = safeRecordPath(operation.path, profile);
    if (paths.has(path)) fail("journal-corrupt", "AI change journal contains duplicate paths");
    paths.add(path);
    const beforeExists = operation.beforeExists === true;
    if (kind === "create" && beforeExists) fail("journal-corrupt", "AI create journal has an invalid original state");
    if (kind === "update" && !beforeExists) fail("journal-corrupt", "AI update journal has an invalid original state");
    const beforeContent = beforeExists ? safeContent(operation.beforeContent) : "";
    const afterContent = safeContent(operation.afterContent);
    totalBytes += byteLength(beforeContent) + byteLength(afterContent);
    if (totalBytes > MAX_JOURNAL_BYTES) fail("journal-corrupt", "AI change journal exceeds the total size limit");
    return {
      id: safeId(operation.id),
      kind,
      path,
      state,
      beforeExists,
      beforeContent,
      afterContent
    };
  });
  return freezeEntry({
    version: JOURNAL_VERSION,
    id: safeId(input.id),
    planId: safeId(input.planId),
    status,
    createdAt: safeDate(input.createdAt),
    updatedAt: safeDate(input.updatedAt),
    operations
  });
}

function requireFunctions(value, names, label) {
  names.forEach((name) => {
    if (typeof value?.[name] !== "function") fail("validation", `${label} requires ${name}`);
  });
}

function safeOperationResult(operation, observed) {
  return Object.freeze({
    id: operation.id,
    kind: operation.kind,
    path: operation.path,
    observed
  });
}

function createAIChangeJournal(options = {}) {
  const persistence = options.persistence;
  const capabilities = options.capabilities;
  const profile = options.profile;
  requireFunctions(persistence, ["write", "readAll", "remove"], "AI change journal persistence");
  requireFunctions(capabilities, ["exists", "read", "modify", "remove"], "AI change journal storage");
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const randomId = typeof options.randomId === "function"
    ? options.randomId
    : () => globalThis.crypto?.randomUUID?.() || `journal-${now()}`;
  const sessions = new WeakMap();
  const recoveryTokens = new WeakMap();

  async function persistenceCall(operation) {
    try {
      return await operation();
    } catch {
      fail("journal-persistence", "AI change journal persistence is unavailable");
    }
  }

  async function persist(entry, control = {}) {
    const normalized = normalizeEntry(entry, profile);
    await persistenceCall(() => persistence.write(
      cloneEntry(normalized),
      Object.freeze({ createOnly: control.createOnly === true })
    ));
    return normalized;
  }

  async function begin(plan, snapshots) {
    if (!plan || !Array.isArray(plan.operations) || !Array.isArray(snapshots) || snapshots.length !== plan.operations.length) {
      fail("validation", "AI change journal requires prepared snapshots");
    }
    const timestamp = new Date(now()).toISOString();
    const entry = await persist({
      version: JOURNAL_VERSION,
      id: safeId(randomId()),
      planId: safeId(plan.id),
      status: "prepared",
      createdAt: timestamp,
      updatedAt: timestamp,
      operations: snapshots.map((snapshot, index) => {
        const operation = plan.operations[index];
        if (snapshot?.operation !== operation || Boolean(snapshot.existed) !== (operation.kind === "update")) {
          fail("validation", "AI change journal snapshot does not match its plan");
        }
        return {
          id: operation.id,
          kind: operation.kind,
          path: operation.path,
          state: "pending",
          beforeExists: Boolean(snapshot.existed),
          beforeContent: snapshot.existed ? snapshot.content : "",
          afterContent: operation.content
        };
      })
    }, { createOnly: true });
    const session = Object.freeze({ id: entry.id });
    sessions.set(session, entry);
    return session;
  }

  function sessionEntry(session) {
    const entry = sessions.get(session);
    if (!entry) fail("journal-session", "AI change journal session is invalid");
    return entry;
  }

  async function update(session, updater) {
    const current = sessionEntry(session);
    const next = cloneEntry(current);
    updater(next);
    next.updatedAt = new Date(now()).toISOString();
    const persisted = await persist(next);
    sessions.set(session, persisted);
    return persisted;
  }

  function operationById(entry, operationId) {
    const operation = entry.operations.find((item) => item.id === operationId);
    if (!operation) fail("journal-session", "AI change journal operation is invalid");
    return operation;
  }

  async function markApplying(session, operationId) {
    await update(session, (entry) => {
      entry.status = "applying";
      const operation = operationById(entry, operationId);
      if (operation.state !== "pending") fail("journal-session", "AI change journal operation cannot start twice");
      operation.state = "applying";
    });
  }

  async function markApplied(session, operationId) {
    await update(session, (entry) => {
      const operation = operationById(entry, operationId);
      if (operation.state !== "applying") fail("journal-session", "AI change journal operation was not started");
      operation.state = "applied";
    });
  }

  async function markRollbackRequired(session) {
    await update(session, (entry) => { entry.status = "rollback-required"; });
  }

  async function markRolledBack(session, operationId) {
    await update(session, (entry) => {
      entry.status = "rollback-required";
      const operation = operationById(entry, operationId);
      if (operation.state !== "applied") fail("journal-session", "AI change journal operation was not applied");
      operation.state = "rolled-back";
    });
  }

  async function markRollbackFailed(session, operationId) {
    await update(session, (entry) => {
      entry.status = "rollback-failed";
      operationById(entry, operationId).state = "rollback-failed";
    });
  }

  async function finish(session, status) {
    if (!["applied", "failed", "rolled-back", "rollback-failed"].includes(status)) {
      fail("journal-session", "AI change journal finish state is invalid");
    }
    await update(session, (entry) => {
      if (status === "applied" && !entry.operations.every((operation) => operation.state === "applied")) {
        fail("journal-session", "AI change journal cannot commit incomplete operations");
      }
      if (status === "rolled-back" && entry.operations.some((operation) => ["applying", "applied"].includes(operation.state))) {
        fail("journal-session", "AI change journal cannot close an incomplete rollback");
      }
      entry.status = status;
    });
  }

  async function close(session) {
    const entry = sessionEntry(session);
    await persistenceCall(() => persistence.remove(entry.id));
    sessions.delete(session);
  }

  async function observe(operation) {
    let exists;
    let content;
    try {
      exists = Boolean(await capabilities.exists(operation.path));
      content = exists ? await capabilities.read(operation.path) : "";
    } catch {
      fail("journal-inspection", "AI change recovery could not inspect a record");
    }
    if (operation.beforeExists ? exists && content === operation.beforeContent : !exists) return "original";
    if (exists && content === operation.afterContent) return "applied";
    return "conflict";
  }

  async function inspectEntry(entry) {
    const observed = [];
    for (const operation of entry.operations) {
      observed.push(safeOperationResult(operation, await observe(operation)));
    }
    const values = observed.map((item) => item.observed);
    let action;
    if (values.includes("conflict")) action = "manual-review";
    else if (entry.status === "applied" && values.every((value) => value === "applied")) action = "completed";
    else if (values.includes("applied")) action = "rollback-safe";
    else action = "abandon-safe";
    return { observed: Object.freeze(observed), action };
  }

  async function inspect() {
    const rawEntries = await persistenceCall(() => persistence.readAll());
    if (!Array.isArray(rawEntries) || rawEntries.length > 100) fail("journal-corrupt", "AI change journal index is invalid");
    const reports = [];
    for (const raw of rawEntries) {
      const entry = normalizeEntry(raw, profile);
      const state = await inspectEntry(entry);
      const token = Object.freeze({ id: entry.id });
      recoveryTokens.set(token, { entry, action: state.action });
      reports.push(Object.freeze({
        id: entry.id,
        planId: entry.planId,
        status: entry.status,
        action: state.action,
        updatedAt: entry.updatedAt,
        operations: state.observed,
        token
      }));
    }
    return Object.freeze(reports);
  }

  async function recover(token, decision = {}) {
    const pending = recoveryTokens.get(token);
    if (!pending) fail("recovery-token", "AI change recovery token is invalid");
    if (decision.confirmed !== true) fail("confirmation-required", "Explicit recovery confirmation is required");
    recoveryTokens.delete(token);
    const currentEntries = await persistenceCall(() => persistence.readAll());
    const raw = Array.isArray(currentEntries) ? currentEntries.find((entry) => entry?.id === pending.entry.id) : null;
    if (!raw) fail("recovery-stale", "AI change journal no longer exists");
    let entry = normalizeEntry(raw, profile);
    const state = await inspectEntry(entry);
    if (state.action !== pending.action) fail("recovery-stale", "AI change recovery state changed after inspection");
    if (state.action === "manual-review") fail("recovery-conflict", "AI change recovery requires manual review");
    if (["completed", "abandon-safe"].includes(state.action)) {
      await persistenceCall(() => persistence.remove(entry.id));
      return Object.freeze({ status: state.action === "completed" ? "completed" : "abandoned", id: entry.id, operations: Object.freeze([]) });
    }

    entry = await persist({ ...cloneEntry(entry), status: "rollback-required", updatedAt: new Date(now()).toISOString() });
    const restored = [];
    for (let index = entry.operations.length - 1; index >= 0; index -= 1) {
      const operation = entry.operations[index];
      if (await observe(operation) !== "applied") continue;
      try {
        if (operation.kind === "create") await capabilities.remove(operation.path);
        else await capabilities.modify(operation.path, operation.beforeContent);
        const next = cloneEntry(entry);
        next.operations[index].state = "rolled-back";
        next.status = "rollback-required";
        next.updatedAt = new Date(now()).toISOString();
        entry = await persist(next);
        restored.push(safeOperationResult(operation, "rolled-back"));
      } catch {
        const failed = cloneEntry(entry);
        failed.operations[index].state = "rollback-failed";
        failed.status = "rollback-failed";
        failed.updatedAt = new Date(now()).toISOString();
        try { await persist(failed); } catch (error) {}
        fail("rollback-failed", "AI change recovery rollback failed");
      }
    }
    await persistenceCall(() => persistence.remove(entry.id));
    return Object.freeze({ status: "rolled-back", id: entry.id, operations: Object.freeze(restored) });
  }

  return Object.freeze({
    begin,
    markApplying,
    markApplied,
    markRollbackRequired,
    markRolledBack,
    markRollbackFailed,
    finish,
    close,
    inspect,
    recover
  });
}

module.exports = {
  AIChangeJournalError,
  ENTRY_STATUSES,
  JOURNAL_VERSION,
  MAX_JOURNAL_FILE_BYTES,
  MAX_JOURNAL_BYTES,
  MAX_JOURNAL_OPERATIONS,
  OPERATION_STATES,
  createAIChangeJournal,
  normalizeEntry
};
