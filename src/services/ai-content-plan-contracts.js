"use strict";

const { publicURL } = require("./ai-planning-contracts");

const MAX_CLASSIFICATION_CONTEXT_BYTES = 1536 * 1024;
const MAX_LEARNING_CONTEXT_BYTES = 1536 * 1024;
const MODULE_IDS = new Set(["command", "assets", "social", "navigation"]);
const BODY_PROFILES = new Set([
  "bili-verbatim-light", "bili-verbatim-deep", "web-article-deep",
  "os-intake-standard", "os-intake-person", "os-intake-organization",
  "os-intake-event", "os-intake-item", "os-intake-asset-source"
]);
const PROTECTED_FIELDS = new Set([
  "type", "module", "entity_id", "entity_kind", "created", "source_type",
  "source_module", "source_port", "source_stickies", "tags"
]);
const QUESTION_TYPES = new Set(["single", "multiple", "judge"]);
const NODE_TYPES = new Set(["group", "concept", "rule", "exception", "comparison", "example", "process"]);

const CLASSIFICATION_PLAN_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "integer", enum: [1] },
    summary: { type: "string" },
    questions: { type: "array", items: { type: "string" } },
    objects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" }, primary: { type: "boolean" }, enabled: { type: "boolean" },
          module: { type: "string" }, type: { type: "string" }, title: { type: "string" },
          reason: { type: "string" }, body_profile: { type: "string" }, body: { type: "string" },
          fields: {
            type: "array",
            items: {
              type: "object", additionalProperties: false,
              properties: { key: { type: "string" }, value_json: { type: "string" } },
              required: ["key", "value_json"]
            }
          },
          tags: { type: "array", items: { type: "string" } },
          links: {
            type: "array",
            items: {
              type: "object", additionalProperties: false,
              properties: { field: { type: "string" }, target_ref: { type: "string" } },
              required: ["field", "target_ref"]
            }
          },
          relations: {
            type: "array",
            items: {
              type: "object", additionalProperties: false,
              properties: { target_ref: { type: "string" }, type: { type: "string" }, note: { type: "string" } },
              required: ["target_ref", "type", "note"]
            }
          }
        },
        required: ["id", "primary", "enabled", "module", "type", "title", "reason", "body_profile", "body", "fields", "tags", "links", "relations"]
      }
    }
  },
  required: ["version", "summary", "questions", "objects"]
});

const LEARNING_CARDS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "integer", enum: [1] },
    summary: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
    cards: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          id: { type: "string" }, coverage_key: { type: "string" }, coverage_heading: { type: "string" },
          title: { type: "string" }, prompt: { type: "string" }, answer: { type: "string" }, explanation: { type: "string" },
          source_refs: { type: "array", items: { type: "string" } },
          questions: {
            type: "array", minItems: 1, maxItems: 1,
            items: {
              type: "object", additionalProperties: false,
              properties: {
                type: { type: "string", enum: ["single", "multiple", "judge"] },
                question: { type: "string" }, options: { type: "array", items: { type: "string" } },
                correct: { type: "array", items: { type: "integer" } }, explanation: { type: "string" }
              },
              required: ["type", "question", "options", "correct", "explanation"]
            }
          }
        },
        required: ["id", "coverage_key", "coverage_heading", "title", "prompt", "answer", "explanation", "source_refs", "questions"]
      }
    }
  },
  required: ["version", "summary", "warnings", "cards"]
});

const LEARNING_MAP_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "integer", enum: [1] }, title: { type: "string" }, summary: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
    nodes: {
      type: "array", maxItems: 240,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          node_id: { type: "string" }, parent_id: { type: "string" }, title: { type: "string" }, summary: { type: "string" },
          node_type: { type: "string", enum: ["group", "concept", "rule", "exception", "comparison", "example", "process"] },
          order: { type: "integer" }, importance: { type: "integer", minimum: 1, maximum: 5 }, exam_focus: { type: "string" },
          coverage_keys: { type: "array", maxItems: 16, items: { type: "string" } },
          prerequisite_ids: { type: "array", maxItems: 12, items: { type: "string" } },
          contrast_ids: { type: "array", maxItems: 12, items: { type: "string" } }
        },
        required: ["node_id", "parent_id", "title", "summary", "node_type", "order", "importance", "exam_focus", "coverage_keys", "prerequisite_ids", "contrast_ids"]
      }
    }
  },
  required: ["version", "title", "summary", "warnings", "nodes"]
});

