"use strict";

const { assertSafeVaultPath } = require("../storage/profiles");

const CHANGE_PLAN_VERSION = 1;
const CHANGE_KINDS = Object.freeze(["create", "update"]);
const MAX_OPERATIONS = 100;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_PLAN_BYTES = 2 * 1024 * 1024;
const DEFAULT_CONFIRMATION_TTL_MS = 10 * 60 * 1000;

class AIChangePlanError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "AIChangePlanError";
    this.code = code;
    Object.assign(this, detail);
  }
}

function fail(code, message, detail) {
  throw new AIChangePlanError(code, message, detail);
}

function byteLength(value) {
  return typeof Buffer !== "undefined"
    ? Buffer.byteLength(value, "utf8")
    : new TextEncoder().encode(value).length;
}

function safeId(value, fallback) {
  const id = String(value || "").trim();
  if (!id) return fallback;
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(id)) fail("validation", "AI change plan contains an invalid identifier");
  return id;
}

function normalizeRecordPath(value) {
  const raw = String(value || "").trim().normalize("NFC");
  if (!raw || raw.includes("\0") || /[\u0000-\u001f\u007f]/.test(raw)) {
    fail("validation", "AI change plan contains an invalid record path");
  }
  let path;
  try {
    path = assertSafeVaultPath(raw);
  } catch (error) {
    fail("validation", "AI change plan contains an unsafe record path");
  }
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part.startsWith(".") || /[:*?"<>|]/.test(part))) {
    fail("validation", "AI change plan contains a non-portable record path");
  }
  if (!/\.md$/i.test(path)) fail("validation", "AI change plans may only change Markdown records");
  return path;
}

function recordRoots(profile = {}) {
  const paths = profile.paths || {};
  return [paths.command, paths.assets, paths.social, paths.navigation, paths.memory]
    .filter(Boolean)
    .map((path) => assertSafeVaultPath(path));
}

function pathWithinRoots(path, roots) {
  return roots.some((root) => path.startsWith(`${root}/`));
}

function freezePlan(plan) {
  plan.operations.forEach(Object.freeze);
  Object.freeze(plan.operations);
  Object.freeze(plan.summary);
  return Object.freeze(plan);
}

function validateChangePlan(input = {}, options = {}) {
  const version = Number(input.version || CHANGE_PLAN_VERSION);
  if (version !== CHANGE_PLAN_VERSION) fail("validation", "Unsupported AI change plan version");
  const profile = options.profile;
  const roots = recordRoots(profile);
  if (!roots.length) fail("validation", "AI change plan requires an active storage profile");
  if (!Array.isArray(input.operations) || !input.operations.length || input.operations.length > MAX_OPERATIONS) {
    fail("validation", "AI change plan has an invalid operation count");
  }

  const seenPaths = new Set();
  let totalBytes = 0;
  let creates = 0;
  let updates = 0;
  const operations = input.operations.map((candidate, index) => {
    const kind = String(candidate?.kind || "").trim().toLowerCase();
    if (!CHANGE_KINDS.includes(kind)) fail("validation", "AI change plan contains an unsupported operation");
    const path = normalizeRecordPath(candidate?.path);
    if (!pathWithinRoots(path, roots)) fail("validation", "AI change plan targets a path outside managed record storage");
    if (seenPaths.has(path)) fail("validation", "AI change plan targets the same record more than once");
    seenPaths.add(path);
    if (typeof candidate?.content !== "string" || candidate.content.includes("\0")) {
      fail("validation", "AI change plan contains invalid record content");
    }
    const contentBytes = byteLength(candidate.content);
    if (contentBytes > MAX_FILE_BYTES) fail("validation", "AI change plan record exceeds the size limit");
    totalBytes += contentBytes;
    if (totalBytes > MAX_PLAN_BYTES) fail("validation", "AI change plan exceeds the total size limit");
    if (kind === "create") creates += 1;
    else updates += 1;
    return {
      id: safeId(candidate.id, `operation-${index + 1}`),
      kind,
      path,
      content: candidate.content,
      contentBytes
    };
  });

  return freezePlan({
    version,
    id: safeId(input.id, "change-plan"),
    featureId: safeId(input.featureId, "assistant"),
    operations,
    summary: { operations: operations.length, creates, updates, totalBytes }
  });
}

