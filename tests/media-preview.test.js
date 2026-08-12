"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  fallbackMediaDescriptors,
  guessMediaKind,
  normalizeMediaSource,
  selectMediaPreview
} = require("../src/services/media-preview");

test("media kind inference covers supported preview families", () => {
  assert.equal(guessMediaKind("photo.JPG?x=1"), "image");
  assert.equal(guessMediaKind("manual.pdf#page=2"), "pdf");
  assert.equal(guessMediaKind("voice.m4a"), "audio");
  assert.equal(guessMediaKind("clip.webm"), "video");
  assert.equal(guessMediaKind("notes.docx"), "document");
  assert.equal(guessMediaKind("https://example.com/page"), "link");
});

test("fallback descriptors normalize scalar, list and wikilink fields", () => {
  const descriptors = fallbackMediaDescriptors({
    canonical_path: "![[MagicOS/Assets/manual.pdf|Manual]]",
    attachments: ["MagicOS/Assets/photo.png"],
    image_links: "https://example.com/cover",
    url: "https://example.com/article"
  });
  assert.deepEqual(descriptors.map(({ kind, source }) => ({ kind, source })), [
    { kind: "pdf", source: "MagicOS/Assets/manual.pdf" },
    { kind: "image", source: "MagicOS/Assets/photo.png" },
    { kind: "image", source: "https://example.com/cover" },
    { kind: "link", source: "https://example.com/article" }
  ]);
  assert.equal(normalizeMediaSource("[[MagicOS/Assets/photo.png|Photo]]"), "MagicOS/Assets/photo.png");
});

test("preview selection prefers a resolvable image", () => {
  const result = selectMediaPreview([
    { kind: "image", source: "MagicOS/Assets/photo.png", file: null }
  ], {
    resolveMediaSource: (sourcePath) => `app://vault/${sourcePath}`
  });
  assert.deepEqual(result, {
    kind: "image",
    src: "app://vault/MagicOS/Assets/photo.png",
    label: "MagicOS/Assets/photo.png",
    source: "MagicOS/Assets/photo.png"
  });
});

test("preview selection preserves file, link, and vault-file fallbacks", () => {
  assert.deepEqual(selectMediaPreview([
    { kind: "pdf", source: "docs/manual.pdf", file: null }
  ]), { kind: "pdf", label: "manual.pdf", source: "docs/manual.pdf" });
  assert.deepEqual(selectMediaPreview([
    { kind: "link", source: "https://example.com", file: null }
  ]), { kind: "link", label: "https://example.com", source: "https://example.com" });

  const vaultFile = {};
  assert.deepEqual(selectMediaPreview([
    { kind: "image", source: "MagicOS/Assets/photo.png", file: vaultFile }
  ], {
    resolveMediaSource: () => "",
    isVaultFile: (candidate) => candidate === vaultFile
  }), { kind: "image", label: "photo.png", source: "MagicOS/Assets/photo.png" });
});