function validationError() {
  const error = new Error("AI content-plan contract validation failed");
  error.code = "validation";
  return error;
}

function byteLength(value) {
  return typeof Buffer !== "undefined" ? Buffer.byteLength(value, "utf8") : new TextEncoder().encode(value).length;
}

function text(value, limit, required = false) {
  const result = String(value || "").trim();
  if ((required && !result) || result.length > limit || result.includes("\0")) throw validationError();
  return result;
}

function identifier(value, limit = 90) {
  const result = String(value || "").trim();
  return /^[A-Za-z0-9_-]+$/.test(result) ? result.slice(0, limit) : "";
}

function plain(value, maxBytes = 512 * 1024) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw validationError();
  let serialized;
  try { serialized = JSON.stringify(value); } catch { throw validationError(); }
  if (byteLength(serialized) > maxBytes) throw validationError();
  return JSON.parse(serialized);
}

function credentialSignal(value) {
  const source = String(value || "");
  const compact = source.replace(/\s+/g, " ").trim();
  return /(?:密码|口令|登录码|验证码|password|passwd|pwd)\s*[:：=为\-]?\s*[^\s，。；;]{4,}/i.test(compact)
    || /(?:api[\s_-]?key|access[\s_-]?token|refresh[\s_-]?token|secret|token|密钥)\s*[:：=]\s*[A-Za-z0-9_./+=\-]{8,}/i.test(compact)
    || /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(compact)
    || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sourceTokens(paths) {
  if (!Array.isArray(paths) || paths.length > 64) throw validationError();
  const unique = [...new Set(paths.map((item) => text(item, 1200)).filter(Boolean))];
  return Object.freeze(unique.map((path, index) => Object.freeze({ path, token: `source-${index + 1}` })));
}

function redactLocalContext(value, tokens = []) {
  let result = String(value || "");
  [...tokens].sort((a, b) => b.path.length - a.path.length).forEach(({ path, token }) => {
    result = result.replace(new RegExp(escapeRegExp(path), "g"), token);
  });
  result = result.replace(/!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_match, _target, label) => (
    label ? `[local reference: ${String(label).slice(0, 120)}]` : "[local reference]"
  ));
  return result;
}

function safeMarkdown(value, limit) {
  const result = text(value, limit, true);
  if (/<\/?(?:script|style|iframe|object|embed|img|svg|video|audio|link|meta)\b|javascript\s*:|data\s*:\s*text\/html/i.test(result)) {
    throw validationError();
  }
  return result;
}

function normalizeRoutes(value) {
  if (!Array.isArray(value) || !value.length || value.length > 240) throw validationError();
  const seen = new Set();
  return Object.freeze(value.map((entry) => {
    const moduleId = String(entry?.moduleId || "");
    const typeId = identifier(entry?.typeId, 100);
    const key = `${moduleId}:${typeId}`;
    if (!MODULE_IDS.has(moduleId) || !typeId || seen.has(key)) throw validationError();
    seen.add(key);
    return Object.freeze({ moduleId, typeId, label: text(entry?.label || typeId, 160, true) });
  }));
}

function expectedProfile(route, requested) {
  const requestedProfile = BODY_PROFILES.has(requested) ? requested : "os-intake-standard";
  if (route.moduleId === "social") {
    if (route.typeId === "person") return "os-intake-person";
    if (route.typeId === "organization") return "os-intake-organization";
    if (route.typeId === "social-event") return "os-intake-event";
    if (route.typeId === "item") return "os-intake-item";
  }
  if (route.moduleId === "assets" && ["asset-link", "asset-video"].includes(route.typeId)) return "os-intake-asset-source";
  return requestedProfile;
}

