"use strict";

class AIProviderProtocolError extends Error {
  constructor(code, options = {}) {
    super(String(options.detail || code || "ai-provider-error"));
    this.name = "AIProviderProtocolError";
    this.code = String(code || "request");
    this.status = Number(options.status || 0);
    this.detail = String(options.detail || "");
  }
}

function redactAISecrets(value, secrets = []) {
  let safe = String(value || "Unknown error").replace(/sk-[A-Za-z0-9_-]+/g, "[secret-redacted]");
  (Array.isArray(secrets) ? secrets : [secrets]).map(String).filter(Boolean).forEach((secret) => {
    safe = safe.split(secret).join("[secret-redacted]");
  });
  return safe;
}

function aiHTTPResponseData(response) {
  const status = Number(response?.status || 0);
  if (status < 200 || status >= 300) {
    const detail = response?.json?.error?.message || response?.text || `HTTP ${status || "unknown"}`;
    throw new AIProviderProtocolError("http", { status, detail: redactAISecrets(detail) });
  }
  try {
    return response?.json || JSON.parse(response?.text || "{}");
  } catch (error) {
    throw new AIProviderProtocolError("invalid-json", { status, detail: error?.message });
  }
}

function buildOpenAIRequest(options = {}) {
  const payload = {
    model: String(options.model || ""),
    store: false,
    input: [
      { role: "system", content: String(options.system || "") },
      { role: "user", content: String(options.user || "") }
    ],
    reasoning: { effort: String(options.reasoning || "medium") }
  };
  if (Array.isArray(options.tools) && options.tools.length) {
    payload.tools = options.tools;
    payload.tool_choice = "auto";
  }
  if (options.schema && typeof options.schema === "object") {
    payload.text = {
      format: {
        type: "json_schema",
        name: String(options.schemaName || "magic_os_result").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64),
        schema: options.schema,
        strict: true
      }
    };
  }
  return payload;
}

function parseStructuredText(text, options = {}) {
  if (!options.schema) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new AIProviderProtocolError("invalid-json", { detail: error?.message });
  }
}

function parseOpenAIResponse(response, options = {}) {
  const data = aiHTTPResponseData(response);
  if (data.status === "incomplete") {
    throw new AIProviderProtocolError("incomplete", { detail: data.incomplete_details?.reason || "unknown" });
  }
  const message = (data.output || []).find((item) => item?.type === "message");
  const refusal = message?.content?.find((item) => item?.type === "refusal");
  if (refusal) throw new AIProviderProtocolError("refusal", { detail: refusal.refusal });
  const outputText = message?.content?.find((item) => item?.type === "output_text")?.text;
  if (!outputText) throw new AIProviderProtocolError("missing-output");
  return {
    requestId: String(data.id || response?.headers?.["x-request-id"] || response?.headers?.["X-Request-Id"] || ""),
    text: outputText,
    data: parseStructuredText(outputText, options),
    usage: {
      input: Number(data.usage?.input_tokens || 0),
      output: Number(data.usage?.output_tokens || 0),
      total: Number(data.usage?.total_tokens || 0),
      cached: Number(data.usage?.input_tokens_details?.cached_tokens || 0)
    }
  };
}

function buildDeepSeekRequest(options = {}) {
  const schema = options.schema && typeof options.schema === "object" ? options.schema : null;
  const jsonInstruction = schema
    ? `\n\nReturn one valid JSON object without Markdown fences. It must match this JSON Schema:\n${JSON.stringify(schema)}`
    : "";
  const thinkingEnabled = options.deepseekThinking === true || (!schema && options.deepseekThinking !== false);
  return {
    model: String(options.model || ""),
    messages: [
      { role: "system", content: `${String(options.system || "")}${jsonInstruction}` },
      { role: "user", content: String(options.user || "") }
    ],
    ...(schema ? { response_format: { type: "json_object" } } : {}),
    thinking: { type: thinkingEnabled ? "enabled" : "disabled" },
    ...(thinkingEnabled ? { reasoning_effort: String(options.reasoning || "high") } : {}),
    max_tokens: Math.max(1024, Math.min(131072, Number(options.maxOutputTokens || 12000)))
  };
}

function parseDeepSeekResponse(response, options = {}) {
  const data = aiHTTPResponseData(response);
  const choice = data.choices?.[0];
  const outputText = choice?.message?.content;
  if (!outputText) {
    throw new AIProviderProtocolError("missing-output", {
      detail: choice?.finish_reason || "unknown"
    });
  }
  if (!["stop", null, undefined].includes(choice?.finish_reason)) {
    throw new AIProviderProtocolError("incomplete", { detail: choice.finish_reason });
  }
  return {
    requestId: String(data.id || response?.headers?.["x-request-id"] || response?.headers?.["X-Request-Id"] || ""),
    text: outputText,
    data: parseStructuredText(outputText, options),
    usage: {
      input: Number(data.usage?.prompt_tokens || 0),
      output: Number(data.usage?.completion_tokens || 0),
      total: Number(data.usage?.total_tokens || 0),
      cached: Number(data.usage?.prompt_cache_hit_tokens || 0)
    }
  };
}

function aiProviderFailureInfo(error) {
  const message = redactAISecrets(error?.detail || error?.message || error || "Unknown error").slice(0, 500);
  const status = Number(error?.status || message.match(/HTTP\s+(\d{3})/i)?.[1] || 0);
  if (status === 429 && /quota|billing|plan|额度|账单/i.test(message)) return { kind: "quota", status: "blocked", cooldownMs: 0, message };
  if ([401, 403].includes(status)) return { kind: "auth", status: "blocked", cooldownMs: 0, message };
  if (status === 404 && /model|模型/i.test(message)) return { kind: "model", status: "blocked", cooldownMs: 0, message };
  if (status === 429) return { kind: "rate-limit", status: "cooldown", cooldownMs: 2 * 60 * 1000, message };
  if (status >= 500) return { kind: "provider", status: "cooldown", cooldownMs: 60 * 1000, message };
  if (/timeout|timed out|network|fetch|ENOTFOUND|ECONN|网络|超时/i.test(message)) return { kind: "network", status: "degraded", cooldownMs: 0, message };
  if (error?.code === "invalid-json" || /JSON|Schema|结构|校验/i.test(message)) return { kind: "validation", status: "degraded", cooldownMs: 0, message };
  return { kind: "request", status: "degraded", cooldownMs: 0, message };
}

function aiProviderErrorMessage(error, provider = {}, translate = null) {
  const info = aiProviderFailureInfo(error);
  const key = `ai.error.${info.kind}`;
  const params = { provider: provider.label || "AI", detail: info.message };
  return typeof translate === "function" ? translate(key, params) : `${params.provider}: ${info.message}`;
}

module.exports = {
  AIProviderProtocolError,
  aiHTTPResponseData,
  aiProviderErrorMessage,
  aiProviderFailureInfo,
  buildDeepSeekRequest,
  buildOpenAIRequest,
  parseDeepSeekResponse,
  parseOpenAIResponse,
  redactAISecrets
};
