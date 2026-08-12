"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { auditI18n } = require("../scripts/audit-i18n");

test("migrated public source has no direct user-facing literals", () => {
  assert.deepEqual(auditI18n(path.resolve(__dirname, "..")), []);
});

test("i18n audit rejects literals in notices and visible controls", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "magic-os-i18n-"));
  try {
    fs.mkdirSync(path.join(root, "src"));
    fs.writeFileSync(path.join(root, "src", "bad.js"), [
      'new Notice("Saved");',
      'button.createEl("span", { text: "Open" });',
      'setting.setName("Language");'
    ].join("\n"), "utf8");
    const rules = new Set(auditI18n(root).map((item) => item.rule));
    assert.equal(rules.has("notice-literal"), true);
    assert.equal(rules.has("visible-text-literal"), true);
    assert.equal(rules.has("setting-name-literal"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

