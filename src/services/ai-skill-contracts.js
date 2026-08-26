"use strict";

const { publicURL } = require("./ai-planning-contracts");

const MAX_SKILL_DEFINITION_BYTES = 192 * 1024;
const MAX_SKILL_TASK_BYTES = 64 * 1024;
const MAX_SKILL_REPORT_BYTES = 256 * 1024;

const SKILL_REPORT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: Object.freeze({
    matched: Object.freeze({ type: "boolean" }),
    summary: Object.freeze({ type: "string" }),
    completed: Object.freeze({
      type: "array", maxItems: 32,
      items: Object.freeze({
        type: "object", additionalProperties: false,
        properties: Object.freeze({ item: Object.freeze({ type: "string" }), evidence: Object.freeze({ type: "string" }) }),
        required: Object.freeze(["item", "evidence"])
      })
    }),
    failed: Object.freeze({
      type: "array", maxItems: 32,
      items: Object.freeze({
        type: "object", additionalProperties: false,
        properties: Object.freeze({ item: Object.freeze({ type: "string" }), evidence: Object.freeze({ type: "string" }) }),
        required: Object.freeze(["item", "evidence"])
      })
    }),
    approvals: Object.freeze({
      type: "array", maxItems: 24,
      items: Object.freeze({
        type: "object", additionalProperties: false,
        properties: Object.freeze({
          action: Object.freeze({ type: "string" }), impact: Object.freeze({ type: "string" }), reason: Object.freeze({ type: "string" })
        }),
        required: Object.freeze(["action", "impact", "reason"])
      })
    }),
    report_markdown: Object.freeze({ type: "string" })
  }),
  required: Object.freeze(["matched", "summary", "completed", "failed", "approvals", "report_markdown"])
});

function validationError() {
  const error = new Error("AI Skill contract validation failed");
  error.code = "validation";
  return error;
}

function byteLength(value) {
  return typeof Buffer !== "undefined" ? Buffer.byteLength(value, "utf8") : new TextEncoder().encode(value).length;
}

function credentialSignal(value) {
  const source = String(value || "");
  const compact = source.replace(/\s+/g, " ").trim();
  return /(?:密码|口令|登录码|验证码|password|passwd|pwd)\s*[:：=为\-]?\s*[^\s，。；;]{4,}/i.test(compact)
    || /(?:api[\s_-]?key|access[\s_-]?token|refresh[\s_-]?token|secret|token|密钥)\s*[:：=]\s*[A-Za-z0-9_./+=\-]{8,}/i.test(compact)
    || /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(compact)
    || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source);
}

