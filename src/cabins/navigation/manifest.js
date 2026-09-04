"use strict";

const { defineCabinManifest } = require("../../kernel/contracts");

module.exports = defineCabinManifest({
  id: "navigation",
  labelKey: "module.navigation",
  icon: "orbit",
  accent: "#8d9df0",
  storageRoles: ["raw", "knowledge", "output", "story"],
  objectTypes: [
    { id: "learning-thread", aliases: ["course", "story-thread", "context-thread"], relationFields: ["parent_thread", "related_threads"] },
    { id: "learning-branch", aliases: ["knowledge-branch"], relationFields: ["parent_thread", "related_threads"] },
    { id: "knowledge-card", aliases: ["learning-card"], relationFields: ["related_thread", "related_nodes", "sources"] },
    { id: "knowledge-map", aliases: ["learning-map"], relationFields: ["root_thread", "nodes"] },
    { id: "hobby-note", aliases: ["interest", "hobby"], relationFields: ["related_threads", "related_assets", "sources"] },
    { id: "source-note", aliases: ["study-note", "raw-note", "life-note", "work-note"], relationFields: ["related_thread", "sources"] },
    { id: "output", aliases: ["deliverable"], relationFields: ["related_thread", "sources"] }
  ],
  views: [
    { id: "domains", labelKey: "cabin.navigation.view.domains", kind: "list", primary: true },
    { id: "thread-map", labelKey: "cabin.navigation.view.thread-map", kind: "graph" },
    { id: "thread-grid", labelKey: "cabin.navigation.view.thread-grid", kind: "table" },
    { id: "knowledge-base", labelKey: "cabin.navigation.view.knowledge-base", kind: "table" },
    { id: "pipeline", labelKey: "cabin.navigation.view.pipeline", kind: "board" },
    { id: "learning-trail", labelKey: "cabin.navigation.view.learning-trails", kind: "timeline" },
    { id: "outputs", labelKey: "cabin.navigation.view.outputs", kind: "gallery" },
    { id: "knowledge-map", labelKey: "cabin.navigation.view.knowledge-graph", kind: "graph" },
    { id: "gaps", labelKey: "cabin.navigation.view.gaps", kind: "detail" }
  ],
  actions: [
    { id: "create-learning-thread", labelKey: "cabin.navigation.action.create-learning-thread", authority: "write", transactionRequired: true, objectTypes: ["learning-thread"], agentCallable: true },
    { id: "create-learning-branch", labelKey: "cabin.navigation.action.create-learning-branch", authority: "write", transactionRequired: true, objectTypes: ["learning-branch"], agentCallable: true },
    { id: "create-knowledge-card", labelKey: "cabin.navigation.action.create-knowledge-card", authority: "write", transactionRequired: true, objectTypes: ["knowledge-card"], agentCallable: true },
    { id: "link-knowledge", labelKey: "cabin.navigation.action.link-knowledge", authority: "write", transactionRequired: true, agentCallable: true }
  ],
  healthRules: [
    { id: "missing-entity-id", severity: "warning" },
    { id: "duplicate-entity-id", severity: "error" },
    { id: "unresolved-relation", severity: "warning" }
  ],
  agentCapabilities: ["classify-knowledge", "build-learning-tree", "create-learning-card", "trace-source"]
});
