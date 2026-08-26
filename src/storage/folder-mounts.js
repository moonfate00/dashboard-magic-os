"use strict";

const { assertSafeVaultPath } = require("./profiles");

const FOLDER_MOUNT_SCHEMA_VERSION = 1;
const MAX_FOLDER_MOUNTS = 96;
const MAX_MOUNT_PATH_LENGTH = 480;
const FOLDER_MOUNT_MODULES = Object.freeze(["auto", "command", "assets", "social", "navigation", "memory"]);
const FOLDER_MOUNT_ROLES = Object.freeze([
  "auto", "library", "raw", "knowledge", "output", "media", "people", "health", "tasks", "memory", "story"
]);
const FOLDER_MOUNT_AI_SCOPES = Object.freeze(["manual", "allowed", "excluded"]);
const FOLDER_MOUNT_MEDIA_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "heic",
  "mp4", "mov", "mkv", "webm", "avi", "m4v",
  "mp3", "wav", "m4a", "aac", "flac", "ogg", "opus"
]);

function normalizeMountPath(value) {
  const path = assertSafeVaultPath(value);
  if (path.length > MAX_MOUNT_PATH_LENGTH || path.split("/").some((part) => part.startsWith("."))) {
    throw new Error("Folder mount path is not eligible for indexing");
  }
  return path;
}

function mountId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{5,95}$/.test(id)) throw new Error("Folder mount id is invalid");
  return id;
}

