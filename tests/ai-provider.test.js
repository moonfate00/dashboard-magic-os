"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  AIProviderProtocolError,
  aiProviderErrorMessage,
  aiProviderFailureInfo,
  buildDeepSeekRequest,
  buildOpenAIRequest,
  parseDeepSeekResponse,
  parseOpenAIResponse,
  redactAISecrets
} = require("../src/services/ai-provider");
const { createI18n } = require("../src/i18n");

const schema = {
  type: "object",
  additionalProperties: false,
  properties: { ok: { type: "boolean" } },
  required: ["ok"]
};

test("OpenAI requests preserve tools, privacy defaults, and strict JSON Schema", () => {
  const payload = buildOpenAIRequest({
    model: "gpt-test",
    system: "system",
    user: "user",
    reasoning: "high",
    tools: [{ type: "web_search" }],
    schema,
    schemaName: "bad name!"
  });
  assert.equal(payload.model, "gpt-test");
  assert.equal(payload.store, false);
  assert.equal(payload.max_output_tokens, 12000);
  assert.equal(payload.reasoning.effort, "high");
  assert.equal(payload.tool_choice, "auto");
  assert.equal(payload.text.format.name, "bad_name_");
  assert.equal(payload.text.format.strict, true);
  assert.equal(JSON.stringify(payload).includes("apiKey"), false);
});

test("OpenAI responses normalize structured output and usage", () => {
  const parsed = parseOpenAIResponse({
    status: 200,
    headers: { "x-request-id": "header-id" },
    json: {
      id: "response-id",
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: "{\"ok\":true}" }] }],
      usage: {
        input_tokens: 10,
        output_tokens: 4,
        total_tokens: 14,
        input_tokens_details: { cached_tokens: 3 }
      }
    }
  }, { schema });
  assert.equal(parsed.requestId, "response-id");
  assert.equal(parsed.data.ok, true);
  assert.deepEqual(parsed.usage, { input: 10, output: 4, total: 14, cached: 3 });
});

test("OpenAI responses combine text parts and normalize unsafe usage values", () => {
  const parsed = parseOpenAIResponse({
    status: 200,
    json: {
      output: [
        { type: "message", content: [{ type: "output_text", text: "hello " }] },
        { type: "message", content: [{ type: "output_text", text: "world" }] }
      ],
      usage: { input_tokens: NaN, output_tokens: Infinity, total_tokens: -2 }
    }
  });
  assert.equal(parsed.text, "hello world");
  assert.deepEqual(parsed.usage, { input: 0, output: 0, total: 0, cached: 0 });
});

test("OpenAI parser uses structured errors for HTTP, incomplete, and refusal cases", () => {
  assert.throws(() => parseOpenAIResponse({ status: 401, json: { error: { message: "bad key" } } }), (error) => (
    error instanceof AIProviderProtocolError && error.code === "http" && error.status === 401
  ));
  assert.throws(() => parseOpenAIResponse({
    status: 200,
    json: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }
  }), (error) => error.code === "incomplete");
  assert.throws(() => parseOpenAIResponse({
    status: 200,
    json: { output: [{ type: "message", content: [{ type: "refusal", refusal: "unsafe" }] }] }
  }), (error) => error.code === "refusal");
  assert.throws(() => parseOpenAIResponse({ status: 200, json: null }), (error) => error.code === "invalid-json");
  assert.throws(() => parseOpenAIResponse({ status: 200, json: [] }), (error) => error.code === "invalid-json");
});

test("DeepSeek builder separates structured and reasoning modes", () => {
  const structured = buildDeepSeekRequest({ model: "deepseek-test", schema, maxOutputTokens: 256 });
  const conversational = buildDeepSeekRequest({ model: "deepseek-test", reasoning: "max", maxOutputTokens: 999999 });
  assert.equal(structured.thinking.type, "disabled");
  assert.equal(structured.response_format.type, "json_object");
  assert.equal(structured.max_tokens, 1024);
  assert.equal(conversational.thinking.type, "enabled");
  assert.equal(conversational.reasoning_effort, "max");
  assert.equal(conversational.max_tokens, 131072);
  assert.equal(buildDeepSeekRequest({ maxOutputTokens: NaN }).max_tokens, 12000);
});

test("DeepSeek responses normalize output and reject truncation", () => {
  const parsed = parseDeepSeekResponse({
    status: 200,
    headers: { "X-Request-Id": "deepseek-header" },
    json: {
      choices: [{ finish_reason: "stop", message: { content: "{\"ok\":true}" } }],
      usage: { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11, prompt_cache_hit_tokens: 2 }
    }
  }, { schema });
  assert.equal(parsed.requestId, "deepseek-header");
  assert.deepEqual(parsed.usage, { input: 8, output: 3, total: 11, cached: 2 });
  assert.throws(() => parseDeepSeekResponse({
    status: 200,
    json: { choices: [{ finish_reason: "length", message: { content: "partial" } }] }
  }), (error) => error.code === "incomplete");
});

test("failures are classified, redacted, and localized without retaining credentials", () => {
  assert.equal(aiProviderFailureInfo(new AIProviderProtocolError("http", { status: 429, detail: "quota exceeded" })).kind, "quota");
  assert.equal(aiProviderFailureInfo(new AIProviderProtocolError("http", { status: 503, detail: "unavailable" })).kind, "provider");
  const redacted = redactAISecrets("sk-secret and provider-secret", ["provider-secret"]);
  assert.equal(redacted.includes("sk-secret"), false);
  assert.equal(redacted.includes("provider-secret"), false);
  assert.equal(redactAISecrets("Authorization: Bearer another-secret").includes("another-secret"), false);
  const zh = createI18n({ locale: "zh-CN" });
  const en = createI18n({ locale: "en" });
  const error = new AIProviderProtocolError("http", { status: 401, detail: "bad key" });
  assert.match(aiProviderErrorMessage(error, { label: "Test AI" }, zh.t), /密钥|授权/);
  assert.match(aiProviderErrorMessage(error, { label: "Test AI" }, en.t), /key|authorization/i);
});