function localReferenceSignal(value) {
  const source = String(value || "");
  return /!?\[\[[^\]]+\]\]/.test(source)
    || /(?:file:\/\/|\/Users\/|\/home\/|[A-Za-z]:\\)/i.test(source)
    || /(?:^|[\s"'`(])~\/\.?[^\s"'`)]+/m.test(source)
    || /(?:^|[\s"'`(])\.(?:obsidian|trash)\//im.test(source)
    || /(?:^|[\s"'`(])(?:Dashboard|MagicOS)\//im.test(source);
}

function redactLocalReferences(value) {
  return String(value || "")
    .replace(/!?\[\[[^\]]+\]\]/g, "[LOCAL_REFERENCE]")
    .replace(/file:\/\/[^\s"'`)]+/gi, "[LOCAL_REFERENCE]")
    .replace(/(?:\/Users\/|\/home\/)[^\s"'`)]+/gi, "[LOCAL_REFERENCE]")
    .replace(/[A-Za-z]:\\[^\s"'`)]+/g, "[LOCAL_REFERENCE]")
    .replace(/(?:^|([\s"'`(]))~\/\.?[^\s"'`)]+/gm, (_, prefix = "") => `${prefix}[LOCAL_REFERENCE]`)
    .replace(/(?:^|([\s"'`(]))\.(?:obsidian|trash)\/[^\s"'`)]+/gim, (_, prefix = "") => `${prefix}[LOCAL_REFERENCE]`)
    .replace(/(?:^|([\s"'`(]))(?:Dashboard|MagicOS)\/[^\s"'`)]+/gim, (_, prefix = "") => `${prefix}[LOCAL_REFERENCE]`);
}

function activeContentSignal(value) {
  return /<\/?(?:script|style|iframe|object|embed|img|svg|video|audio|link|meta)\b|javascript\s*:|data\s*:\s*text\/html|!\[[^\]]*\]\([^)]+\)/i.test(String(value || ""));
}

function plain(value, maxBytes = MAX_SKILL_REPORT_BYTES, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object" || seen.has(value)) throw validationError();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) throw validationError();
  seen.add(value);
  const output = Array.isArray(value) ? [] : {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || ["__proto__", "prototype", "constructor"].includes(key)) throw validationError();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set || !("value" in descriptor)) throw validationError();
    output[key] = plain(descriptor.value, maxBytes, seen);
  }
  seen.delete(value);
  if (seen.size === 0 && byteLength(JSON.stringify(output)) > maxBytes) throw validationError();
  return output;
}

function inputText(value, maxBytes, required = true) {
  const source = String(value || "").trim();
  if ((required && !source) || byteLength(source) > maxBytes || source.includes("\0") || credentialSignal(source)) throw validationError();
  return redactLocalReferences(source);
}

function outputText(value, maxLength, required = false) {
  const source = String(value || "").trim();
  if ((required && !source) || source.length > maxLength || source.includes("\0")) throw validationError();
  if (credentialSignal(source) || localReferenceSignal(source) || activeContentSignal(source)) throw validationError();
  const urls = source.match(/https?:\/\/[^\s<>{}"']+/gi) || [];
  urls.forEach((url) => publicURL(url.replace(/[),.;，。；]+$/u, "")));
  return source;
}

function prepareSkillExecution(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw validationError();
  const skillName = String(input.skillName || "").trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillName) || skillName.length > 64) throw validationError();
  const skillDefinition = inputText(input.skillDefinition, MAX_SKILL_DEFINITION_BYTES);
  const task = inputText(input.task, MAX_SKILL_TASK_BYTES);
  const prompt = JSON.stringify({
    contract: "magic-os-read-only-skill-v1",
    skillName,
    skillDefinition,
    task,
    authority: "Read-only reasoning only. No tools, file access, network access, writes, messages, publishing, deletion, or external actions. Put every proposed side effect in approvals."
  });
  return Object.freeze({ skillName, skillDefinition, task, prompt });
}

function normalizeItems(value, limit) {
  if (!Array.isArray(value) || value.length > limit) throw validationError();
  return Object.freeze(value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw validationError();
    return Object.freeze({ item: outputText(entry.item, 2000, true), evidence: outputText(entry.evidence, 4000) });
  }));
}

function normalizeSkillReport(value) {
  const raw = plain(value);
  if (typeof raw.matched !== "boolean") throw validationError();
  if (!Array.isArray(raw.approvals) || raw.approvals.length > 24) throw validationError();
  const approvals = Object.freeze(raw.approvals.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw validationError();
    return Object.freeze({
      action: outputText(entry.action, 1000, true),
      impact: outputText(entry.impact, 2000, true),
      reason: outputText(entry.reason, 2000, true)
    });
  }));
  return Object.freeze({
    matched: raw.matched,
    summary: outputText(raw.summary, 4000, true),
    completed: normalizeItems(raw.completed, 32),
    failed: normalizeItems(raw.failed, 32),
    approvals,
    report_markdown: outputText(raw.report_markdown, 100000)
  });
}

module.exports = {
  MAX_SKILL_DEFINITION_BYTES,
  MAX_SKILL_REPORT_BYTES,
  MAX_SKILL_TASK_BYTES,
  SKILL_REPORT_SCHEMA,
  credentialSignal,
  localReferenceSignal,
  normalizeSkillReport,
  prepareSkillExecution,
  redactLocalReferences,
  validationError
};
