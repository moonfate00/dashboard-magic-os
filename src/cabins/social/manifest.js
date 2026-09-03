"use strict";

const { defineCabinManifest } = require("../../kernel/contracts");

module.exports = defineCabinManifest({
  id: "social",
  labelKey: "module.social",
  icon: "users-round",
  accent: "#dc91a8",
  storageRoles: ["people", "health"],
  objectTypes: [
    { id: "person", aliases: ["people"], privacyDefault: "private", relationFields: ["organizations", "related_people"] },
    { id: "organization", aliases: ["org"], privacyDefault: "internal", relationFields: ["members"] },
    { id: "interaction", aliases: ["contact-event"], privacyDefault: "private", relationFields: ["people", "organization"] },
    { id: "social-event", aliases: ["event"], privacyDefault: "private", relationFields: ["people", "organization"] },
    { id: "social-item", aliases: ["item"], privacyDefault: "private", relationFields: ["owner", "people"] },
    { id: "health-record", aliases: ["medical-record"], privacyDefault: "sensitive", relationFields: ["person", "patient"] }
  ],
  views: [
    { id: "directory", labelKey: "cabin.social.view.directory", kind: "list", primary: true },
    { id: "relations", labelKey: "cabin.social.view.relations", kind: "graph" },
    { id: "timeline", labelKey: "cabin.social.view.timeline", kind: "timeline" },
    { id: "followups", labelKey: "cabin.social.view.followups", kind: "board" },
    { id: "health", labelKey: "cabin.social.view.health", kind: "detail" }
  ],
  actions: [
    { id: "create-person", labelKey: "cabin.social.action.create-person", authority: "write", transactionRequired: true, objectTypes: ["person"], agentCallable: true },
    { id: "record-interaction", labelKey: "cabin.social.action.record-interaction", authority: "write", transactionRequired: true, objectTypes: ["interaction"], agentCallable: true },
    { id: "create-health-record", labelKey: "cabin.social.action.create-health-record", authority: "write", transactionRequired: true, objectTypes: ["health-record"], agentCallable: true },
    { id: "merge-person", labelKey: "cabin.social.action.merge-person", authority: "write", transactionRequired: true, objectTypes: ["person"], agentCallable: false }
  ],
  healthRules: [
    { id: "missing-entity-id", severity: "warning" },
    { id: "duplicate-entity-id", severity: "error" },
    { id: "sensitive-record-missing-privacy", severity: "error" },
    { id: "unresolved-relation", severity: "warning" }
  ],
  agentCapabilities: ["identify-person", "create-profile", "record-interaction", "manage-health-record"]
});