function enumValue(value, allowed, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function suggestFolderMount(pathValue) {
  const path = normalizeMountPath(pathValue);
  const text = path.toLowerCase();
  if (/(?:^|\/)(?:00-raw|raw|inbox|clippings?|transcripts?|papers?)(?:\/|$)/i.test(text)) {
    return Object.freeze({ module: "navigation", role: "raw" });
  }
  if (/(?:^|\/)(?:10-wiki|wiki|knowledge|notes?|study|learning)(?:\/|$)/i.test(text)) {
    return Object.freeze({ module: "navigation", role: "knowledge" });
  }
  if (/(?:^|\/)(?:40-outputs?|outputs?|articles?|deliverables?|portfolio)(?:\/|$)/i.test(text)) {
    return Object.freeze({ module: "navigation", role: "output" });
  }
  if (/(?:^|\/)(?:assets?|media(?:-lib)?|images?|videos?|audio|attachments?)(?:\/|$)/i.test(text)) {
    return Object.freeze({ module: "assets", role: "media" });
  }
  if (/(?:^|\/)(?:people|persons?|contacts?|人物|社交)(?:\/|$)/i.test(text)) {
    return Object.freeze({ module: "social", role: "people" });
  }
  if (/(?:^|\/)(?:health|medical|病例|健康)(?:\/|$)/i.test(text)) {
    return Object.freeze({ module: "social", role: "health" });
  }
  if (/(?:^|\/)(?:tasks?|todos?|actions?|任务)(?:\/|$)/i.test(text)) {
    return Object.freeze({ module: "command", role: "tasks" });
  }
  if (/(?:^|\/)(?:memory|memories|journal|diary|记忆|日记)(?:\/|$)/i.test(text)) {
    return Object.freeze({ module: "memory", role: "memory" });
  }
  if (/(?:^|\/)(?:storyline|stories|novels?|fiction|小说|故事)(?:\/|$)/i.test(text)) {
    return Object.freeze({ module: "navigation", role: "story" });
  }
  return Object.freeze({ module: "auto", role: "library" });
}

function createFolderMountId(path, options = {}) {
  const now = typeof options.now === "function" ? Number(options.now()) : Date.now();
  const random = typeof options.random === "function" ? Number(options.random()) : Math.random();
  const timePart = Math.max(0, Number.isFinite(now) ? now : 0).toString(36);
  const randomPart = Math.floor(Math.max(0, Math.min(0.999999999, Number.isFinite(random) ? random : 0)) * 0xFFFFFF)
    .toString(36).padStart(5, "0");
  const hint = normalizeMountPath(path).split("/").pop().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "folder";
  return `mount-${timePart}-${randomPart}-${hint}`;
}

function normalizeFolderMount(value = {}, options = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Folder mount must be an object");
  const path = normalizeMountPath(value.path);
  const suggestion = suggestFolderMount(path);
  const id = value.id ? mountId(value.id) : createFolderMountId(path, options);
  return Object.freeze({
    id,
    path,
    module: enumValue(value.module, FOLDER_MOUNT_MODULES, suggestion.module),
    role: enumValue(value.role, FOLDER_MOUNT_ROLES, suggestion.role),
    aiScope: enumValue(value.aiScope, FOLDER_MOUNT_AI_SCOPES, "manual"),
    enabled: value.enabled !== false
  });
}

function normalizeFolderMounts(value, options = {}) {
  const input = Array.isArray(value) ? value.slice(0, MAX_FOLDER_MOUNTS * 2) : [];
  const mounts = [];
  const ids = new Set();
  const paths = new Set();
  for (const candidate of input) {
    if (mounts.length >= MAX_FOLDER_MOUNTS) break;
    try {
      const mount = normalizeFolderMount(candidate, options);
      const key = mount.path.toLowerCase();
      if (ids.has(mount.id) || paths.has(key)) continue;
      ids.add(mount.id);
      paths.add(key);
      mounts.push(mount);
    } catch (_error) {}
  }
  return Object.freeze(mounts);
}

function pathInsideMount(pathValue, mountPath) {
  const path = String(pathValue || "").replace(/\\/g, "/").replace(/\/+$/, "");
  const root = normalizeMountPath(mountPath);
  return path === root || path.startsWith(`${root}/`);
}

function resolveFolderMount(path, mounts = []) {
  return normalizeFolderMounts(mounts)
    .filter((mount) => mount.enabled && pathInsideMount(path, mount.path))
    .sort((a, b) => b.path.length - a.path.length || a.path.localeCompare(b.path))[0] || null;
}

function folderMountRoots(mounts = [], moduleIds = []) {
  const requested = new Set((Array.isArray(moduleIds) ? moduleIds : [moduleIds]).map(String).filter(Boolean));
  return normalizeFolderMounts(mounts)
    .filter((mount) => mount.enabled && (!requested.size || mount.module === "auto" || requested.has(mount.module)))
    .map((mount) => mount.path);
}

function summarizeFolderMount(value, records = [], mounts = [value]) {
  const mount = normalizeFolderMount(value);
  const registry = normalizeFolderMounts(mounts);
  const branches = new Set();
  let totalFiles = 0;
  let markdownFiles = 0;
  let mediaFiles = 0;
  let otherFiles = 0;
  let newestMtime = 0;
  for (const record of Array.isArray(records) ? records : []) {
    const path = String(record?.path || record || "").replace(/\\/g, "/").replace(/\/+$/, "");
    if (!path || resolveFolderMount(path, registry)?.id !== mount.id) continue;
    const relative = path === mount.path ? "" : path.slice(mount.path.length + 1);
    if (relative.includes("/")) branches.add(relative.split("/")[0]);
    const ext = String(record?.ext || path.split(".").pop() || "").trim().toLowerCase();
    totalFiles += 1;
    if (ext === "md") markdownFiles += 1;
    else if (FOLDER_MOUNT_MEDIA_EXTENSIONS.has(ext)) mediaFiles += 1;
    else otherFiles += 1;
    newestMtime = Math.max(newestMtime, Number(record?.mtime || record?.file?.stat?.mtime || 0) || 0);
  }
  return Object.freeze({
    mountId: mount.id,
    path: mount.path,
    totalFiles,
    markdownFiles,
    mediaFiles,
    otherFiles,
    branchCount: branches.size,
    newestMtime
  });
}

function replacePathPrefix(path, oldPath, nextPath) {
  if (path === oldPath) return nextPath;
  return path.startsWith(`${oldPath}/`) ? `${nextPath}${path.slice(oldPath.length)}` : path;
}

function followFolderMountRename(mounts = [], oldPathValue, nextPathValue) {
  const oldPath = normalizeMountPath(oldPathValue);
  const nextPath = normalizeMountPath(nextPathValue);
  return normalizeFolderMounts(mounts).map((mount) => {
    const path = replacePathPrefix(mount.path, oldPath, nextPath);
    return path === mount.path ? mount : Object.freeze({ ...mount, path });
  });
}

module.exports = {
  FOLDER_MOUNT_AI_SCOPES,
  FOLDER_MOUNT_MODULES,
  FOLDER_MOUNT_ROLES,
  FOLDER_MOUNT_SCHEMA_VERSION,
  MAX_FOLDER_MOUNTS,
  createFolderMountId,
  folderMountRoots,
  followFolderMountRename,
  normalizeFolderMount,
  normalizeFolderMounts,
  normalizeMountPath,
  pathInsideMount,
  resolveFolderMount,
  summarizeFolderMount,
  suggestFolderMount
};
