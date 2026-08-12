"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const RELEASE_FILES = Object.freeze(["main.js", "manifest.json", "styles.css"]);
const PLUGIN_ID = /^[a-z][a-z0-9-]*[a-z0-9]$/;
const ALPHA_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const COMMUNITY_VERSION = /^\d+\.\d+\.\d+$/;

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function auditPackage(options = {}) {
  const violations = [];
  const packageJSON = readJSON(path.join(root, "package.json"));
  const manifest = readJSON(path.join(root, "manifest.json"));
  const versions = readJSON(path.join(root, "versions.json"));
  const versionPattern = options.community === true ? COMMUNITY_VERSION : ALPHA_VERSION;
  if (packageJSON.version !== manifest.version) violations.push("package-version-mismatch");
  if (!versionPattern.test(String(manifest.version || ""))) violations.push(options.community ? "community-version-format" : "version-format");
  if (versions[manifest.version] !== manifest.minAppVersion) violations.push("versions-map-mismatch");
  if (!PLUGIN_ID.test(String(manifest.id || "")) || manifest.id.includes("obsidian") || manifest.id.endsWith("plugin")) violations.push("manifest-id");
  if (!String(manifest.name || "").trim() || /obsidian|plugin/i.test(manifest.name)) violations.push("manifest-name");
  if (!String(manifest.author || "").trim()) violations.push("manifest-author");
  if (typeof manifest.isDesktopOnly !== "boolean") violations.push("manifest-platform");
  for (const required of ["README.md", "README.zh-CN.md", "LICENSE", "PRIVACY.md", "SECURITY.md", "CHANGELOG.md"]) {
    if (!fs.existsSync(path.join(root, required)) || fs.statSync(path.join(root, required)).size === 0) violations.push(`missing-${required}`);
  }

  const actual = fs.existsSync(dist)
    ? fs.readdirSync(dist).filter((file) => file !== ".gitkeep").sort()
    : [];
  if (JSON.stringify(actual) !== JSON.stringify([...RELEASE_FILES].sort())) violations.push("release-file-set");
  RELEASE_FILES.forEach((file) => {
    const target = path.join(dist, file);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile() || fs.statSync(target).size === 0) violations.push(`missing-${file}`);
  });
  if (fs.existsSync(path.join(dist, "manifest.json"))) {
    const builtManifest = readJSON(path.join(dist, "manifest.json"));
    if (JSON.stringify(builtManifest) !== JSON.stringify(manifest)) violations.push("built-manifest-mismatch");
  }
  if (fs.existsSync(path.join(dist, "main.js"))) {
    const main = fs.readFileSync(path.join(dist, "main.js"), "utf8");
    if (/MAGIC_OS_AI_ENTITLEMENT_MODE\s*=\s*["']development["']/.test(main)) violations.push("development-entitlement");
    if (/\/Users\/[A-Za-z0-9._-]+\//.test(main)) violations.push("local-user-path");
    if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(main)) violations.push("provider-secret");
  }
  return violations;
}

if (require.main === module) {
  const violations = auditPackage({ community: process.argv.includes("--community") });
  if (violations.length) {
    console.error("Package audit failed:");
    violations.forEach((violation) => console.error(`- ${violation}`));
    process.exitCode = 1;
  } else {
    console.log("Package audit passed: version metadata and the three reviewed Obsidian release assets are consistent.");
  }
}

module.exports = { RELEASE_FILES, auditPackage };
