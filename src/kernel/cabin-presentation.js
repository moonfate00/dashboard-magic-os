"use strict";

const { contractId } = require("./contracts");

function asArray(value) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function text(value, max = 800) {
  return String(value ?? "").trim().slice(0, max);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function normalizeTypeOption(registry, cabinId, candidate = {}) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("presentation type entries must be objects");
  }
  const id = contractId(candidate.id, "presentation.types.id");
  const objectTypeId = contractId(candidate.objectTypeId || candidate.objectType || candidate.variantOf || id, "presentation.types.objectTypeId");
  const definition = registry.objectType(objectTypeId);
  if (!definition || definition.cabinId !== cabinId) {
    throw new TypeError(`presentation type is not registered in cabin: ${cabinId}/${objectTypeId}`);
  }
  return deepFreeze({
    ...cloneValue(candidate),
    id,
    objectTypeId: definition.id,
    variantField: text(candidate.variantField, 80),
    variantValue: candidate.variantValue === undefined ? "" : cloneValue(candidate.variantValue)
  });
}

function normalizeViewOption(registry, cabinId, candidate = {}) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("presentation view entries must be objects");
  }
  const id = contractId(candidate.id, "presentation.views.id");
  const semanticId = contractId(candidate.viewId || id, "presentation.views.viewId");
  const view = registry.view(cabinId, semanticId);
  const maintenance = candidate.maintenance === true;
  if (!view && !maintenance) throw new TypeError(`presentation view is not registered in cabin: ${cabinId}/${semanticId}`);
  return deepFreeze({
    ...cloneValue(candidate),
    id,
    viewId: view?.id || "",
    kind: view?.kind || text(candidate.kind || "detail", 40),
    filters: view?.filters || Object.freeze([]),
    primary: view?.primary === true,
    maintenance
  });
}

function createCabinPresentationCatalog(registry, overlay = {}) {
  if (!registry || typeof registry.list !== "function" || typeof registry.objectType !== "function") {
    throw new TypeError("cabin presentation requires a cabin registry");
  }
  if (!overlay || typeof overlay !== "object" || Array.isArray(overlay)) {
    throw new TypeError("cabin presentation overlay must be an object");
  }
  const knownCabins = new Set(registry.ids);
  Object.keys(overlay).forEach((id) => {
    if (!knownCabins.has(id)) throw new TypeError(`presentation contains an unknown cabin: ${id}`);
  });
  const entries = registry.list().map((manifest) => {
    const extension = overlay[manifest.id] || {};
    if (!extension || typeof extension !== "object" || Array.isArray(extension)) {
      throw new TypeError(`presentation cabin must be an object: ${manifest.id}`);
    }
    ["objectTypes", "actions", "healthRules", "storageRoles"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(extension, field)) {
        throw new TypeError(`presentation cannot redefine semantic field: ${field}`);
      }
    });
    const types = asArray(extension.types).map((item) => normalizeTypeOption(registry, manifest.id, item));
    const views = asArray(extension.views).map((item) => normalizeViewOption(registry, manifest.id, item));
    const typeIds = new Set();
    types.forEach((item) => {
      if (typeIds.has(item.id)) throw new TypeError(`presentation contains duplicate type option: ${manifest.id}/${item.id}`);
      typeIds.add(item.id);
    });
    const viewIds = new Set();
    views.forEach((item) => {
      if (viewIds.has(item.id)) throw new TypeError(`presentation contains duplicate view option: ${manifest.id}/${item.id}`);
      viewIds.add(item.id);
    });
    return deepFreeze({
      id: manifest.id,
      manifest,
      name: text(extension.name || manifest.labelKey, 160),
      accent: text(extension.accent || manifest.accent, 40),
      complement: text(extension.complement, 40),
      icon: text(extension.icon || manifest.icon, 160),
      iconPath: text(extension.iconPath, 800),
      subtitle: text(extension.subtitle, 240),
      roots: asArray(extension.roots).map((item) => text(item, 800)).filter(Boolean),
      tags: asArray(extension.tags).map((item) => text(item, 160)).filter(Boolean),
      dashboard: text(extension.dashboard, 800),
      title: text(extension.title, 240),
      intro: text(extension.intro, 1200),
      folder: text(extension.folder, 800),
      emptyHint: text(extension.emptyHint, 600),
      types,
      presets: deepFreeze(asArray(extension.presets).map(cloneValue)),
      views
    });
  });
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return Object.freeze({
    ids: registry.ids,
    get(id) { return byId.get(String(id || "").trim().toLowerCase()) || null; },
    list() { return Object.freeze([...entries]); }
  });
}

module.exports = { createCabinPresentationCatalog };
