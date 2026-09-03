"use strict";

const { defineCabinManifest } = require("../../kernel/contracts");

module.exports = defineCabinManifest({
  id: "memory",
  labelKey: "module.memory",
  icon: "brain-circuit",
  accent: "#b49be8",
  storageRoles: ["memory"],
  objectTypes: [
    { id: "user-memory", aliases: ["memory"], privacyDefault: "private", relationFields: ["about", "source_records"] },
    { id: "ai-working-memory", aliases: ["working-memory"], privacyDefault: "private", relationFields: ["about", "source_records"] },
    { id: "workflow", aliases: ["agent-workflow"], privacyDefault: "private", relationFields: ["applies_to", "source_records"] },
    { id: "management-log", aliases: ["os-management-log"], privacyDefault: "private", relationFields: ["changed_records"] },
    { id: "memory-review", aliases: ["review-note"], privacyDefault: "private", relationFields: ["reviewed_memories"] }
  ],
  views: [
    { id: "memory-library", labelKey: "cabin.memory.view.memory-library", kind: "list", primary: true },
    { id: "working-memory", labelKey: "cabin.memory.view.working-memory", kind: "board" },
    { id: "workflows", labelKey: "cabin.memory.view.workflows", kind: "table" },
    { id: "management-log", labelKey: "cabin.memory.view.management-log", kind: "timeline" },
    { id: "maintenance", labelKey: "cabin.memory.view.maintenance", kind: "board" }
  ],
  actions: [
    { id: "propose-memory", labelKey: "cabin.memory.action.propose-memory", authority: "write", transactionRequired: true, objectTypes: ["user-memory"], agentCallable: true },
    { id: "update-working-memory", labelKey: "cabin.memory.action.update-working-memory", authority: "write", transactionRequired: true, objectTypes: ["ai-working-memory"], agentCallable: true },
    { id: "save-workflow", labelKey: "cabin.memory.action.save-workflow", authority: "write", transactionRequired: true, objectTypes: ["workflow"], agentCallable: true },
    { id: "append-management-log", labelKey: "cabin.memory.action.append-management-log", authority: "write", transactionRequired: true, objectTypes: ["management-log"], agentCallable: true }
  ],
  healthRules: [
    { id: "missing-entity-id", severity: "warning" },
    { id: "duplicate-entity-id", severity: "error" },
    { id: "sensitive-record-missing-privacy", severity: "error" },
    { id: "memory-missing-review-status", severity: "warning" },
    { id: "unresolved-relation", severity: "warning" }
  ],
  agentCapabilities: ["propose-durable-memory", "maintain-working-memory", "save-workflow", "write-management-log"]
});
