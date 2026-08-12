"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { LOCAL_STATE_KEYS, assertPublicUpgradeData } = require("../src/privacy/data-boundary");
const { PUBLIC_UPGRADE_REGISTRY } = require("../src/upgrades/registry");
const { DEFAULT_SETTINGS, normalizeSettings } = require("../src/config/settings-schema");

const root = path.resolve(__dirname, "..");
const ignored = new Set([".git", "node_modules", "coverage"]);
const forbiddenRuntimeNames = /^(?:data|settings-export|usage-ledger|entitlements?|runtime-cache)\.(?:json|ya?ml)$/i;
const privateDatabaseExtensions = new Set([".db", ".sqlite", ".sqlite3"]);
const reviewedAssetManifest = path.join(root, "assets", "PUBLIC_ASSETS.json");

function walk(directory, files = []) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    if (ignored.has(entry.name)) return;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file, files);
    else if (entry.isFile()) files.push(file);
  });
  return files;
}

function reviewedAssets() {
  if (!fs.existsSync(reviewedAssetManifest)) return new Set();
  const manifest = JSON.parse(fs.readFileSync(reviewedAssetManifest, "utf8"));
  return new Set((manifest.files || []).map(String));
}

function auditPrivacyBoundary() {
  const violations = [];
  const reviewed = reviewedAssets();
  walk(root).forEach((file) => {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const basename = path.basename(file);
    const extension = path.extname(file).toLowerCase();
    if (forbiddenRuntimeNames.test(basename)) violations.push({ file: relative, rule: "runtime-state-file" });
    if (privateDatabaseExtensions.has(extension)) violations.push({ file: relative, rule: "private-database" });
    if (/\.(?:png|jpe?g|webp|gif|avif|mp3|m4a|wav|mp4|mov|pdf)$/i.test(basename)
      && !relative.startsWith("assets/public/") && !reviewed.has(relative)) {
      violations.push({ file: relative, rule: "unreviewed-binary-asset" });
    }
  });

  const normalized = normalizeSettings({
    ...DEFAULT_SETTINGS,
    apiKey: "must-not-survive",
    healthRecords: [{ private: true }],
    usageLedger: { tokens: 1 }
  });
  const unexpectedSettings = Object.keys(normalized).filter((key) => !LOCAL_STATE_KEYS.includes(key));
  if (unexpectedSettings.length) violations.push({ file: "src/settings.js", rule: "local-state-not-whitelisted" });
  try {
    assertPublicUpgradeData(PUBLIC_UPGRADE_REGISTRY);
  } catch (error) {
    violations.push({ file: "src/upgrades/registry.js", rule: `upgrade-boundary: ${error.message}` });
  }
  return violations;
}

if (require.main === module) {
  const violations = auditPrivacyBoundary();
  if (violations.length) {
    console.error("Privacy boundary audit failed:");
    violations.forEach((item) => console.error(`- ${item.rule}: ${item.file}`));
    process.exitCode = 1;
  } else {
    console.log("Privacy boundary audit passed: local state is whitelisted and public upgrades contain metadata only.");
  }
}

module.exports = { auditPrivacyBoundary };
