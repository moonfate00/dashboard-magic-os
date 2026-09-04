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
    { id: "personal-note", privacyDefault: "private", relationFields: ["about", "source_records"] },
    { id: "account-access", privacyDefault: "sensitive", relationFields: ["about", "source_records"] },
    { id: "credential-reference", privacyDefault: "sensitive", relationFields: ["about", "source_records"] },
    { id: "membership-record", privacyDefault: "private", relationFields: ["about", "source_records"] },
    { id: "shortcut-command", privacyDefault: "private", relationFields: ["about", "applies_to"] },
    { id: "terminal-snippet", privacyDefault: "private", relationFields: ["about", "applies_to"] },
    { id: "financial-reference", privacyDefault: "sensitive", relationFields: ["about", "source_records"] },
    { id: "tag-node", privacyDefault: "private", relationFields: ["parent", "children"] },
    { id: "tag-rule", privacyDefault: "private", relationFields: ["applies_to", "source_records"] },
    { id: "context-pack", privacyDefault: "private", relationFields: ["about", "source_records"] },
    { id: "ai-rule", privacyDefault: "private", relationFields: ["applies_to", "source_records"] },
    { id: "mapping-rule", privacyDefault: "private", relationFields: ["applies_to", "source_records"] },
    { id: "cabin-protocol", privacyDefault: "private", relationFields: ["applies_to", "source_records"] },
    { id: "decision-record", privacyDefault: "private", relationFields: ["about", "source_records"] },
    { id: "ai-working-memory", aliases: ["working-memory"], privacyDefault: "private", relationFields: ["about", "source_records"] },
    { id: "workflow", aliases: ["agent-workflow"], privacyDefault: "private", relationFields: ["applies_to", "source_records"] },
    { id: "management-log", aliases: ["os-management-log"], privacyDefault: "private", relationFields: ["changed_records"] },
    { id: "memory-review", aliases: ["review-note"], privacyDefault: "private", relationFields: ["reviewed_memories"] }
  ],
  views: [
    { id: "memory-overview", labelKey: "cabin.memory.view.memory-overview", kind: "list", primary: true },
    { id: "personal-vault", labelKey: "cabin.memory.view.personal-vault", kind: "list" },
    { id: "tag-atlas", labelKey: "cabin.memory.view.tag-atlas", kind: "graph" },
    { id: "shared-codex", labelKey: "cabin.memory.view.shared-codex", kind: "graph" },
    { id: "context-packs", labelKey: "cabin.memory.view.context-packs", kind: "gallery" },
    { id: "memory-line", labelKey: "cabin.memory.view.memory-line", kind: "timeline" },
    { id: "rule-library", labelKey: "cabin.memory.view.rule-library", kind: "table" }
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
