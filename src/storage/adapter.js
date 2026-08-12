"use strict";

function createObsidianStorageCapabilities(app) {
  const vault = app?.vault;
  const fileAt = (path) => vault?.getAbstractFileByPath?.(path);
  return {
    async exists(path) {
      if (vault?.getAbstractFileByPath?.(path)) return true;
      return Boolean(await vault?.adapter?.exists?.(path));
    },
    async createFolder(path) {
      if (!vault?.createFolder) throw new Error("Vault folder creation is unavailable");
      return vault.createFolder(path);
    },
    async read(path) {
      const file = fileAt(path);
      if (!file || !vault?.read) throw new Error("Vault file reading is unavailable");
      return vault.read(file);
    },
    async create(path, content) {
      if (!vault?.create) throw new Error("Vault file creation is unavailable");
      return vault.create(path, content);
    },
    async modify(path, content) {
      const file = fileAt(path);
      if (!file || !vault?.modify) throw new Error("Vault file modification is unavailable");
      return vault.modify(file, content);
    },
    async remove(path) {
      const file = fileAt(path);
      if (!file) throw new Error("Vault file removal is unavailable");
      if (vault?.trash) return vault.trash(file, true);
      if (vault?.delete) return vault.delete(file);
      throw new Error("Vault file removal is unavailable");
    }
  };
}

function createObsidianMediaCapabilities(app) {
  const vault = app?.vault;
  const metadataCache = app?.metadataCache;
  return {
    resolveMediaSource(source) {
      const value = String(source || "").trim();
      if (/^https?:/i.test(value)) return value;
      const file = metadataCache?.getFirstLinkpathDest?.(value, "") || vault?.getAbstractFileByPath?.(value);
      return file && vault?.getResourcePath ? vault.getResourcePath(file) : "";
    },
    isVaultFile(candidate) {
      return Boolean(candidate && typeof candidate === "object" && typeof candidate.path === "string");
    }
  };
}

function createObsidianSecretCapabilities(app) {
  const { createSecretStorageCapabilities } = require("../services/ai-runtime-adapter");
  return createSecretStorageCapabilities(app?.secretStorage);
}

module.exports = { createObsidianMediaCapabilities, createObsidianSecretCapabilities, createObsidianStorageCapabilities };