function prepareClassificationPlan(input = {}) {
  const content = String(input.content || "");
  if (!content || byteLength(content) > MAX_CLASSIFICATION_CONTEXT_BYTES || credentialSignal(content)) throw validationError();
  const tokens = sourceTokens(input.localPaths || []);
  const safeContent = redactLocalContext(content, tokens);
  const routes = normalizeRoutes(input.routes);
  const targetModule = String(input.targetModule || "");
  const targetType = identifier(input.targetType, 100);
  if (!routes.some((route) => route.moduleId === targetModule && route.typeId === targetType)) throw validationError();
  const requestedProfile = BODY_PROFILES.has(String(input.bodyProfile || "")) ? String(input.bodyProfile) : "os-intake-standard";
  const webArchive = input.webArchive === true;
  const prompt = `Create a review-only Magic OS classification plan. Never perform file operations.\n\nPrimary route: ${targetModule}/${targetType}\nPrimary body profile: ${requestedProfile}\nAllowed routes:\n${JSON.stringify(routes)}\n\nRules: return 1-20 objects; the first primary object must use the primary route. Use only allowed routes. fields must be key/value_json pairs with scalar or scalar-array JSON values. Do not emit Vault paths or WikiLinks. links and relations may reference only ids of objects in this response. Body must be Markdown beginning with one H1 and contain no raw HTML or active media. ${webArchive ? "Use web search only for public facts and keep source URLs public HTTP(S)." : "Use only the supplied context; do not claim web research."}\n\nSanitized task context:\n${safeContent}`;
  return Object.freeze({ content: safeContent, routes, targetModule, targetType, requestedProfile, webArchive, prompt });
}

