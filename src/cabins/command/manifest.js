"use strict";

const { defineCabinManifest } = require("../../kernel/contracts");

module.exports = defineCabinManifest({
  id: "command",
  labelKey: "module.command",
  icon: "radar",
  accent: "#efb86a",
  storageRoles: ["tasks"],
  objectTypes: [
    { id: "task", aliases: ["action", "todo"], relationFields: ["project", "goal", "depends_on"] },
    { id: "project", aliases: ["mission"], relationFields: ["goal", "parent_project"] },
    { id: "goal", aliases: ["objective"] },
    { id: "checkpoint", aliases: ["milestone"], relationFields: ["project"] },
    { id: "review", aliases: ["retrospective"], relationFields: ["project", "goal"] }
  ],
  views: [
    { id: "queue", labelKey: "cabin.command.view.queue", kind: "list", primary: true },
    { id: "day", labelKey: "cabin.command.view.day", kind: "list" },
    { id: "week", labelKey: "cabin.command.view.week", kind: "timeline" },
    { id: "month", labelKey: "cabin.command.view.month", kind: "timeline" },
    { id: "year", labelKey: "cabin.command.view.year", kind: "timeline" },
    { id: "data", labelKey: "cabin.command.view.data", kind: "graph" },
    { id: "gantt", labelKey: "cabin.command.view.gantt", kind: "timeline" }
  ],
  actions: [
    { id: "capture-task", labelKey: "cabin.command.action.capture-task", authority: "write", transactionRequired: true, objectTypes: ["task"], agentCallable: true },
    { id: "create-project", labelKey: "cabin.command.action.create-project", authority: "write", transactionRequired: true, objectTypes: ["project"], agentCallable: true },
    { id: "complete-task", labelKey: "cabin.command.action.complete-task", authority: "write", transactionRequired: true, objectTypes: ["task"], agentCallable: true },
    { id: "reschedule-task", labelKey: "cabin.command.action.reschedule-task", authority: "write", transactionRequired: true, objectTypes: ["task"], agentCallable: true }
  ],
  healthRules: [
    { id: "missing-entity-id", severity: "warning" },
    { id: "duplicate-entity-id", severity: "error" }
  ],
  agentCapabilities: ["capture-action", "plan-project", "schedule-action", "review-progress"]
});
