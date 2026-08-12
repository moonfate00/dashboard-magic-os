"use strict";

const STORAGE_SCHEMA_VERSION = 1;
const STORAGE_PREFERENCES = Object.freeze(["auto", "portable", "legacy-dashboard"]);
const legacyPrivate = (...parts) => ["Dashboard", "Private", ...parts].join("/");

const PORTABLE_STORAGE_PROFILE = Object.freeze({
  id: "portable",
  schemaVersion: STORAGE_SCHEMA_VERSION,
  paths: Object.freeze({
    root: "MagicOS",
    system: "MagicOS/System",
    templates: "MagicOS/Templates",
    views: "MagicOS/Views",
    command: "MagicOS/Records/Command",
    assets: "MagicOS/Records/Assets",
    social: "MagicOS/Records/Social",
    navigation: "MagicOS/Records/Navigation",
    memory: "MagicOS/Records/Memory",
    learning: "MagicOS/Records/Navigation/Learning",
    learningTasks: "MagicOS/Records/Command/Tasks/Learning",
    aiClassify: "MagicOS/System/AI-Classify",
    aiKnowledge: "MagicOS/System/AI-Knowledge",
    aiMemoryCandidates: "MagicOS/System/AI-Memory-Candidates",
    agentRuns: "MagicOS/System/AI-Knowledge/AgentRuns",
    snapshots: "MagicOS/System/Snapshots",
    objectHistory: "MagicOS/System/Object-History",
    structuralChanges: "MagicOS/System/Structural-Changes",
    picoteMigration: "MagicOS/System/Picote-Migration"
  })
});

const LEGACY_DASHBOARD_STORAGE_PROFILE = Object.freeze({
  id: "legacy-dashboard",
  schemaVersion: STORAGE_SCHEMA_VERSION,
  paths: Object.freeze({
    root: "Dashboard",
    system: "Dashboard/System",
    templates: "Dashboard/Templates",
    views: "Dashboard/Views",
    command: legacyPrivate("Modules", "Command"),
    assets: legacyPrivate("Modules", "Assets"),
    social: legacyPrivate("Modules", "Social"),
    navigation: legacyPrivate("Modules", "Navigation"),
    memory: legacyPrivate("Modules", "Memory"),
    learning: legacyPrivate("Modules", "Navigation", "Learning"),
    learningTasks: legacyPrivate("Modules", "Command", "Tasks", "Learning"),
    aiClassify: "Dashboard/System/AI-Classify",
    aiKnowledge: "Dashboard/System/AI-Knowledge",
    aiMemoryCandidates: "Dashboard/System/AI-Memory-Candidates",
    agentRuns: "Dashboard/System/AI-Knowledge/AgentRuns",
    snapshots: "Dashboard/System/Snapshots",
    objectHistory: "Dashboard/System/Object-History",
    structuralChanges: "Dashboard/System/Structural-Changes",
    picoteMigration: legacyPrivate("System", "Picote-Migration")
  })
});

const STORAGE_PROFILES = Object.freeze({
  portable: PORTABLE_STORAGE_PROFILE,
  "legacy-dashboard": LEGACY_DASHBOARD_STORAGE_PROFILE
});

function normalizeStoragePreference(value = "auto") {
  const raw = String(value || "auto").trim().toLowerCase();
  return STORAGE_PREFERENCES.includes(raw) ? raw : "auto";
}

function storageProfileById(value = "portable") {
  const id = normalizeStoragePreference(value);
  return STORAGE_PROFILES[id] || PORTABLE_STORAGE_PROFILE;
}

function assertSafeVaultPath(value) {
  const path = String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!path || path.startsWith("/") || /^[A-Za-z]:\//.test(path) || path.split("/").includes("..")) {
    throw new Error(`Unsafe vault path: ${value}`);
  }
  return path;
}

function storageDirectories(profile) {
  const directories = new Set();
  Object.values(profile?.paths || {}).forEach((value) => {
    const safe = assertSafeVaultPath(value);
    const parts = safe.split("/");
    for (let index = 1; index <= parts.length; index += 1) {
      directories.add(parts.slice(0, index).join("/"));
    }
  });
  return Array.from(directories).sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
}

async function detectStorageState(capabilities = {}, preference = "auto") {
  const exists = typeof capabilities.exists === "function" ? capabilities.exists : async () => false;
  const portableSignals = await Promise.all([
    PORTABLE_STORAGE_PROFILE.paths.root,
    PORTABLE_STORAGE_PROFILE.paths.system,
    PORTABLE_STORAGE_PROFILE.paths.assets
  ].map(async (path) => Boolean(await exists(path))));
  const legacySignals = await Promise.all([
    LEGACY_DASHBOARD_STORAGE_PROFILE.paths.root,
    LEGACY_DASHBOARD_STORAGE_PROFILE.paths.system,
    LEGACY_DASHBOARD_STORAGE_PROFILE.paths.assets
  ].map(async (path) => Boolean(await exists(path))));
  const portableScore = portableSignals.filter(Boolean).length;
  const legacyScore = legacySignals.filter(Boolean).length;
  const detected = portableScore && legacyScore
    ? "mixed"
    : portableScore
      ? "portable"
      : legacyScore
        ? "legacy-dashboard"
        : "empty";
  const selectedPreference = normalizeStoragePreference(preference);
  const recommendedProfileId = selectedPreference !== "auto"
    ? selectedPreference
    : detected === "legacy-dashboard"
      ? "legacy-dashboard"
      : "portable";
  return {
    detected,
    portableScore,
    legacyScore,
    preference: selectedPreference,
    recommendedProfileId,
    profile: storageProfileById(recommendedProfileId),
    needsOnboarding: detected === "mixed" || detected === "empty" || selectedPreference === "auto"
  };
}

async function initializeStorageProfile(capabilities = {}, profileId = "portable") {
  const exists = typeof capabilities.exists === "function" ? capabilities.exists : async () => false;
  const createFolder = capabilities.createFolder;
  if (typeof createFolder !== "function") throw new Error("Storage initializer requires createFolder capability");
  const profile = storageProfileById(profileId);
  const created = [];
  const preserved = [];
  for (const directory of storageDirectories(profile)) {
    if (await exists(directory)) {
      preserved.push(directory);
      continue;
    }
    await createFolder(directory);
    created.push(directory);
  }
  return { profile, created, preserved };
}

module.exports = {
  STORAGE_SCHEMA_VERSION,
  STORAGE_PREFERENCES,
  STORAGE_PROFILES,
  PORTABLE_STORAGE_PROFILE,
  LEGACY_DASHBOARD_STORAGE_PROFILE,
  normalizeStoragePreference,
  storageProfileById,
  assertSafeVaultPath,
  storageDirectories,
  detectStorageState,
  initializeStorageProfile
};
