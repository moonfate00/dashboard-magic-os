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
    { id: "archive-hub", labelKey: "cabin.social.view.archive-hub", kind: "list", primary: true, filters: ["scope"] },
    { id: "directory", labelKey: "cabin.social.view.directory", kind: "list", filters: ["scope"] },
    { id: "relations", labelKey: "cabin.social.view.relations", kind: "graph", filters: ["scope"] },
    { id: "interactions", labelKey: "cabin.social.view.timeline", kind: "timeline", filters: ["scope"] },
    { id: "interaction-matrix", labelKey: "cabin.social.view.interaction-matrix", kind: "table", filters: ["scope"] },
    { id: "items", labelKey: "cabin.social.view.items", kind: "gallery", filters: ["scope"] },
    { id: "followups", labelKey: "cabin.social.view.followups", kind: "board", filters: ["scope"] },
    { id: "health-ledger", labelKey: "cabin.social.view.health-ledger", kind: "table", filters: ["scope"] },
    { id: "privacy", labelKey: "cabin.social.view.privacy", kind: "detail", filters: ["scope"] }
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
