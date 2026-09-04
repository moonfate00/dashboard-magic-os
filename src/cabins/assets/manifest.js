"use strict";

const { defineCabinManifest } = require("../../kernel/contracts");

module.exports = defineCabinManifest({
  id: "assets",
  labelKey: "module.assets",
  icon: "gallery-horizontal-end",
  accent: "#73c8bc",
  storageRoles: ["media", "library", "raw"],
  objectTypes: [
    { id: "asset-image", aliases: ["image-asset"], relationFields: ["collections", "used_by"] },
    { id: "asset-video", aliases: ["video-asset"], relationFields: ["collections", "used_by"] },
    { id: "asset-audio", aliases: ["audio-asset"], relationFields: ["collections", "used_by"] },
    { id: "asset-document", aliases: ["document-asset", "asset-pdf", "asset-evidence", "asset-archive"], relationFields: ["collections", "used_by"] },
    { id: "asset-link", aliases: ["bookmark", "web-asset"], relationFields: ["collections", "used_by"] },
    { id: "asset-collection", aliases: ["shelf"], relationFields: ["asset_members"] },
    { id: "asset-scene", aliases: ["scene"], relationFields: ["source_asset", "used_by"] }
  ],
  views: [
    { id: "media-wall", labelKey: "cabin.assets.view.media-wall", kind: "gallery", primary: true },
    { id: "shelf", labelKey: "cabin.assets.view.shelves", kind: "board" },
    { id: "inventory", labelKey: "cabin.assets.view.inventory", kind: "table" },
    { id: "inbox", labelKey: "cabin.assets.view.pipeline", kind: "board" },
    { id: "sources", labelKey: "cabin.assets.view.sources", kind: "list" },
    { id: "usage", labelKey: "cabin.assets.view.usage", kind: "graph" }
  ],
  actions: [
    { id: "capture-asset", labelKey: "cabin.assets.action.capture-asset", authority: "write", transactionRequired: true, agentCallable: true },
    { id: "archive-asset", labelKey: "cabin.assets.action.archive-asset", authority: "write", transactionRequired: true, agentCallable: true },
    { id: "add-to-collection", labelKey: "cabin.assets.action.add-to-collection", authority: "write", transactionRequired: true, objectTypes: ["asset-collection"], agentCallable: true },
    { id: "use-as-scene", labelKey: "cabin.assets.action.use-as-scene", authority: "write", transactionRequired: true, objectTypes: ["asset-scene"], agentCallable: true },
    { id: "set-os-background", labelKey: "cabin.assets.action.set-os-background", authority: "write", transactionRequired: true, objectTypes: ["asset-image"], agentCallable: false }
  ],
  healthRules: [
    { id: "missing-entity-id", severity: "warning" },
    { id: "duplicate-entity-id", severity: "error" },
    { id: "unresolved-relation", severity: "warning" }
  ],
  agentCapabilities: ["classify-source", "capture-media", "organize-collection", "trace-asset-usage"]
});
