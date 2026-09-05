"use strict";

const { createObjectOperationPlan } = require("../kernel/object-workbench");

class ObjectCommandError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "ObjectCommandError";
    this.code = code;
    Object.assign(this, detail);
  }
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  return value;
}

function applyObjectPatch(frontmatter = {}, patch = {}, removeFields = []) {
  const next = cloneValue(frontmatter && typeof frontmatter === "object" && !Array.isArray(frontmatter) ? frontmatter : {});
  Object.entries(patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {})
    .forEach(([field, value]) => { next[field] = cloneValue(value); });
  (Array.isArray(removeFields) ? removeFields : []).forEach((field) => { delete next[field]; });
  return next;
}

function preparedProjection(plan, changePreview, origin, noop = false) {
  return Object.freeze({
    id: plan.id,
    schema: "magic-os-object-command/v1",
    origin,
    kind: plan.kind,
    status: noop ? "noop" : "prepared",
    blocked: false,
    noop,
    confirmationRequired: plan.confirmationRequired,
    recordCount: plan.recordCount,
    risks: Object.freeze(plan.assessments.flatMap((assessment) => assessment.risks)),
    mutation: Object.freeze({
      operations: Number(changePreview?.summary?.operations || 0),
      creates: Number(changePreview?.summary?.creates || 0),
      updates: Number(changePreview?.summary?.updates || 0)
    })
  });
}

function createObjectCommandExecutor(options = {}) {
  const registry = options.registry;
  if (!registry?.resolveRecord) throw new TypeError("object command executor requires a cabin registry");
  if (typeof options.createProtocol !== "function") throw new TypeError("object command executor requires a mutation protocol factory");
  if (typeof options.readContent !== "function") throw new TypeError("object command executor requires record reading");
  if (typeof options.parseFrontmatter !== "function") throw new TypeError("object command executor requires frontmatter parsing");
  if (typeof options.composeContent !== "function") throw new TypeError("object command executor requires frontmatter composition");
  const resolveRecord = typeof options.resolveRecord === "function" ? options.resolveRecord : () => null;
  const onApplied = typeof options.onApplied === "function" ? options.onApplied : async () => {};
  const tickets = new WeakMap();

  async function prepare(input = {}) {
    const origin = String(input.origin || "manual").trim().toLowerCase() === "agent" ? "agent" : "manual";
    const plan = createObjectOperationPlan({ ...input, registry });
    if (plan.blocked) {
      throw new ObjectCommandError("blocked", "Object command was blocked by the transition guard", {
        risks: plan.assessments.flatMap((assessment) => assessment.risks.filter((risk) => risk.severity === "block"))
      });
    }
    const suppliedRecords = [
      ...(Array.isArray(input.records) ? input.records : input.record ? [input.record] : []),
      ...(Array.isArray(input.changes) ? input.changes.map((change) => change?.record) : [])
    ].filter(Boolean);
    const recordsByPath = new Map(suppliedRecords.filter((record) => record.path).map((record) => [record.path, record]));
    const operations = [];
    for (const [index, change] of plan.changes.entries()) {
      const record = recordsByPath.get(change.path) || await resolveRecord(change.path, change.entityId);
      if (!record?.path || record.path !== change.path) throw new ObjectCommandError("stale-record", "Object command target is no longer available");
      const beforeContent = String(await options.readContent(record));
      const beforeFrontmatter = await options.parseFrontmatter(beforeContent, record);
      const afterFrontmatter = applyObjectPatch(beforeFrontmatter, change.patch, change.removeFields);
      const afterContent = String(await options.composeContent(beforeContent, afterFrontmatter, record));
      if (afterContent === beforeContent) continue;
      operations.push({
        id: `object-change-${index + 1}`,
        kind: "update",
        path: change.path,
        content: afterContent
      });
    }
    if (!operations.length) {
      const result = preparedProjection(plan, null, origin, true);
      tickets.set(result, { state: "noop", plan, paths: [], context: input.context || null });
      return result;
    }
    const paths = operations.map((operation) => operation.path);
    const protocol = options.createProtocol(Object.freeze({ origin, allowedPaths: Object.freeze([...paths]) }));
    if (!protocol || typeof protocol.prepare !== "function" || typeof protocol.apply !== "function") {
      throw new TypeError("object command mutation protocol is invalid");
    }
    const prepared = await protocol.prepare({
      version: 1,
      id: plan.id,
      featureId: `object-command-${origin}`,
      operations
    });
    const result = preparedProjection(plan, prepared.preview, origin);
    tickets.set(result, { state: "prepared", plan, paths, protocol, confirmation: prepared.confirmation, context: input.context || null });
    return result;
  }

  async function prepareCreate(input = {}) {
    const origin = String(input.origin || "manual").trim().toLowerCase() === "agent" ? "agent" : "manual";
    const creates = (Array.isArray(input.creates) ? input.creates : []).filter(Boolean);
    if (!creates.length || creates.length > 100) throw new ObjectCommandError("validation", "Object creation command has an invalid record count");
    const records = creates.map((item) => {
      if (!item.record || item.record.path !== item.path || typeof item.content !== "string") {
        throw new ObjectCommandError("validation", "Object creation command requires matching record metadata and content");
      }
      return item.record;
    });
    const plan = createObjectOperationPlan({ kind: "create", records, registry, options: input.options || {} });
    if (plan.blocked) {
      throw new ObjectCommandError("blocked", "Object creation was blocked by the transition guard", {
        risks: plan.assessments.flatMap((assessment) => assessment.risks.filter((risk) => risk.severity === "block"))
      });
    }
    const operations = creates.map((item, index) => ({
      id: `object-create-${index + 1}`,
      kind: "create",
      path: item.path,
      content: item.content
    }));
    const paths = operations.map((operation) => operation.path);
    const protocol = options.createProtocol(Object.freeze({ origin, allowedPaths: Object.freeze([...paths]) }));
    if (!protocol || typeof protocol.prepare !== "function" || typeof protocol.apply !== "function") {
      throw new TypeError("object command mutation protocol is invalid");
    }
    const prepared = await protocol.prepare({
      version: 1,
      id: plan.id,
      featureId: `object-command-${origin}`,
      operations
    });
    const result = preparedProjection(plan, prepared.preview, origin);
    tickets.set(result, { state: "prepared", plan, paths, protocol, confirmation: prepared.confirmation, context: input.context || null });
    return result;
  }

  function cancel(prepared) {
    const ticket = tickets.get(prepared);
    if (!ticket || ticket.state !== "prepared") return false;
    ticket.state = "cancelled";
    tickets.delete(prepared);
    ticket.protocol.cancel(ticket.confirmation);
    return true;
  }

  async function apply(prepared, decision = {}) {
    const ticket = tickets.get(prepared);
    if (!ticket) throw new ObjectCommandError("confirmation-required", "Object command requires a fresh prepared ticket");
    tickets.delete(prepared);
    if (ticket.state === "noop") return Object.freeze({ status: "noop", planId: ticket.plan.id, operations: Object.freeze([]) });
    if (decision.confirmed !== true) {
      ticket.protocol.cancel(ticket.confirmation);
      throw new ObjectCommandError("confirmation-required", "Object command requires an explicit interface action");
    }
    const result = await ticket.protocol.apply(ticket.confirmation, { confirmed: true });
    await onApplied(Object.freeze([...ticket.paths]), Object.freeze({ origin: prepared.origin, plan: ticket.plan, result, context: ticket.context }));
    return result;
  }

  return Object.freeze({ prepare, prepareCreate, apply, cancel });
}

module.exports = { ObjectCommandError, applyObjectPatch, createObjectCommandExecutor };
