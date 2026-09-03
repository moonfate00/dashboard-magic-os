"use strict";

const { assetMediaAdapter } = require("./asset-media-adapter");
const { learningHierarchyAdapter } = require("./learning-hierarchy-adapter");

const CABIN_IDS = Object.freeze(["command", "assets", "social", "navigation", "memory"]);

function genericAdapter(cabinId, sections) {
  return Object.freeze({
    id: `${cabinId}-intake`,
    cabinId,
    label: `${cabinId} Intake Adapter`,
    inspect(input = {}) {
      return Object.freeze({
        summary: Object.freeze({ total: Number(Boolean(input.draft)) + (input.sourceRefs || []).length }),
        suggestedTypeId: String(input.typeId || ""),
        warnings: Object.freeze([]),
        sections: Object.freeze([...sections])
      });
    }
  });
}

const DEFAULT_INTAKE_ADAPTERS = Object.freeze([
  genericAdapter("command", ["outcome", "schedule", "priority", "relations", "source"]),
  assetMediaAdapter,
  genericAdapter("social", ["identity", "privacy", "relations", "source"]),
  learningHierarchyAdapter,
  genericAdapter("memory", ["memory-class", "privacy", "lifespan", "source"])
]);

function createIntakeAdapterRegistry(adapters = DEFAULT_INTAKE_ADAPTERS) {
  const entries = new Map();
  (Array.isArray(adapters) ? adapters : []).forEach((adapter) => {
    if (!adapter || !CABIN_IDS.includes(adapter.cabinId) || typeof adapter.inspect !== "function") {
      throw new TypeError("invalid intake adapter");
    }
    if (entries.has(adapter.cabinId)) throw new TypeError(`duplicate intake adapter: ${adapter.cabinId}`);
    entries.set(adapter.cabinId, adapter);
  });
  const missing = CABIN_IDS.filter((id) => !entries.has(id));
  if (missing.length) throw new TypeError(`intake adapters missing cabins: ${missing.join(", ")}`);
  return Object.freeze({
    ids: CABIN_IDS,
    get(cabinId) { return entries.get(String(cabinId || "").trim().toLowerCase()) || null; },
    inspect(cabinId, input) {
      const adapter = this.get(cabinId);
      if (!adapter) throw new TypeError(`unknown intake cabin: ${cabinId}`);
      return adapter.inspect(input);
    },
    list() { return Object.freeze(CABIN_IDS.map((id) => entries.get(id))); }
  });
}

module.exports = { CABIN_IDS, DEFAULT_INTAKE_ADAPTERS, createIntakeAdapterRegistry };
