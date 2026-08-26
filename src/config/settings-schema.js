"use strict";

const { normalizeLanguagePreference } = require("../i18n");
const { normalizeFolderMounts } = require("../storage/folder-mounts");
const { normalizeStoragePreference, STORAGE_SCHEMA_VERSION } = require("../storage/profiles");

const DEFAULT_SETTINGS = Object.freeze({
  interfaceLanguage: "auto",
  storagePreference: "auto",
  storageProfileId: "",
  storageSetupCompleted: false,
  storageSchemaVersion: STORAGE_SCHEMA_VERSION,
  folderMounts: Object.freeze([])
});

function normalizeSettings(value = {}) {
  return {
    ...DEFAULT_SETTINGS,
    interfaceLanguage: normalizeLanguagePreference(value.interfaceLanguage),
    storagePreference: normalizeStoragePreference(value.storagePreference),
    storageProfileId: ["portable", "legacy-dashboard"].includes(value.storageProfileId) ? value.storageProfileId : "",
    storageSetupCompleted: value.storageSetupCompleted === true,
    storageSchemaVersion: Math.max(1, Number(value.storageSchemaVersion || STORAGE_SCHEMA_VERSION)),
    folderMounts: normalizeFolderMounts(value.folderMounts)
  };
}

module.exports = { DEFAULT_SETTINGS, normalizeSettings };
