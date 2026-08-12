"use strict";

function createObsidianStorageCapabilities(app) {
  const vault = app?.vault;
  return {
    async exists(path) {
      if (vault?.getAbstractFileByPath?.(path)) return true;
      return Boolean(await vault?.adapter?.exists?.(path));
    },
    async createFolder(path) {
      if (!vault?.createFolder) throw new Error("Vault folder creation is unavailable");
      return vault.createFolder(path);
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