function normalizeFieldValue(key, raw) {
  let value;
  try { value = JSON.parse(String(raw)); } catch { throw validationError(); }
  const values = Array.isArray(value) ? value : [value];
  if (values.length > 40 || values.some((item) => !["string", "number", "boolean"].includes(typeof item) || (typeof item === "number" && !Number.isFinite(item)))) {
    throw validationError();
  }
  if (/(?:^|_)urls?$/i.test(key) || key === "related_links") {
    const urls = values.map((item) => publicURL(item));
    return JSON.stringify(Array.isArray(value) ? urls.slice(0, 24) : urls[0]);
  }
  if (values.some((item) => typeof item === "string" && (/!?\[\[[^\]]+\]\]/.test(item) || /(?:^|\/)Dashboard\//i.test(item) || /\.md(?:$|[#|])/i.test(item)))) {
    throw validationError();
  }
  return JSON.stringify(Array.isArray(value) ? values : values[0]);
}

function normalizeClassificationPlan(value, prepared) {
  const raw = plain(value, 2 * 1024 * 1024);
  if (Number(raw.version) !== 1 || !Array.isArray(raw.objects) || !raw.objects.length || raw.objects.length > 20) throw validationError();
  const routeByKey = new Map(prepared.routes.map((route) => [`${route.moduleId}:${route.typeId}`, route]));
  const ids = new Set();
  const objects = raw.objects.map((object, index) => {
    if (!object || typeof object !== "object" || Array.isArray(object)) throw validationError();
    const route = routeByKey.get(`${object.module}:${object.type}`);
    if (!route) throw validationError();
    if (index === 0 && (route.moduleId !== prepared.targetModule || route.typeId !== prepared.targetType || object.primary !== true)) throw validationError();
    const id = identifier(object.id) || `object-${index + 1}`;
    if (ids.has(id)) throw validationError();
    ids.add(id);
    if (!Array.isArray(object.fields) || object.fields.length > 80) throw validationError();
    const fields = Object.freeze(object.fields.map((entry) => {
      const key = String(entry?.key || "").trim();
      if (!/^[a-z][a-z0-9_]{0,79}$/i.test(key) || PROTECTED_FIELDS.has(key)) throw validationError();
      return Object.freeze({ key, value_json: normalizeFieldValue(key, entry.value_json) });
    }));
    const tags = Object.freeze((Array.isArray(object.tags) ? object.tags : []).map((tag) => text(tag, 100)).filter(Boolean).slice(0, 24));
    const body = safeMarkdown(object.body, 200000);
    if (!/^#\s+\S/m.test(body)) throw validationError();
    return {
      id, primary: index === 0, enabled: object.enabled !== false, module: route.moduleId, type: route.typeId,
      title: text(object.title, 180, true), reason: text(object.reason, 600),
      body_profile: expectedProfile(route, index === 0 ? prepared.requestedProfile : "os-intake-standard"),
      body, fields, tags,
      rawLinks: Array.isArray(object.links) ? object.links.slice(0, 30) : [],
      rawRelations: Array.isArray(object.relations) ? object.relations.slice(0, 30) : []
    };
  });
  const finalized = objects.map((object) => Object.freeze({
    id: object.id, primary: object.primary, enabled: object.enabled, module: object.module, type: object.type,
    title: object.title, reason: object.reason, body_profile: object.body_profile, body: object.body,
    fields: object.fields, tags: object.tags,
    links: Object.freeze(object.rawLinks.map((link) => ({
      field: identifier(link?.field, 80), target_ref: identifier(link?.target_ref)
    })).filter((link) => link.target_ref && ids.has(link.target_ref) && link.target_ref !== object.id).map(Object.freeze)),
    relations: Object.freeze(object.rawRelations.map((relation) => ({
      target_ref: identifier(relation?.target_ref), type: identifier(relation?.type, 80) || "related", note: text(relation?.note, 300)
    })).filter((relation) => relation.target_ref && ids.has(relation.target_ref) && relation.target_ref !== object.id).map(Object.freeze))
  }));
  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  if (questions.length > 12) throw validationError();
  return Object.freeze({
    version: 1, summary: text(raw.summary, 500, true),
    questions: Object.freeze(questions.map((item) => text(item, 1200)).filter(Boolean)),
    objects: Object.freeze(finalized)
  });
}

function prepareLearningCards(input = {}) {
  const content = String(input.content || "");
  if (!content || byteLength(content) > MAX_LEARNING_CONTEXT_BYTES || credentialSignal(content)) throw validationError();
  const tokens = sourceTokens(input.sourcePaths || []);
  if (!tokens.length) throw validationError();
  const coverageKeys = Object.freeze([...new Set((Array.isArray(input.coverageKeys) ? input.coverageKeys : []).map((item) => identifier(item, 160)).filter(Boolean))].slice(0, 24));
  const maxCards = Math.max(1, Math.min(24, Math.floor(Number(input.maxCards) || 8)));
  const safeContent = redactLocalContext(content, tokens);
  const prompt = `Create review-only Magic OS learning cards from the sanitized local evidence. Never perform file operations. Generate at most ${maxCards} cards. Each card must cite at least one exact source token from: ${tokens.map((item) => item.token).join(", ")}. ${coverageKeys.length ? `Use only these coverage keys, at most once each: ${coverageKeys.join(", ")}.` : "Use stable short coverage keys."} Each card contains one atomic learning prompt and exactly one objective single, multiple, or judge question. Do not emit Vault paths or WikiLinks.\n\nSanitized learning task:\n${safeContent}`;
  return Object.freeze({ content: safeContent, tokens, coverageKeys, maxCards, prompt });
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

function normalizeLearningCards(value, prepared) {
  const raw = plain(value, 1024 * 1024);
  if (Number(raw.version) !== 1 || !Array.isArray(raw.cards) || !raw.cards.length || raw.cards.length > prepared.maxCards) throw validationError();
  const tokenToPath = new Map(prepared.tokens.map((item) => [item.token, item.path]));
  const ids = new Set();
  const usedCoverage = new Set();
  const cards = raw.cards.map((card, index) => {
    const id = identifier(card?.id) || `card-${index + 1}`;
    if (ids.has(id)) throw validationError();
    ids.add(id);
    const refs = [...new Set((Array.isArray(card.source_refs) ? card.source_refs : []).map((item) => tokenToPath.get(String(item)) || "").filter(Boolean))];
    if (!refs.length) throw validationError();
    const coverageKey = identifier(card.coverage_key, 160);
    if (!coverageKey || usedCoverage.has(coverageKey) || (prepared.coverageKeys.length && !prepared.coverageKeys.includes(coverageKey))) throw validationError();
    usedCoverage.add(coverageKey);
    if (!Array.isArray(card.questions) || card.questions.length !== 1) throw validationError();
    return Object.freeze({
      id, coverage_key: coverageKey, coverage_heading: text(card.coverage_heading || card.title, 180, true),
      title: text(card.title, 100, true), topic: "未分主题", prompt: text(card.prompt || card.title, 800, true),
      answer: text(card.answer, 2400, true), explanation: text(card.explanation, 4000), example: "", cognitive_level: "理解",
      source_refs: Object.freeze(refs), source_evidence: Object.freeze([]), tags: Object.freeze([]), relations: Object.freeze([]),
      questions: Object.freeze([normalizeQuestion(card.questions[0])])
    });
  });
  const warnings = Array.isArray(raw.warnings) ? raw.warnings : [];
  if (warnings.length > 20) throw validationError();
  return Object.freeze({ version: 1, summary: text(raw.summary, 500, true), warnings: Object.freeze(warnings.map((item) => text(item, 1000)).filter(Boolean)), cards: Object.freeze(cards) });
}

function prepareLearningMap(input = {}) {
  const theme = text(input.theme, 200, true);
  const goal = text(input.goal || "Build a complete learning structure.", 1200, true);
  if (credentialSignal(`${theme}\n${goal}`) || !Array.isArray(input.points) || !input.points.length || input.points.length > 240) throw validationError();
  const tokens = sourceTokens(input.sourcePaths || []);
  const pathToToken = new Map(tokens.map((item) => [item.path, item.token]));
  const seen = new Set();
  const points = Object.freeze(input.points.map((point) => {
    const key = identifier(point?.coverageKey, 160);
    const sourceToken = pathToToken.get(String(point?.sourcePath || ""));
    if (!key || seen.has(key) || !sourceToken) throw validationError();
    seen.add(key);
    const evidence = text(point?.evidencePreview, 1200);
    if (credentialSignal(evidence)) throw validationError();
    return Object.freeze({ coverage_key: key, title: text(point?.title, 200, true), source_token: sourceToken, evidence_preview: redactLocalContext(evidence, tokens) });
  }));
  const prompt = `Build one review-only Magic OS learning map for ${theme}. Goal: ${goal}. Every coverage_key below must appear at least once. Group nodes may omit coverage keys; every leaf must use only listed keys. Keep prerequisite and contrast references inside this response. Do not generate cards, use tools, emit Vault paths, or perform file operations. Maximum 240 nodes.\n\nSanitized source nodes:\n${JSON.stringify(points)}`;
  if (byteLength(prompt) > MAX_LEARNING_CONTEXT_BYTES) throw validationError();
  return Object.freeze({ theme, goal, points, coverageKeys: Object.freeze([...seen]), prompt });
}

function normalizeLearningMap(value, prepared) {
  const raw = plain(value, 2 * 1024 * 1024);
  if (Number(raw.version) !== 1 || !Array.isArray(raw.nodes) || !raw.nodes.length || raw.nodes.length > 240) throw validationError();
  const allowedKeys = new Set(prepared.coverageKeys);
  const usedKeys = new Set();
  const ids = new Set();
  const staged = raw.nodes.map((node, index) => {
    const id = identifier(node?.node_id) || `node-${index + 1}`;
    if (ids.has(id)) throw validationError();
    ids.add(id);
    const keys = [...new Set((Array.isArray(node.coverage_keys) ? node.coverage_keys : []).map(String))];
    if (keys.length > 16 || keys.some((key) => !allowedKeys.has(key))) throw validationError();
    keys.forEach((key) => usedKeys.add(key));
    return { id, node, keys };
  });
  const missingKeys = prepared.coverageKeys.filter((key) => !usedKeys.has(key));
  if (staged.length + missingKeys.length > 240) throw validationError();
  const pointsByKey = new Map(prepared.points.map((point) => [point.coverage_key, point]));
  missingKeys.forEach((key, index) => {
    let id = `fallback-${index + 1}`;
    while (ids.has(id)) id = `fallback-${index + 1}-${ids.size + 1}`;
    ids.add(id);
    usedKeys.add(key);
    const point = pointsByKey.get(key);
    staged.push({
      id,
      keys: [key],
      node: {
        parent_id: "",
        title: point?.title || key,
        summary: "Local fallback node added because the model omitted reviewed coverage.",
        node_type: "concept",
        order: raw.nodes.length + index + 1,
        importance: 3,
        exam_focus: "",
        prerequisite_ids: [],
        contrast_ids: [],
        fallback: true
      }
    });
  });
  const nodes = staged.map(({ id, node, keys }) => {
    const parentId = identifier(node.parent_id);
    const prerequisiteIds = [...new Set((Array.isArray(node.prerequisite_ids) ? node.prerequisite_ids : []).map((item) => identifier(item)).filter((item) => ids.has(item) && item !== id))].slice(0, 12);
    const contrastIds = [...new Set((Array.isArray(node.contrast_ids) ? node.contrast_ids : []).map((item) => identifier(item)).filter((item) => ids.has(item) && item !== id))].slice(0, 12);
    const nodeType = NODE_TYPES.has(String(node.node_type || "")) ? String(node.node_type) : "concept";
    if (nodeType !== "group" && !keys.length) throw validationError();
    return Object.freeze({
      node_id: id, parent_id: parentId && ids.has(parentId) && parentId !== id ? parentId : "",
      title: text(node.title, 160, true), summary: text(node.summary, 900), node_type: nodeType,
      order: Math.max(0, Math.min(9999, Math.floor(Number(node.order) || 0))),
      importance: Math.max(1, Math.min(5, Math.floor(Number(node.importance) || 3))),
      exam_focus: text(node.exam_focus, 600), coverage_keys: Object.freeze(keys),
      prerequisite_ids: Object.freeze(prerequisiteIds), contrast_ids: Object.freeze(contrastIds), fallback: node.fallback === true
    });
  });
  const warnings = Array.isArray(raw.warnings) ? raw.warnings : [];
  if (warnings.length > 30) throw validationError();
  const normalizedWarnings = warnings.map((item) => text(item, 1000)).filter(Boolean);
  if (missingKeys.length) normalizedWarnings.push(`Local validation restored ${missingKeys.length} omitted coverage node(s).`);
  return Object.freeze({ version: 1, title: text(raw.title || prepared.theme, 160, true), summary: text(raw.summary, 1200, true), warnings: Object.freeze(normalizedWarnings), nodes: Object.freeze(nodes) });
}

module.exports = {
  BODY_PROFILES,
  CLASSIFICATION_PLAN_SCHEMA,
  LEARNING_CARDS_SCHEMA,
  LEARNING_MAP_SCHEMA,
  MAX_CLASSIFICATION_CONTEXT_BYTES,
  MAX_LEARNING_CONTEXT_BYTES,
  normalizeClassificationPlan,
  normalizeLearningCards,
  normalizeLearningMap,
  prepareClassificationPlan,
  prepareLearningCards,
  prepareLearningMap,
  redactLocalContext,
  validationError
};
