"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createCabinPresentationCatalog, createCabinRegistry } = require("../src/kernel");

test("presentation overlays decorate registered semantics without redefining them", () => {
  const registry = createCabinRegistry();
  const catalog = createCabinPresentationCatalog(registry, {
    command: {
      name: "Command",
      types: [{ id: "quick", objectTypeId: "task", variantField: "task_type", variantValue: "quick", label: "Quick" }],
      views: [{ id: "queue", engine: "list", label: "Queue" }]
    },
    assets: {
      types: [{ id: "asset-pdf", label: "PDF" }],
      views: [{ id: "media-wall", engine: "asset-media" }, { id: "asset-audit", maintenance: true, hidden: true }]
    }
  });
  assert.equal(catalog.get("command").types[0].objectTypeId, "task");
  assert.equal(catalog.get("command").types[0].variantField, "task_type");
  assert.equal(catalog.get("assets").types[0].objectTypeId, "asset-document");
  assert.equal(catalog.get("assets").views[0].viewId, "media-wall");
  assert.equal(catalog.get("assets").views[1].maintenance, true);
  assert.equal(catalog.get("assets").manifest, registry.get("assets"));
});

test("presentation overlays reject semantic drift", () => {
  const registry = createCabinRegistry();
  assert.throws(() => createCabinPresentationCatalog(registry, { unknown: {} }), /unknown cabin/);
  assert.throws(() => createCabinPresentationCatalog(registry, { social: { objectTypes: [] } }), /cannot redefine semantic field/);
  assert.throws(() => createCabinPresentationCatalog(registry, { social: { types: [{ id: "asset-image" }] } }), /not registered in cabin/);
  assert.throws(() => createCabinPresentationCatalog(registry, { social: { views: [{ id: "made-up" }] } }), /not registered in cabin/);
});
