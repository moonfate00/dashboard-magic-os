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

module.exports = { createObsidianStorageCapabilities };

