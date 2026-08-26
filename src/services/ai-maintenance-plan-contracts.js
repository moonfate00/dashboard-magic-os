"use strict";

const { publicURL } = require("./ai-planning-contracts");

const MAX_EXISTING_CONTEXT_BYTES = 1024 * 1024;
const MAX_CARD_LIBRARY_CONTEXT_BYTES = 128 * 1024;
const MODULE_IDS = new Set(["command", "assets", "social", "navigation", "memory"]);
const OPERATIONS = new Set(["add", "append", "replace"]);
const QUESTION_TYPES = new Set(["single", "multiple", "judge"]);
const PROTECTED_FIELDS = new Set([
  "type", "module", "entity_id", "entity_kind", "created", "source_type", "source_module",
  "source_port", "source_stickies", "source_job", "privacy", "ai_scope", "sensitivity"
]);
const SECRET_FIELD = /(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|cvv|cvc|pin|recovery|credential)/i;

const EXISTING_FILE_PATCH_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "integer", enum: [1] },
    mode: { type: "string", enum: ["existing-files"] },
    target_module: { type: "string" },
    summary: { type: "string" },
    files: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          source_token: { type: "string" }, title: { type: "string" }, suggested_type: { type: "string" },
          confidence: { type: "number" },
          patches: {
            type: "array",
            maxItems: 40,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                field: { type: "string" }, operation: { type: "string", enum: ["add", "append", "replace"] },
                value_json: { type: "string" }, confidence: { type: "number" }, reason: { type: "string" }, evidence: { type: "string" }
              },
              required: ["field", "operation", "value_json", "confidence", "reason", "evidence"]
            }
          },
          warnings: { type: "array", items: { type: "string" } }
        },
        required: ["source_token", "title", "suggested_type", "confidence", "patches", "warnings"]
      }
    }
  },
  required: ["version", "mode", "target_module", "summary", "files"]
});

const CARD_LIBRARY_PLAN_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "integer", enum: [1] }, title: { type: "string" }, summary: { type: "string" },
    subLibraries: {
      type: "array", minItems: 1, maxItems: 8,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          title: { type: "string" }, author: { type: "string" }, era: { type: "string" }, summary: { type: "string" },
          excerpt: { type: "string" }, excerptSource: { type: "string" },
          reviews: {
            type: "array", maxItems: 3,
            items: {
              type: "object", additionalProperties: false,
              properties: { quoter: { type: "string" }, quote: { type: "string" }, source: { type: "string" } },
              required: ["quoter", "quote", "source"]
            }
          },
          cards: {
            type: "array", minItems: 1, maxItems: 8,
            items: {
              type: "object", additionalProperties: false,
              properties: {
                topic: { type: "string" }, prompt: { type: "string" }, answer: { type: "string" }, explanation: { type: "string" },
                quiz: {
                  type: "object", additionalProperties: false,
                  properties: {
                    type: { type: "string", enum: ["single", "multiple", "judge"] }, question: { type: "string" },
                    options: { type: "array", items: { type: "string" } }, correct: { type: "array", items: { type: "integer" } },
                    explanation: { type: "string" }
                  },
                  required: ["type", "question", "options", "correct", "explanation"]
                }
              },
              required: ["topic", "prompt", "answer", "explanation", "quiz"]
            }
          }
        },
        required: ["title", "author", "era", "summary", "excerpt", "excerptSource", "reviews", "cards"]
      }
    }
  },
  required: ["version", "title", "summary", "subLibraries"]
});

function validationError() {
  const error = new Error("AI maintenance-plan contract validation failed");
  error.code = "validation";
  return error;
}

function byteLength(value) {
  return typeof Buffer !== "undefined" ? Buffer.byteLength(value, "utf8") : new TextEncoder().encode(value).length;
}

function text(value, limit, required = false) {
  const result = String(value || "").trim();
  if ((required && !result) || result.length > limit || result.includes("\0")) throw validationError();
  if (/<\/?(?:script|style|iframe|object|embed|img|svg|video|audio|link|meta)\b|javascript\s*:|data\s*:\s*text\/html/i.test(result)) throw validationError();
  return result;
}

function identifier(value, limit = 100) {
  const result = String(value || "").trim();
  return /^[A-Za-z0-9_-]+$/.test(result) ? result.slice(0, limit) : "";
}

