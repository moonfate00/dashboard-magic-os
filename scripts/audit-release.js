"use strict";

const fs = require("node:fs");
const path = require("node:path");

const TEXT_EXTENSIONS = new Set([".js", ".json", ".md", ".css", ".ts", ".tsx", ".jsx", ".yml", ".yaml", ".txt"]);
const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "coverage"]);
const FORBIDDEN_BASENAMES = new Set(["data.json", ".env", ".env.local", ".DS_Store"]);
const FORBIDDEN_PATH_PARTS = ["Dashboard/Private/", "Object-History/", "Snapshots/", "dashboard-os-backups/"];
const AUDIT_FIXTURE_FILES = new Set(["scripts/audit-release.js", "tests/release-audit.test.js"]);
const FORBIDDEN_ROOT_ENTRIES = new Set(["data.json", ".env", ".env.local"]);
const CONTENT_RULES = [
  { id: "mac-user-path", pattern: /\/Users\/[A-Za-z0-9._-]+\//g },
  { id: "windows-user-path", pattern: /[A-Za-z]:\\Users\\[^\\\s]+\\/g },
  { id: "openai-key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { id: "github-token", pattern: /\bgh[opsu]_[A-Za-z0-9]{20,}\b/g },
  { id: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { id: "development-entitlement", pattern: /MAGIC_OS_AI_ENTITLEMENT_MODE\s*=\s*["']development["']/g, sourceOnly: true },
  { id: "development-entitlement-object", pattern: /\bmode\s*:\s*["']development["']/g, sourceOnly: true },
  { id: "private-vault-path", pattern: /Dashboard\/Private\//g, sourceOnly: true }
];

function walkFiles(root) {
  const files = [];
  const visit = (directory) => {
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      if (IGNORED_DIRECTORIES.has(entry.name)) return;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    });
  };
  visit(root);
  return files;
}

function auditRepository(root) {
  const violations = [];
  fs.readdirSync(root, { withFileTypes: true }).forEach((entry) => {
    if (FORBIDDEN_ROOT_ENTRIES.has(entry.name)) violations.push({ file: entry.name, rule: "forbidden-root-entry" });
    if (entry.isDirectory() && ["Dashboard", ".obsidian", "private", "exports", "runtime", "cache"].includes(entry.name)) {
      violations.push({ file: entry.name, rule: "forbidden-root-directory" });
    }
  });
  walkFiles(root).forEach((file) => {
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (FORBIDDEN_BASENAMES.has(path.basename(file))) violations.push({ file: relative, rule: "forbidden-file" });
    FORBIDDEN_PATH_PARTS.forEach((part) => {
      if (relative.includes(part)) violations.push({ file: relative, rule: "forbidden-path" });
    });
    if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) return;
    if (AUDIT_FIXTURE_FILES.has(relative)) return;
    const stats = fs.statSync(file);
    if (stats.size > 0 && stats.blocks === 0) {
      violations.push({ file: relative, rule: "unavailable-file" });
      return;
    }
    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch (_error) {
      violations.push({ file: relative, rule: "unreadable-file" });
      return;
    }
    CONTENT_RULES.forEach((rule) => {
      if (rule.sourceOnly && !/^(?:src|dist)\//.test(relative)) return;
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(content)) violations.push({ file: relative, rule: rule.id });
    });
  });
  return violations;
}

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const violations = auditRepository(root);
  if (violations.length) {
    console.error("Release audit failed:");
    violations.forEach((item) => console.error(`- ${item.rule}: ${item.file}`));
    process.exitCode = 1;
  } else {
    console.log("Release audit passed: no private runtime files, local user paths, obvious secrets, or development entitlement mode found.");
  }
}

module.exports = { auditRepository };
