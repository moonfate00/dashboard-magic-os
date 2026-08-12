"use strict";

const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

function loadSettings() {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === "obsidian") return {
      PluginSettingTab: class {},
      Setting: class {}
    };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve("../src/settings")];
    return require("../src/settings");
  } finally {
    Module._load = originalLoad;
  }
}

test("settings normalize invalid language values without preserving runtime data", () => {
  const { normalizeSettings } = loadSettings();
  assert.deepEqual(normalizeSettings({ interfaceLanguage: "en-US", secret: "ignored" }), {
    interfaceLanguage: "en",
    storagePreference: "auto",
    storageProfileId: "",
    storageSetupCompleted: false,
    storageSchemaVersion: 1
  });
  assert.deepEqual(normalizeSettings({ interfaceLanguage: "invalid" }), {
    interfaceLanguage: "auto",
    storagePreference: "auto",
    storageProfileId: "",
    storageSetupCompleted: false,
    storageSchemaVersion: 1
  });
});
