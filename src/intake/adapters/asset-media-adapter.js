"use strict";

const KIND_TO_TYPE = Object.freeze({
  image: "asset-image",
  video: "asset-video",
  audio: "asset-audio",
  pdf: "asset-pdf",
  link: "asset-link",
  archive: "asset-archive",
  document: "asset-document",
  file: "asset-document"
});

function assetKind(item = {}) {
  const explicit = String(item.kind || "").trim().toLowerCase();
  if (KIND_TO_TYPE[explicit]) return explicit;
  const value = String(item.name || item.title || item.path || item.uri || "").toLowerCase();
  if (/\.(png|jpe?g|gif|webp|avif|svg|heic)(?:$|[?#])/i.test(value)) return "image";
  if (/\.(mp4|mov|mkv|webm|m4v)(?:$|[?#])/i.test(value)) return "video";
  if (/\.(mp3|wav|m4a|aac|flac|ogg)(?:$|[?#])/i.test(value)) return "audio";
  if (/\.pdf(?:$|[?#])/i.test(value)) return "pdf";
  if (/\.(zip|7z|rar|tar|gz)(?:$|[?#])/i.test(value)) return "archive";
  if (/^https?:\/\//i.test(value)) return "link";
  return "document";
}

function summarizeAssetMedia(items = []) {
  const media = Array.isArray(items) ? items.filter(Boolean) : [];
  const counts = {};
  media.forEach((item) => {
    const kind = assetKind(item);
    counts[kind] = (counts[kind] || 0) + 1;
  });
  const kinds = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  const primaryKind = kinds[0] || "document";
  return Object.freeze({
    total: media.length,
    counts: Object.freeze({ ...counts }),
    kinds: Object.freeze(kinds),
    primaryKind,
    suggestedTypeId: KIND_TO_TYPE[primaryKind] || "asset-document",
    mixed: kinds.length > 1
  });
}

const assetMediaAdapter = Object.freeze({
  id: "asset-media",
  cabinId: "assets",
  label: "Asset Media Adapter",
  inspect(input = {}) {
    const summary = summarizeAssetMedia(input.media);
    return Object.freeze({
      summary,
      suggestedTypeId: summary.suggestedTypeId,
      warnings: Object.freeze(summary.mixed ? ["asset-media.mixed"] : []),
      sections: Object.freeze(["storage", "identity", "collections", "usage", "source"])
    });
  }
});

module.exports = { KIND_TO_TYPE, assetKind, assetMediaAdapter, summarizeAssetMedia };
