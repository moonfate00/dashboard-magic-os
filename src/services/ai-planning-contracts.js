"use strict";

const MAX_AGENT_GOAL_LENGTH = 800;
const MAX_LINK_CATALOG_BYTES = 512 * 1024;
const MODULE_IDS = new Set(["command", "assets", "social", "navigation", "memory"]);
const PROFILE_IDS = new Set(["bili-verbatim-light", "bili-verbatim-deep", "web-article-deep"]);
const AGENT_PIPELINES = Object.freeze([
  Object.freeze({ kind: "search", permission: "P1", params: Object.freeze(["query", "scope", "limit"]), description: "Search existing Magic OS records without modifying them." }),
  Object.freeze({ kind: "classify", permission: "P2", params: Object.freeze(["moduleId", "typeId", "body", "bodyProfile", "presets", "customTags"]), description: "Create a review-only classification plan from the stated goal." }),
  Object.freeze({ kind: "link-intake", permission: "P2", params: Object.freeze(["sourceUrl", "sourceKind", "bodyProfile", "typeId"]), description: "Prepare one review-only intake plan for an explicit public URL." }),
  Object.freeze({ kind: "native", permission: "P2", params: Object.freeze(["sourceUrl", "sourceKind", "bodyProfile", "typeId"]), description: "Prepare one local evidence-processing plan for an explicit public URL." }),
  Object.freeze({ kind: "learning", permission: "P2", params: Object.freeze(["targetThread", "sourceFiles", "maxCards", "coveragePoints"]), description: "Prepare review-only learning cards for a locally resolved thread." }),
  Object.freeze({ kind: "existing", permission: "P2", params: Object.freeze(["sourceFiles", "targetModule"]), description: "Prepare review-only patches for locally resolved existing files." })
]);
const PIPELINE_BY_KIND = new Map(AGENT_PIPELINES.map((item) => [item.kind, item]));

const AGENT_PLAN_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: Object.freeze({
    summary: Object.freeze({ type: "string" }),
    steps: Object.freeze({
      type: "array",
      items: Object.freeze({
        type: "object",
        additionalProperties: false,
        properties: Object.freeze({
          step_id: Object.freeze({ type: "string" }),
          kind: Object.freeze({ type: "string", enum: Object.freeze(AGENT_PIPELINES.map((item) => item.kind)) }),
          label: Object.freeze({ type: "string" }),
          permission: Object.freeze({ type: "string" }),
          params: Object.freeze({ type: "object" }),
          uses: Object.freeze({ type: "string" })
        }),
        required: Object.freeze(["step_id", "kind", "label", "permission", "params", "uses"])
      })
    })
  }),
  required: Object.freeze(["summary", "steps"])
});

const LINK_ROUTE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: Object.freeze({
    moduleId: Object.freeze({ type: "string" }),
    typeId: Object.freeze({ type: "string" }),
    presetKeys: Object.freeze({ type: "array", items: Object.freeze({ type: "string" }) }),
    customTags: Object.freeze({ type: "array", items: Object.freeze({ type: "string" }) }),
    profileId: Object.freeze({ type: "string" }),
    reason: Object.freeze({ type: "string" })
  }),
  required: Object.freeze(["moduleId", "typeId", "presetKeys", "customTags", "profileId", "reason"])
});

function validationError() {
  const error = new Error("AI planning contract validation failed");
  error.code = "validation";
  return error;
}

function byteLength(value) {
  return typeof Buffer !== "undefined" ? Buffer.byteLength(value, "utf8") : new TextEncoder().encode(value).length;
}

function safeText(value, maxLength, required = false) {
  const text = String(value || "").trim();
  if ((required && !text) || text.length > maxLength || text.includes("\0") || /<\/?(?:script|style|iframe|object|embed|img|svg|link|meta)\b/i.test(text)) {
    throw validationError();
  }
  return text;
}

function containsCredentialSignal(value) {
  const text = String(value || "");
  const compact = text.replace(/\s+/g, " ").trim();
  return /(?:密码|口令|登录码|验证码|password|passwd|pwd)\s*[:：=为\-]?\s*[^\s，。；;]{4,}/i.test(compact)
    || /(?:api[\s_-]?key|access[\s_-]?token|refresh[\s_-]?token|secret|token|密钥)\s*[:：=]\s*[A-Za-z0-9_./+=\-]{8,}/i.test(compact)
    || /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(compact)
    || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text);
}

function redactLocalReferences(value) {
  return String(value || "")
    .replace(/\[\[[^\]]+\]\]/g, "[attached local file]")
    .replace(/(^|\s)@[^\s，。；;,!?！？]+/g, "$1[attached local file]");
}

function plainJSON(value, maxBytes) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw validationError();
  let serialized;
  try { serialized = JSON.stringify(value); } catch { throw validationError(); }
  if (byteLength(serialized) > maxBytes) throw validationError();
  const parsed = JSON.parse(serialized);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw validationError();
  return parsed;
}

