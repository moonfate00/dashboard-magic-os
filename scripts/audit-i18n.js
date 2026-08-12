"use strict";

const fs = require("node:fs");
const path = require("node:path");

const USER_FACING_LITERAL_RULES = [
  { id: "notice-literal", pattern: /new\s+Notice\s*\(\s*["'`]/g },
  { id: "setting-name-literal", pattern: /\.setName\s*\(\s*["'`]/g },
  { id: "setting-description-literal", pattern: /\.setDesc\s*\(\s*["'`]/g },
  { id: "dropdown-label-literal", pattern: /\.addOption\s*\([^,]+,\s*["'`]/g },
  { id: "visible-text-literal", pattern: /\b(?:text|title|placeholder|aria-label)\s*:\s*["'`]/g },
  { id: "command-name-literal", pattern: /\bname\s*:\s*["'`]/g }
];

function sourceFiles(root) {
  const src = path.join(root, "src");
  const files = [];
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return;
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      const fullPath = path.join(directory, entry.name);
      const relative = path.relative(root, fullPath).split(path.sep).join("/");
      if (entry.isDirectory()) {
        if (relative === "src/i18n/locales") return;
        visit(fullPath);
      } else if (entry.isFile() && /\.(?:js|ts|jsx|tsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    });
  };
  visit(src);
  return files;
}

function auditI18n(root) {
  const violations = [];
  sourceFiles(root).forEach((file) => {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const source = fs.readFileSync(file, "utf8");
    USER_FACING_LITERAL_RULES.forEach((rule) => {
      rule.pattern.lastIndex = 0;
      let match;
      while ((match = rule.pattern.exec(source))) {
        const line = source.slice(0, match.index).split(/\r?\n/).length;
        violations.push({ file: relative, line, rule: rule.id });
      }
    });
  });
  return violations;
}

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const violations = auditI18n(root);
  if (violations.length) {
    console.error("i18n audit failed:");
    violations.forEach((item) => console.error(`- ${item.rule}: ${item.file}:${item.line}`));
    process.exitCode = 1;
  } else {
    console.log("i18n audit passed: migrated source contains no direct user-facing string literals.");
  }
}

module.exports = { auditI18n };

