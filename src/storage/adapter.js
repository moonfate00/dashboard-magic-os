"use strict";

const AI_RECOVERY_ROOTS = Object.freeze({
  portable: "MagicOS/System/AI-Recovery",
  "legacy-dashboard": "Dashboard/System/AI-Recovery"
});
const MAX_AI_JOURNAL_PAYLOAD_BYTES = 2 * 1024 * 1024 + 64 * 1024;

function textBytes(value) {
  return typeof Buffer !== "undefined"
    ? Buffer.byteLength(value, "utf8")
    : new TextEncoder().encode(value).length;
}

function safeJournalId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(id)) throw new Error("AI recovery journal id is invalid");
  return id;
}

function safeJournalPayload(value) {
  const payload = String(value || "");
  if (!payload || textBytes(payload) > MAX_AI_JOURNAL_PAYLOAD_BYTES) {
    throw new Error("AI recovery journal payload is invalid");
  }
  return payload;
}

function createObsidianAIJournalPersistence(app, profile = {}) {
  const adapter = app?.vault?.adapter;
  const root = AI_RECOVERY_ROOTS[String(profile.id || "")];
  let operationChain = Promise.resolve();
  if (!root) throw new TypeError("AI recovery persistence requires a supported storage profile");
  ["exists", "read", "write", "rename", "remove", "list"].forEach((name) => {
    if (typeof adapter?.[name] !== "function") throw new TypeError(`AI recovery persistence requires adapter.${name}`);
  });

  const pathsFor = (id) => {
    const base = `${root}/${safeJournalId(id)}.json`;
    return Object.freeze({ target: base, next: `${base}.next`, previous: `${base}.prev` });
  };
  const exists = async (path) => Boolean(await adapter.exists(path));
  const removeIfPresent = async (path) => {
    if (await exists(path)) await adapter.remove(path);
  };
  const ensureRoot = async () => {
    if (await exists(root)) return;
    if (typeof app?.vault?.createFolder === "function") await app.vault.createFolder(root);
    else if (typeof adapter.mkdir === "function") await adapter.mkdir(root);
    else throw new Error("AI recovery directory creation is unavailable");
  };
  const serialized = (operation) => {
    const run = operationChain.then(operation, operation);
    operationChain = run.catch(() => {});
    return run;
  };

  async function write(entry, control = {}) {
    const id = safeJournalId(entry?.id);
    const payload = safeJournalPayload(JSON.stringify(entry));
    const paths = pathsFor(id);
    await ensureRoot();
    await removeIfPresent(paths.next);
    await adapter.write(paths.next, payload);
    const targetExists = await exists(paths.target);
    if (control.createOnly === true && targetExists) {
      await removeIfPresent(paths.next);
      throw new Error("AI recovery journal already exists");
    }
    if (targetExists) {
      await removeIfPresent(paths.previous);
      await adapter.rename(paths.target, paths.previous);
    }
    try {
      await adapter.rename(paths.next, paths.target);
    } catch (error) {
      if (!await exists(paths.target) && await exists(paths.previous)) {
        try { await adapter.rename(paths.previous, paths.target); } catch (restoreError) {}
      }
      await removeIfPresent(paths.next);
      throw new Error("AI recovery journal atomic write failed");
    }
    await removeIfPresent(paths.previous);
  }

  async function reconcile(id) {
    const paths = pathsFor(id);
    const targetExists = await exists(paths.target);
    const previousExists = await exists(paths.previous);
    const nextExists = await exists(paths.next);
    if (targetExists) {
      const payload = safeJournalPayload(await adapter.read(paths.target));
      await removeIfPresent(paths.next);
      await removeIfPresent(paths.previous);
      return payload;
    }
    if (previousExists) {
      await adapter.rename(paths.previous, paths.target);
      await removeIfPresent(paths.next);
      return safeJournalPayload(await adapter.read(paths.target));
    }
    if (nextExists) await removeIfPresent(paths.next);
    return null;
  }

  async function readAll() {
    if (!await exists(root)) return [];
    const listing = await adapter.list(root);
    const names = [...new Set((Array.isArray(listing?.files) ? listing.files : []).flatMap((path) => {
      const name = String(path || "").slice(root.length + 1);
      const match = name.match(/^([A-Za-z0-9._:-]{1,160})\.json(?:\.(?:next|prev))?$/);
      return match ? [match[1]] : [];
    }))].slice(0, 100);
    const entries = [];
    for (const id of names) {
      const payload = await reconcile(id);
      if (!payload) continue;
      try {
        const entry = JSON.parse(payload);
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("invalid");
        entries.push(entry);
      } catch {
        throw new Error("AI recovery journal payload is invalid");
      }
    }
    return entries;
  }

  async function remove(id) {
    const paths = pathsFor(id);
    await removeIfPresent(paths.next);
    await removeIfPresent(paths.previous);
    await removeIfPresent(paths.target);
  }

  return Object.freeze({
    write: (...args) => serialized(() => write(...args)),
    readAll: () => serialized(() => readAll()),
    remove: (...args) => serialized(() => remove(...args)),
    root
  });
}

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

module.exports = {
  AI_RECOVERY_ROOTS,
  MAX_AI_JOURNAL_PAYLOAD_BYTES,
  createObsidianAIJournalPersistence,
  createObsidianMediaCapabilities,
  createObsidianSecretCapabilities,
  createObsidianStorageCapabilities
};
