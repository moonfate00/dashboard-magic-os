"use strict";

const { assertSafeVaultPath } = require("./profiles");
const { normalizeFolderMounts, resolveFolderMount } = require("./folder-mounts");

function pathInsideRoot(path, root) {
  const value = String(path || "").replace(/\\/g, "/");
  const safeRoot = assertSafeVaultPath(root);
  return value === safeRoot || value.startsWith(`${safeRoot}/`);
}

function normalizeTags(cache = {}, frontmatter = {}) {
  const values = [];
  if (Array.isArray(cache.tags)) cache.tags.forEach((item) => values.push(item?.tag || item));
  const frontmatterTags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags
    : frontmatter.tags ? [frontmatter.tags] : [];
  frontmatterTags.forEach((tag) => values.push(tag));
  return [...new Set(values.map(String).map((tag) => tag.trim()).filter(Boolean))];
}

function recordFromVaultFile(file, cache = {}) {
  const frontmatter = cache?.frontmatter && typeof cache.frontmatter === "object" ? { ...cache.frontmatter } : {};
  return {
    file,
    path: String(file?.path || ""),
    name: String(file?.basename || file?.name || "").replace(/\.md$/i, ""),
    title: String(frontmatter.title || file?.basename || file?.name || "").replace(/\.md$/i, ""),
    ext: String(file?.extension || "md"),
    type: String(frontmatter.entity_kind || frontmatter.type || ""),
    module: String(frontmatter.module || frontmatter.module_id || ""),
    tags: normalizeTags(cache, frontmatter),
    mtime: Number(file?.stat?.mtime || 0),
    frontmatter
  };
}

async function loadVaultRecords(capabilities = {}, options = {}) {
  const listMarkdownFiles = capabilities.listMarkdownFiles;
  const metadataForFile = capabilities.metadataForFile;
  if (typeof listMarkdownFiles !== "function" || typeof metadataForFile !== "function") {
    throw new TypeError("Record source requires listMarkdownFiles and metadataForFile capabilities");
  }
  const roots = (Array.isArray(options.roots) ? options.roots : [options.root]).filter(Boolean).map(assertSafeVaultPath);
  const mounts = normalizeFolderMounts(options.mounts);
  const files = await listMarkdownFiles();
  return (Array.isArray(files) ? files : [])
    .filter((file) => !roots.length || roots.some((root) => pathInsideRoot(file?.path, root)))
    .map((file) => {
      const record = recordFromVaultFile(file, metadataForFile(file) || {});
      const sourceMount = resolveFolderMount(record.path, mounts);
      return sourceMount ? { ...record, sourceMount } : record;
    })
    .sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path));
}

function createObsidianRecordCapabilities(app) {
  return {
    listMarkdownFiles: () => app?.vault?.getMarkdownFiles?.() || [],
    metadataForFile: (file) => app?.metadataCache?.getFileCache?.(file) || {}
  };
}

module.exports = {
  createObsidianRecordCapabilities,
  loadVaultRecords,
  normalizeTags,
  pathInsideRoot,
  recordFromVaultFile
};