function safeIdentifier(value, maxLength = 80) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9_-]+$/.test(id) ? id.slice(0, maxLength) : "";
}

function safeTags(value, limit = 3) {
  if (!Array.isArray(value) || value.length > 20) throw validationError();
  return Object.freeze([...new Set(value.map((item) => safeText(item, 64)).filter((tag) => /^#[^\s#[\]{}<>]{1,60}$/u.test(tag)))].slice(0, limit));
}

function publicURL(value, sourceKind = "") {
  let parsed;
  try { parsed = new URL(String(value || "").trim()); } catch { throw validationError(); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw validationError();
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!host || !host.includes(".") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
    || host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home")
    || /^(?:0|10|127|169\.254|192\.168)\./.test(host)
    || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
    || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) {
    throw validationError();
  }
  if (sourceKind === "bilibili" && !(host === "b23.tv" || host === "bilibili.com" || host.endsWith(".bilibili.com"))) {
    throw validationError();
  }
  return parsed.href.slice(0, 2048);
}

function goalURLs(goal) {
  const urls = String(goal || "").match(/https?:\/\/[^\s<>{}\[\]"']+/gi) || [];
  const safe = [];
  for (const value of urls.slice(0, 4)) {
    try { safe.push(publicURL(value)); } catch {}
  }
  return Object.freeze([...new Set(safe)]);
}

function resultReferences(value) {
  const list = Array.isArray(value) ? value : value === "{result}" ? [value] : [];
  return Object.freeze(list.map(String).filter((item) => item === "{result}").slice(0, 1));
}

function agentParams(kind, raw, goal, urls) {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const moduleId = MODULE_IDS.has(String(input.moduleId || "")) ? String(input.moduleId) : "navigation";
  const typeId = safeIdentifier(input.typeId) || "study-note";
  if (kind === "search") {
    const scope = String(input.scope || "all");
    return Object.freeze({
      query: safeText(input.query || goal, 240, true),
      scope: scope === "all" || MODULE_IDS.has(scope) ? scope : "all",
      limit: Math.max(1, Math.min(60, Math.floor(Number(input.limit) || 20)))
    });
  }
  if (kind === "classify") {
    return Object.freeze({ moduleId, typeId, body: goal, bodyProfile: "", presets: Object.freeze([]), customTags: safeTags(Array.isArray(input.customTags) ? input.customTags : []) });
  }
  if (kind === "link-intake" || kind === "native") {
    const requested = publicURL(input.sourceUrl || urls[0] || "");
    if (!urls.includes(requested)) throw validationError();
    const sourceKind = /(?:bilibili\.com|b23\.tv)/i.test(requested) ? "bilibili" : "web-article";
    const fallbackProfile = sourceKind === "bilibili" ? "bili-verbatim-light" : "web-article-deep";
    const bodyProfile = PROFILE_IDS.has(String(input.bodyProfile || "")) ? String(input.bodyProfile) : fallbackProfile;
    if (sourceKind !== "bilibili" && bodyProfile !== "web-article-deep") throw validationError();
    return Object.freeze({ sourceUrl: requested, sourceKind, bodyProfile, typeId });
  }
  if (kind === "learning") {
    const sourceFiles = resultReferences(input.sourceFiles);
    return Object.freeze({
      targetThread: "",
      ...(sourceFiles.length ? { sourceFiles } : {}),
      maxCards: Math.max(3, Math.min(24, Math.floor(Number(input.maxCards) || 8))),
      coveragePoints: Object.freeze((Array.isArray(input.coveragePoints) ? input.coveragePoints : []).map((item) => safeText(item, 160)).filter(Boolean).slice(0, 24))
    });
  }
  if (kind === "existing") {
    const targetModule = MODULE_IDS.has(String(input.targetModule || "")) ? String(input.targetModule) : "navigation";
    return Object.freeze({ sourceFiles: resultReferences(input.sourceFiles), targetModule });
  }
  throw validationError();
}

function prepareAgentPlanning(goal) {
  if (containsCredentialSignal(goal)) throw validationError();
  const normalizedGoal = safeText(redactLocalReferences(goal), MAX_AGENT_GOAL_LENGTH, true);
  const urls = goalURLs(normalizedGoal);
  const catalog = AGENT_PIPELINES.map((item) => ({ kind: item.kind, permission: item.permission, params: item.params, description: item.description }));
  const prompt = `Plan a Magic OS task from this user goal:\n\n${normalizedGoal}\n\nAllowed pipelines:\n${JSON.stringify(catalog)}\n\nReturn 1-5 ordered steps. Use only listed kinds and parameter names. Search is read-only P1. Every other step is review-only P2 and must not execute. A link goal normally uses one link-intake step. Existing local attachments are injected later by the private runtime and must never be guessed. sourceFiles may only be the exact placeholder {result} when it depends on a prior search. uses may reference only an earlier step. Return only the requested JSON structure.`;
  return Object.freeze({ goal: normalizedGoal, urls, prompt });
}

function normalizeAgentPlan(value, prepared) {
  const raw = plainJSON(value, 128 * 1024);
  if (!Array.isArray(raw.steps) || raw.steps.length < 1 || raw.steps.length > 5) throw validationError();
  const seen = new Set();
  const steps = raw.steps.map((step, index) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) throw validationError();
    const kind = String(step.kind || "");
    const descriptor = PIPELINE_BY_KIND.get(kind);
    if (!descriptor) throw validationError();
    let id = safeIdentifier(step.step_id) || `s${index + 1}`;
    if (seen.has(id)) throw validationError();
    const uses = safeIdentifier(step.uses);
    if (uses && !seen.has(uses)) throw validationError();
    seen.add(id);
    return Object.freeze({
      step_id: id,
      kind,
      label: safeText(step.label || kind, 120, true),
      permission: descriptor.permission,
      params: agentParams(kind, step.params, prepared.goal, prepared.urls),
      uses
    });
  });
  return Object.freeze({ summary: safeText(raw.summary, 500, true), steps: Object.freeze(steps) });
}

function normalizeLinkCatalog(value) {
  const raw = plainJSON({ catalog: value }, MAX_LINK_CATALOG_BYTES).catalog;
  if (!Array.isArray(raw) || !raw.length || raw.length > 160) throw validationError();
  const seen = new Set();
  return Object.freeze(raw.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw validationError();
    const moduleId = String(entry.moduleId || "");
    const typeId = safeIdentifier(entry.typeId);
    const key = `${moduleId}:${typeId}`;
    if (!MODULE_IDS.has(moduleId) || !typeId || seen.has(key)) throw validationError();
    seen.add(key);
    const presets = Array.isArray(entry.presets) ? entry.presets : [];
    if (presets.length > 24) throw validationError();
    return Object.freeze({
      moduleId,
      moduleName: safeText(entry.moduleName || moduleId, 80, true),
      typeId,
      typeLabel: safeText(entry.typeLabel || typeId, 100, true),
      typeDesc: safeText(entry.typeDesc || "", 240),
      presets: Object.freeze(presets.map((preset) => Object.freeze({
        key: safeIdentifier(preset?.key),
        label: safeText(preset?.label || preset?.key, 100, true),
        tag: safeText(preset?.tag || "", 100)
      })).filter((preset) => preset.key))
    });
  }));
}

function prepareLinkRouting(input = {}) {
  const sourceKind = String(input.sourceKind || "") === "bilibili" ? "bilibili" : "web-article";
  const url = publicURL(input.url, sourceKind);
  if (containsCredentialSignal(input.query)) throw validationError();
  const query = safeText(input.query || "", 400);
  const catalog = normalizeLinkCatalog(input.catalog);
  const deep = /详细梳理|深度|精读|逐句|深入/.test(query);
  const profiles = sourceKind === "bilibili" ? ["bili-verbatim-light", "bili-verbatim-deep"] : ["web-article-deep"];
  const prompt = `Choose one reviewed Magic OS route for this public source.\nURL: ${url}\nSource kind: ${sourceKind}\nUser intent: ${query || "automatic routing"}\nAllowed profiles: ${profiles.join(", ")}\nPreferred depth: ${deep ? "deep" : "light or automatic"}\nReviewed catalog:\n${JSON.stringify(catalog)}\n\nChoose exactly one catalog moduleId/typeId pair, 0-5 preset keys belonging to that pair, 0-3 concise custom tags beginning with #, one allowed profile, and a short reason. Do not fetch the URL and do not perform any file action. Return only the requested JSON structure.`;
  return Object.freeze({ url, sourceKind, query, catalog, profiles: Object.freeze(profiles), prompt });
}

function normalizeLinkRoute(value, prepared) {
  const raw = plainJSON(value, 64 * 1024);
  const entry = prepared.catalog.find((item) => item.moduleId === String(raw.moduleId || "") && item.typeId === String(raw.typeId || ""));
  if (!entry) throw validationError();
  if (!Array.isArray(raw.presetKeys) || raw.presetKeys.length > 20) throw validationError();
  const presetKeys = [...new Set(raw.presetKeys.map(String).filter((key) => entry.presets.some((preset) => preset.key === key)))].slice(0, 5);
  const profileId = String(raw.profileId || "");
  if (!prepared.profiles.includes(profileId)) throw validationError();
  return Object.freeze({
    moduleId: entry.moduleId,
    typeId: entry.typeId,
    presetKeys: Object.freeze(presetKeys),
    customTags: safeTags(Array.isArray(raw.customTags) ? raw.customTags : []),
    profileId,
    reason: safeText(raw.reason, 500, true)
  });
}

module.exports = {
  AGENT_PIPELINES,
  AGENT_PLAN_SCHEMA,
  LINK_ROUTE_SCHEMA,
  MAX_AGENT_GOAL_LENGTH,
  MAX_LINK_CATALOG_BYTES,
  normalizeAgentPlan,
  normalizeLinkRoute,
  prepareAgentPlanning,
  prepareLinkRouting,
  publicURL,
  validationError
};