function clonePlain(value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw validationError();
    return value;
  }
  if (!value || typeof value !== "object" || seen.has(value)) throw validationError();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) throw validationError();
  seen.add(value);
  const output = Array.isArray(value) ? [] : {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || key === "__proto__" || key === "prototype" || key === "constructor") throw validationError();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set || !("value" in descriptor)) throw validationError();
    output[key] = clonePlain(descriptor.value, seen);
  }
  seen.delete(value);
  return output;
}

function plain(value, maxBytes = 2 * 1024 * 1024) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw validationError();
  const cloned = clonePlain(value);
  if (byteLength(JSON.stringify(cloned)) > maxBytes) throw validationError();
  return cloned;
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
    || /(?:^|[\s"'[(])(?:[\w\- .\u3400-\u9fff]+\/)+[^\s"'\])},]+\.md(?:$|[#|])/i.test(source)
    || /(?:^|[\s"'])\.(?:obsidian|trash)\//i.test(source)
    || /(?:^|[\s"'])(?:Dashboard|MagicOS)\//i.test(source);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sourceTokens(paths) {
  if (!Array.isArray(paths) || !paths.length || paths.length > 30) throw validationError();
  const seen = new Set();
  return Object.freeze(paths.map((path, index) => {
    const normalized = text(path, 1200, true);
    if (seen.has(normalized)) throw validationError();
    seen.add(normalized);
    return Object.freeze({ path: normalized, token: `source-${index + 1}` });
  }));
}

function redactLocalText(value, tokens = [], limit = 4000) {
  let result = text(value, limit);
  [...tokens].sort((a, b) => b.path.length - a.path.length).forEach(({ path, token }) => {
    result = result.replace(new RegExp(escapeRegExp(path), "g"), token);
  });
  result = result.replace(/!?\[\[[^\]]+\]\]/g, "[local reference]");
  result = result.replace(/(?:Dashboard|MagicOS|\.obsidian|\.trash)\/[^\s"'<>[\]{}(),]+/gi, "[local reference]");
  return result;
}

function safeScalar(value, tokens = []) {
  if (["number", "boolean"].includes(typeof value)) return value;
  if (typeof value !== "string") throw validationError();
  if (credentialSignal(value)) throw validationError();
  return localReferenceSignal(value) ? redactLocalText(value, tokens, 1600) : text(value, 1600);
}

function safeFrontmatter(value, tokens) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({});
  const output = {};
  const entries = Object.entries(value);
  if (entries.length > 120) throw validationError();
  entries.forEach(([rawKey, rawValue]) => {
    const key = String(rawKey || "").trim();
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(key) || SECRET_FIELD.test(key)) return;
    if (["string", "number", "boolean"].includes(typeof rawValue)) output[key] = safeScalar(rawValue, tokens);
    else if (Array.isArray(rawValue)) output[key] = Object.freeze(rawValue.slice(0, 30).map((item) => safeScalar(item, tokens)));
  });
  return Object.freeze(output);
}

function normalizeTypes(value) {
  if (!Array.isArray(value) || value.length > 120) throw validationError();
  return Object.freeze([...new Set(value.map((item) => identifier(item, 100)).filter(Boolean))]);
}

function prepareExistingFilePatches(input = {}) {
  const targetModule = String(input.targetModule || "");
  if (!MODULE_IDS.has(targetModule) || !Array.isArray(input.files) || !input.files.length || input.files.length > 30) throw validationError();
  const tokens = sourceTokens(input.files.map((file) => file?.path));
  const allowedTypes = normalizeTypes(input.allowedTypes || []);
  const files = Object.freeze(input.files.map((file, index) => {
    const excerpt = redactLocalText(file?.excerpt, tokens, 1800);
    const title = redactLocalText(file?.title, tokens, 180);
    if (credentialSignal(`${title}\n${excerpt}`)) throw validationError();
    return Object.freeze({
      source_token: tokens[index].token,
      title,
      current_frontmatter: safeFrontmatter(file?.currentFrontmatter, tokens),
      excerpt
    });
  }));
  const prompt = `Create a review-only Magic OS frontmatter patch plan. Never access, create, move, rename, delete, or modify files. Target module: ${targetModule}. Allowed suggested types: ${allowedTypes.join(", ") || "none"}. Use each exact source_token; never emit paths or WikiLinks. Suggest only evidence-grounded frontmatter fields. Operations are add, append, or replace. value_json must be a JSON scalar or scalar array. Never suggest protected identity, privacy, credential, source-control, or system fields.\n\nSanitized reviewed files:\n${JSON.stringify(files)}`;
  if (credentialSignal(prompt) || byteLength(prompt) > MAX_EXISTING_CONTEXT_BYTES) throw validationError();
  return Object.freeze({ targetModule, allowedTypes, tokens, files, prompt });
}

function normalizePatchValue(field, serialized) {
  if (typeof serialized !== "string" || serialized.length > 12000) throw validationError();
  let value;
  try { value = JSON.parse(serialized); } catch { throw validationError(); }
  const values = Array.isArray(value) ? value : [value];
  if (values.length > 60 || values.some((item) => !["string", "number", "boolean"].includes(typeof item) || (typeof item === "number" && !Number.isFinite(item)))) throw validationError();
  if (values.some((item) => typeof item === "string" && (credentialSignal(item) || localReferenceSignal(item) || /^source-\d+$/i.test(item)))) throw validationError();
  if (/(?:^|_)(?:url|urls|link|links)$/i.test(field)) {
    values.filter((item) => typeof item === "string" && /^https?:\/\//i.test(item)).forEach((item) => publicURL(item));
  }
  return Array.isArray(value) ? values : values[0];
}

function normalizeExistingFilePatches(value, prepared) {
  const raw = plain(value);
  if (Number(raw.version) !== 1 || raw.mode !== "existing-files" || raw.target_module !== prepared.targetModule || !Array.isArray(raw.files) || !raw.files.length || raw.files.length > 30) throw validationError();
  const tokenToPath = new Map(prepared.tokens.map((item) => [item.token, item.path]));
  const seen = new Set();
  const files = raw.files.map((file) => {
    const sourceToken = String(file?.source_token || "");
    const path = tokenToPath.get(sourceToken);
    if (!path || seen.has(sourceToken) || !Array.isArray(file.patches) || !file.patches.length || file.patches.length > 40) throw validationError();
    seen.add(sourceToken);
    const suggestedType = identifier(file.suggested_type, 100);
    if (suggestedType && !prepared.allowedTypes.includes(suggestedType)) throw validationError();
    const confidence = Math.max(0, Math.min(1, Number(file.confidence) || 0));
    const patchFields = new Set();
    const patches = file.patches.map((patch) => {
      const field = String(patch?.field || "").trim();
      const operation = String(patch?.operation || "").toLowerCase();
      if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(field) || PROTECTED_FIELDS.has(field) || SECRET_FIELD.test(field) || !OPERATIONS.has(operation) || patchFields.has(field)) throw validationError();
      patchFields.add(field);
      return Object.freeze({
        field, operation, value: normalizePatchValue(field, patch.value_json),
        confidence: Math.max(0, Math.min(1, Number(patch.confidence) || confidence)),
        reason: text(patch.reason, 500), evidence: text(patch.evidence, 500)
      });
    });
    const warnings = Array.isArray(file.warnings) ? file.warnings : [];
    if (warnings.length > 12) throw validationError();
    return Object.freeze({
      path, title: text(file.title, 180), suggested_type: suggestedType, confidence,
      patches: Object.freeze(patches), warnings: Object.freeze(warnings.map((item) => text(item, 500)).filter(Boolean))
    });
  });
  return Object.freeze({ version: 1, mode: "existing-files", target_module: prepared.targetModule, summary: text(raw.summary, 500, true), files: Object.freeze(files) });
}

function safePublicTopic(value, limit) {
  const result = text(value, limit, true);
  if (credentialSignal(result) || localReferenceSignal(result)) throw validationError();
  return result;
}

function prepareCardLibraryPlan(input = {}) {
  const subject = safePublicTopic(input.subject, 120);
  const provided = Array.isArray(input.topics) ? input.topics : [];
  const topics = Object.freeze([...new Set((provided.length ? provided : ["作者与年代", "作品简介", "经典片段", "重要评价"])
    .map((item) => safePublicTopic(item, 60)))].slice(0, 6));
  if (!topics.length) throw validationError();
  const prompt = `Create a review-only two-level Magic OS archive card-library plan for ${subject}. The first level is the fixed subject and the second level contains 1-8 sub-libraries. Use only these exact card topics: ${topics.join(", ")}. Each sub-library has unique title and unique topic cards. Include an excerpt only with a named source. Include reviews only when quoter, quote, and source are all known; omit uncertain quotations instead of inventing them. Every card has one objective quiz. Return structure only. Never access or write files, use tools, emit paths, or create WikiLinks.`;
  if (byteLength(prompt) > MAX_CARD_LIBRARY_CONTEXT_BYTES) throw validationError();
  return Object.freeze({ subject, topics, prompt });
}

function normalizeQuestion(raw) {
  const typeId = QUESTION_TYPES.has(String(raw?.type || "")) ? String(raw.type) : "";
  if (!typeId) throw validationError();
  const options = typeId === "judge" ? ["正确", "错误"] : (Array.isArray(raw.options) ? raw.options.map((item) => text(item, 500)).filter(Boolean) : []);
  if (options.length < 2 || options.length > 6) throw validationError();
  const correct = [...new Set((Array.isArray(raw.correct) ? raw.correct : []).map(Number))];
  if (!correct.length || correct.some((item) => !Number.isInteger(item) || item < 0 || item >= options.length) || (typeId !== "multiple" && correct.length !== 1)) throw validationError();
  return Object.freeze({ type: typeId, question: text(raw.question, 500, true), options: Object.freeze(options), correct: Object.freeze(correct), explanation: text(raw.explanation, 1200) });
}

function normalizeCardLibraryPlan(value, prepared) {
  const raw = plain(value);
  if (Number(raw.version) !== 1 || !Array.isArray(raw.subLibraries) || !raw.subLibraries.length || raw.subLibraries.length > 8) throw validationError();
  const titles = new Set();
  const subLibraries = raw.subLibraries.map((sub) => {
    const titleValue = safePublicTopic(sub?.title, 60);
    const titleKey = titleValue.toLocaleLowerCase("en-US");
    if (titles.has(titleKey) || !Array.isArray(sub.cards) || !sub.cards.length || sub.cards.length > 8) throw validationError();
    titles.add(titleKey);
    const excerptSource = text(sub.excerptSource, 200);
    const excerpt = excerptSource ? text(sub.excerpt, 800) : "";
    const reviews = (Array.isArray(sub.reviews) ? sub.reviews : []).slice(0, 3).map((review) => {
      const quoter = text(review?.quoter, 60);
      const quote = text(review?.quote, 300);
      const source = text(review?.source, 120);
      return quoter && quote && source ? Object.freeze({ quoter, quote, source }) : null;
    }).filter(Boolean);
    const usedTopics = new Set();
    const cards = sub.cards.map((card) => {
      const topic = safePublicTopic(card?.topic, 60);
      if (!prepared.topics.includes(topic) || usedTopics.has(topic)) throw validationError();
      usedTopics.add(topic);
      return Object.freeze({
        topic, prompt: text(card.prompt || topic, 500, true), answer: text(card.answer, 1600, true),
        explanation: text(card.explanation, 800), quiz: normalizeQuestion(card.quiz)
      });
    });
    return Object.freeze({
      title: titleValue, author: text(sub.author, 120), era: text(sub.era, 120), summary: text(sub.summary, 1200),
      excerpt, excerptSource: excerpt ? excerptSource : "", reviews: Object.freeze(reviews), cards: Object.freeze(cards)
    });
  });
  return Object.freeze({ version: 1, title: prepared.subject, summary: text(raw.summary, 600), subLibraries: Object.freeze(subLibraries) });
}

module.exports = {
  CARD_LIBRARY_PLAN_SCHEMA,
  EXISTING_FILE_PATCH_SCHEMA,
  MAX_CARD_LIBRARY_CONTEXT_BYTES,
  MAX_EXISTING_CONTEXT_BYTES,
  normalizeCardLibraryPlan,
  normalizeExistingFilePatches,
  prepareCardLibraryPlan,
  prepareExistingFilePatches,
  validationError
};
