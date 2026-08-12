"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PORTABLE_STORAGE_PROFILE,
  LEGACY_DASHBOARD_STORAGE_PROFILE,
  assertSafeVaultPath,
  detectStorageState,
  initializeStorageProfile,
  storageDirectories
} = require("../src/storage/profiles");

function memoryStorage(initial = []) {
  const paths = new Set(initial);
  const created = [];
  return {
    paths,
    created,
    capabilities: {
      exists: async (path) => paths.has(path),
      createFolder: async (path) => {
        assert.equal(paths.has(path), false, `initializer tried to recreate ${path}`);
        paths.add(path);
        created.push(path);
      }
    }
  };
}

test("storage profiles keep stable language-neutral internal paths", () => {
  assert.equal(PORTABLE_STORAGE_PROFILE.paths.root, "MagicOS");
  assert.equal(PORTABLE_STORAGE_PROFILE.paths.assets, "MagicOS/Records/Assets");
  assert.equal(LEGACY_DASHBOARD_STORAGE_PROFILE.paths.assets, "Dashboard/Private/Modules/Assets");
  assert.equal(Object.values(PORTABLE_STORAGE_PROFILE.paths).some((value) => /[一-龥]/.test(value)), false);
});

test("vault path validation rejects absolute and traversing paths", () => {
  assert.equal(assertSafeVaultPath("MagicOS/System/"), "MagicOS/System");
  assert.throws(() => assertSafeVaultPath("/MagicOS/System"), /Unsafe vault path/);
  assert.throws(() => assertSafeVaultPath("MagicOS/../Private"), /Unsafe vault path/);
  assert.throws(() => assertSafeVaultPath("C:\\Users\\name\\MagicOS"), /Unsafe vault path/);
});

test("empty vault recommends portable layout without mutating storage", async () => {
  const storage = memoryStorage();
  const state = await detectStorageState(storage.capabilities, "auto");
  assert.equal(state.detected, "empty");
  assert.equal(state.recommendedProfileId, "portable");
  assert.deepEqual(storage.created, []);
});

test("existing Dashboard vault recommends compatibility without migration", async () => {
  const storage = memoryStorage([
    "Dashboard",
    "Dashboard/System",
    "Dashboard/Private/Modules/Assets"
  ]);
  const before = Array.from(storage.paths);
  const state = await detectStorageState(storage.capabilities, "auto");
  assert.equal(state.detected, "legacy-dashboard");
  assert.equal(state.recommendedProfileId, "legacy-dashboard");
  assert.deepEqual(Array.from(storage.paths), before);
  assert.deepEqual(storage.created, []);
});

test("portable initialization is idempotent and preserves existing folders", async () => {
  const storage = memoryStorage(["MagicOS", "MagicOS/System"]);
  const first = await initializeStorageProfile(storage.capabilities, "portable");
  assert.equal(first.preserved.includes("MagicOS"), true);
  assert.equal(first.created.length > 0, true);
  const expected = storageDirectories(PORTABLE_STORAGE_PROFILE);
  assert.deepEqual(Array.from(storage.paths).sort(), expected.sort());
  storage.created.length = 0;
  const second = await initializeStorageProfile(storage.capabilities, "portable");
  assert.equal(second.created.length, 0);
  assert.deepEqual(storage.created, []);
});

test("manual storage preference overrides auto detection without mutation", async () => {
  const storage = memoryStorage(["Dashboard"]);
  const state = await detectStorageState(storage.capabilities, "portable");
  assert.equal(state.detected, "legacy-dashboard");
  assert.equal(state.recommendedProfileId, "portable");
  assert.deepEqual(storage.created, []);
});