function requireCapabilities(capabilities = {}) {
  ["exists", "read", "create", "modify", "remove"].forEach((name) => {
    if (typeof capabilities[name] !== "function") {
      fail("validation", `AI change protocol requires the ${name} storage capability`);
    }
  });
}

function parentPath(path) {
  return path.split("/").slice(0, -1).join("/");
}

function safeResultOperation(operation, status) {
  return Object.freeze({ id: operation.id, kind: operation.kind, path: operation.path, status });
}

function createAIChangeProtocol(options = {}) {
  const capabilities = options.capabilities || {};
  requireCapabilities(capabilities);
  const profile = options.profile;
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const randomId = typeof options.randomId === "function"
    ? options.randomId
    : () => globalThis.crypto?.randomUUID?.() || `confirmation-${now()}`;
  const ttlMs = Math.max(1000, Math.min(60 * 60 * 1000, Number(options.confirmationTtlMs) || DEFAULT_CONFIRMATION_TTL_MS));
  const onTransition = typeof options.onTransition === "function" ? options.onTransition : async () => {};
  const confirmations = new WeakMap();

  async function emitTransition(event) {
    try {
      await onTransition(Object.freeze(event));
    } catch (error) {
      // State projection is observational. It must never interrupt writes or rollback.
    }
  }

  function preview(input) {
    return validateChangePlan(input, { profile });
  }

  async function prepare(input) {
    const plan = preview(input);
    const snapshots = [];
    for (const operation of plan.operations) {
      if (!await capabilities.exists(parentPath(operation.path))) {
        fail("validation", "AI change plan requires an existing parent folder");
      }
      const exists = Boolean(await capabilities.exists(operation.path));
      if (operation.kind === "create" && exists) fail("conflict", "AI create target already exists");
      if (operation.kind === "update" && !exists) fail("conflict", "AI update target no longer exists");
      snapshots.push(Object.freeze({
        operation,
        existed: exists,
        content: exists ? await capabilities.read(operation.path) : ""
      }));
    }
    const issuedAt = now();
    const confirmation = Object.freeze({
      id: safeId(randomId(), `confirmation-${issuedAt}`),
      planId: plan.id,
      issuedAt: new Date(issuedAt).toISOString(),
      expiresAt: new Date(issuedAt + ttlMs).toISOString(),
      operations: plan.operations.length
    });
    confirmations.set(confirmation, {
      state: "prepared",
      expiresAt: issuedAt + ttlMs,
      plan,
      snapshots
    });
    await emitTransition({ status: "prepared", planId: plan.id, operations: plan.operations.length });
    return Object.freeze({ preview: plan, confirmation });
  }

  function confirmationState(confirmation) {
    const entry = confirmations.get(confirmation);
    if (!entry) fail("confirmation-required", "A valid in-memory confirmation is required");
    return entry;
  }

  function cancel(confirmation) {
    const entry = confirmationState(confirmation);
    if (entry.state !== "prepared") fail("confirmation-used", "AI change confirmation is no longer available");
    entry.state = "cancelled";
    return Object.freeze({ status: "cancelled", planId: entry.plan.id });
  }

  async function assertUnchanged(snapshot) {
    const exists = Boolean(await capabilities.exists(snapshot.operation.path));
    if (snapshot.operation.kind === "create") {
      if (exists) fail("conflict", "AI create target changed after confirmation preview");
      return;
    }
    if (!exists || await capabilities.read(snapshot.operation.path) !== snapshot.content) {
      fail("conflict", "AI update target changed after confirmation preview");
    }
  }

  async function rollback(applied) {
    const restored = [];
    const failed = [];
    for (let index = applied.length - 1; index >= 0; index -= 1) {
      const snapshot = applied[index];
      const { operation } = snapshot;
      try {
        const exists = Boolean(await capabilities.exists(operation.path));
        const current = exists ? await capabilities.read(operation.path) : null;
        if (operation.kind === "create") {
          if (!exists || current !== operation.content) throw new Error("rollback-conflict");
          await capabilities.remove(operation.path);
        } else {
          if (!exists || current !== operation.content) throw new Error("rollback-conflict");
          await capabilities.modify(operation.path, snapshot.content);
        }
        restored.push(safeResultOperation(operation, "rolled-back"));
      } catch (error) {
        failed.push(safeResultOperation(operation, "rollback-failed"));
      }
    }
    return Object.freeze({
      status: failed.length ? "rollback-failed" : "rolled-back",
      restored: Object.freeze(restored),
      failed: Object.freeze(failed)
    });
  }

  async function apply(confirmation, decision = {}) {
    const entry = confirmationState(confirmation);
    if (decision.confirmed !== true) fail("confirmation-required", "Explicit user confirmation is required before AI changes are applied");
    if (entry.state !== "prepared") fail("confirmation-used", "AI change confirmation is no longer available");
    if (now() > entry.expiresAt) {
      entry.state = "expired";
      fail("confirmation-expired", "AI change confirmation has expired");
    }

    // Reserve synchronously before the first await so concurrent calls cannot replay the token.
    entry.state = "applying";
    await emitTransition({ status: "applying", planId: entry.plan.id, operations: entry.plan.operations.length });
    const applied = [];
    let pendingSnapshot = null;
    try {
      for (const snapshot of entry.snapshots) {
        await assertUnchanged(snapshot);
        const { operation } = snapshot;
        pendingSnapshot = snapshot;
        if (operation.kind === "create") await capabilities.create(operation.path, operation.content);
        else await capabilities.modify(operation.path, operation.content);
        applied.push(snapshot);
        pendingSnapshot = null;
      }
      entry.state = "applied";
      await emitTransition({ status: "applied", planId: entry.plan.id, operations: applied.length });
      return Object.freeze({
        status: "applied",
        planId: entry.plan.id,
        operations: Object.freeze(applied.map(({ operation }) => safeResultOperation(operation, "applied")))
      });
    } catch (cause) {
      // Some storage adapters can mutate successfully and then reject. Detect that
      // half-success so it participates in the same reverse-order rollback.
      let uncertainOperation = null;
      if (pendingSnapshot && !applied.includes(pendingSnapshot)) {
        try {
          const exists = Boolean(await capabilities.exists(pendingSnapshot.operation.path));
          const current = exists ? await capabilities.read(pendingSnapshot.operation.path) : null;
          if (exists && current === pendingSnapshot.operation.content) {
            applied.push(pendingSnapshot);
          } else {
            const unchanged = pendingSnapshot.operation.kind === "create"
              ? !exists
              : exists && current === pendingSnapshot.content;
            if (!unchanged) uncertainOperation = pendingSnapshot.operation;
          }
        } catch (error) {
          uncertainOperation = pendingSnapshot.operation;
        }
      }
      if (!applied.length && !uncertainOperation) {
        entry.state = "failed";
        await emitTransition({ status: "failed", planId: entry.plan.id, operations: 0 });
        throw new AIChangePlanError(cause?.code === "conflict" ? "conflict" : "application-failed", "AI changes were not applied", {
          outcome: "failed",
          planId: entry.plan.id
        });
      }
      await emitTransition({ status: "rollback-required", planId: entry.plan.id, operations: applied.length });
      const baseRollback = await rollback(applied);
      const rollbackResult = uncertainOperation
        ? Object.freeze({
          status: "rollback-failed",
          restored: baseRollback.restored,
          failed: Object.freeze([...baseRollback.failed, safeResultOperation(uncertainOperation, "rollback-failed")])
        })
        : baseRollback;
      entry.state = rollbackResult.status;
      await emitTransition({ status: rollbackResult.status, planId: entry.plan.id, operations: applied.length });
      throw new AIChangePlanError(
        rollbackResult.status === "rollback-failed" ? "rollback-failed" : "application-failed",
        rollbackResult.status === "rollback-failed" ? "AI change rollback requires recovery" : "AI changes failed and were rolled back",
        { outcome: rollbackResult.status, planId: entry.plan.id, rollback: rollbackResult }
      );
    }
  }

  return Object.freeze({ preview, prepare, apply, cancel });
}

module.exports = {
  AIChangePlanError,
  CHANGE_KINDS,
  CHANGE_PLAN_VERSION,
  DEFAULT_CONFIRMATION_TTL_MS,
  MAX_FILE_BYTES,
  MAX_OPERATIONS,
  MAX_PLAN_BYTES,
  createAIChangeProtocol,
  validateChangePlan
};
