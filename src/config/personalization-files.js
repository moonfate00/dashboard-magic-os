"use strict";

const { MAX_PERSONALIZATION_BYTES } = require("./personalization");

const PERSONALIZATION_FILENAME = "dashboard-magic-os-personalization-v1.json";

function downloadTextFile(text, filename = PERSONALIZATION_FILENAME, environment = globalThis) {
  const document = environment?.document;
  const URL = environment?.URL;
  const Blob = environment?.Blob;
  if (!document?.createElement || !URL?.createObjectURL || typeof Blob !== "function") {
    const error = new Error("File download is unavailable");
    error.code = "file-unavailable";
    throw error;
  }
  const blob = new Blob([String(text || "")], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = String(filename || PERSONALIZATION_FILENAME);
    anchor.rel = "noopener";
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function pickTextFile(environment = globalThis) {
  const document = environment?.document;
  if (!document?.createElement) {
    const error = new Error("File picker is unavailable");
    error.code = "file-unavailable";
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.multiple = false;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (Number(file.size || 0) > MAX_PERSONALIZATION_BYTES) {
        const error = new Error("Personalization package exceeds the size limit");
        error.code = "size";
        return reject(error);
      }
      if (typeof file.text !== "function") {
        const error = new Error("File reading is unavailable");
        error.code = "file-unavailable";
        return reject(error);
      }
      try { return resolve(await file.text()); } catch {
        const error = new Error("Personalization file could not be read");
        error.code = "file-read";
        return reject(error);
      }
    }, { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

module.exports = { PERSONALIZATION_FILENAME, downloadTextFile, pickTextFile };
