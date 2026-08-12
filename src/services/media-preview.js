"use strict";

function guessMediaKind(source) {
  const value = String(source || "").toLowerCase();
  if (/\.(png|jpe?g|webp|gif|svg|bmp|avif)([?#]|$)/.test(value)) return "image";
  if (/\.pdf([?#]|$)/.test(value)) return "pdf";
  if (/\.(mp4|mov|webm|mkv)([?#]|$)/.test(value)) return "video";
  if (/\.(mp3|flac|wav|m4a|aac|ogg)([?#]|$)/.test(value)) return "audio";
  if (/^https?:/i.test(value)) return "link";
  if (/\.(docx?|xlsx?|pptx?|md|txt)([?#]|$)/.test(value)) return "document";
  return "file";
}

function normalizeMediaSource(raw) {
  return String(raw || "")
    .replace(/^!?\[\[/, "")
    .replace(/\]\]$/, "")
    .split("|")[0]
    .trim();
}

function fallbackMediaDescriptors(frontmatter = {}) {
  const descriptors = [];
  const toList = (value) => value === undefined || value === null
    ? []
    : Array.isArray(value) ? value : [value];
  const add = (raw, kindHint = "") => {
    const source = normalizeMediaSource(raw);
    if (!source) return;
    descriptors.push({
      kind: kindHint || guessMediaKind(source),
      source,
      file: null,
      storage: "external"
    });
  };

  [frontmatter.canonical_path, frontmatter.canonical_uri].forEach((value) => add(value));
  toList(frontmatter.attachment).forEach((value) => add(value));
  toList(frontmatter.attachments).forEach((value) => add(value));
  toList(frontmatter.media_sources).forEach((value) => add(value));
  toList(frontmatter.image_links).forEach((value) => add(value, "image"));
  toList(frontmatter.url).forEach((value) => add(value));
  return descriptors;
}

function selectMediaPreview(descriptors, capabilities = {}) {
  const items = Array.isArray(descriptors) ? descriptors : [];
  const resolveMediaSource = typeof capabilities.resolveMediaSource === "function"
    ? capabilities.resolveMediaSource
    : () => "";
  const isVaultFile = typeof capabilities.isVaultFile === "function"
    ? capabilities.isVaultFile
    : () => false;

  const image = items.find((descriptor) => descriptor?.kind === "image");
  if (image) {
    let src = "";
    try {
      src = resolveMediaSource(image.source) || "";
    } catch (error) {
      src = "";
    }
    if (src) return { kind: "image", src, label: image.source, source: image.source };
  }

  const fileKinds = ["pdf", "audio", "video", "document", "archive"];
  const file = items.find((descriptor) => fileKinds.includes(descriptor?.kind))
    || items.find((descriptor) => isVaultFile(descriptor?.file));
  if (file) {
    return {
      kind: file.kind || "file",
      label: String(file.source || "").split("/").pop() || String(file.source || ""),
      source: String(file.source || "")
    };
  }

  const link = items.find((descriptor) => descriptor?.kind === "link")
    || items.find((descriptor) => /^https?:/i.test(String(descriptor?.source || "")));
  if (link) return { kind: "link", label: String(link.source || ""), source: String(link.source || "") };
  return null;
}

module.exports = {
  fallbackMediaDescriptors,
  guessMediaKind,
  normalizeMediaSource,
  selectMediaPreview
};
