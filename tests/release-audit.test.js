"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { auditRepository } = require("../scripts/audit-release");

test("release audit accepts the clean public repository", () => {
  const root = path.resolve(__dirname, "..");
  assert.deepEqual(auditRepository(root), []);
});

test("release audit rejects runtime data, secrets and private paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "magic-os-audit-"));
  try {
    fs.writeFileSync(path.join(root, "data.json"), "{}", "utf8");
    fs.writeFileSync(path.join(root, "leak.js"), 'const key = "sk-abcdefghijklmnopqrstuvwxyz123456";\nconst path = "/Users/private/vault";', "utf8");
    const rules = new Set(auditRepository(root).map((item) => item.rule));
    assert.equal(rules.has("forbidden-file"), true);
    assert.equal(rules.has("openai-key"), true);
    assert.equal(rules.has("mac-user-path"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

