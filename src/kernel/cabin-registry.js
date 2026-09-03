"use strict";

const { DEFAULT_CABIN_MANIFESTS } = require("../cabins");
const { CABIN_IDS, defineCabinManifest } = require("./contracts");
const { recordModule, recordType } = require("../services/record-query");

function createCabinRegistry(manifests = DEFAULT_CABIN_MANIFESTS) {
  const normalized = (Array.isArray(manifests) ? manifests : []).map((manifest) => defineCabinManifest(manifest));
  const cabins = new Map();
  const objectTypes = new Map();
  const objectAliases = new Map();
  normalized.forEach((manifest) => {
    if (cabins.has(manifest.id)) throw new TypeError("cabin registry contains a duplicate cabin");
    cabins.set(manifest.id, manifest);
    manifest.objectTypes.forEach((definition) => {
      if (objectTypes.has(definition.id)) throw new TypeError("cabin registry contains a duplicate object type");
      objectTypes.set(definition.id, definition);
      definition.aliases.forEach((alias) => {
        if (objectAliases.has(alias) && objectAliases.get(alias).id !== definition.id) {
          throw new TypeError("cabin registry contains an ambiguous object type alias");
        }
        objectAliases.set(alias, definition);
      });
    });
  });
  const missing = CABIN_IDS.filter((id) => !cabins.has(id));
  if (missing.length) throw new TypeError("cabin registry requires all five cabins");
  const ordered = Object.freeze(CABIN_IDS.map((id) => cabins.get(id)));

  function get(id) {
    return cabins.get(String(id || "").trim().toLowerCase()) || null;
  }

  function objectType(id) {
    const key = String(id || "").trim().toLowerCase().replace(/_/g, "-");
    return objectTypes.get(key) || objectAliases.get(key) || null;
  }

  function resolveRecord(record) {
    const moduleId = recordModule(record);
    if (cabins.has(moduleId)) return cabins.get(moduleId);
    const definition = objectType(recordType(record));
    return definition ? cabins.get(definition.cabinId) : null;
  }

  function objectTypeForRecord(record) {
    const definition = objectType(recordType(record));
    if (!definition) return null;
    const cabin = resolveRecord(record);
    return cabin?.id === definition.cabinId ? definition : null;
  }

  function action(cabinId, actionId) {
    const cabin = get(cabinId);
    const id = String(actionId || "").trim().toLowerCase();
    return cabin?.actions.find((item) => item.id === id) || null;
  }

  function view(cabinId, viewId) {
    const cabin = get(cabinId);
    const id = String(viewId || "").trim().toLowerCase();
    return cabin?.views.find((item) => item.id === id) || null;
  }

  return Object.freeze({
    version: 1,
    ids: CABIN_IDS,
    list: () => ordered,
    get,
    has: (id) => Boolean(get(id)),
    objectType,
    objectTypeForRecord,
    resolveRecord,
    action,
    view
  });
}

module.exports = { createCabinRegistry };
