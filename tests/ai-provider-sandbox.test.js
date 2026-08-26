"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createVerifiedEntitlementAdapter } = require("../src/services/ai-entitlement");
const {
  MAX_PROMPT_BYTES,
  PROVIDER_ENDPOINTS,
  createAIProviderSandbox,
  createAIProviderSandboxTransport,
  normalizeKnowledgeAnswer
} = require("../src/services/ai-provider-sandbox");
const { createPrivateAIRuntimeAdapter, createSecretStorageCapabilities } = require("../src/services/ai-runtime-adapter");
const { createUsageManager } = require("../src/services/ai-usage");

const nowMs = Date.parse("2026-08-12T00:00:00.000Z");

async function createHarness(options = {}) {
  const secret = options.secret || "test-provider-credential";
  const entitlement = await createVerifiedEntitlementAdapter(async () => ({
    status: options.entitlementStatus || "trial",
    features: options.features || ["assistant"],
    trialRemaining: options.signedTrial ?? 1
  })).resolve("signed-test-envelope", { nowMs });
  const runtime = options.runtime || {
    async status() {
      return {
        entitlement,
        interactiveEnabled: true,
        providers: [{ id: "openai", status: options.providerStatus || "ready" }, { id: "deepseek", status: "ready" }]
      };
    },
    async withProviderSecret(providerId, operation) {
      assert.ok(["openai", "deepseek"].includes(providerId));
      const result = await operation(secret);
      assert.equal(JSON.stringify(result).includes(secret), false);
      return result;
    }
  };
  let usageState = { trialRemaining: options.localTrial ?? 1, ledger: [] };
  const usageManager = createUsageManager({
    now: () => new Date(nowMs),
    readState: () => usageState,
    writeState: (next) => { usageState = next; },
    save: options.saveUsage || (async () => {})
  });
  const jobs = [];
  const requests = [];
  const transport = createAIProviderSandboxTransport(options.fetch || (async (url, init) => {
    requests.push({ url, init });
    return {
      status: 200,
      headers: { get: () => "", forEach(callback) { callback("provider-request-1", "x-request-id"); } },
      text: async () => JSON.stringify({
        id: "provider-request-1",
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "{\"ok\":true}" }] }],
        usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 }
      })
    };
  }), { maxResponseBytes: 1024 * 1024 });
  const sandbox = createAIProviderSandbox({
    runtime,
    usageManager,
    transport,
    models: { openai: "gpt-test", deepseek: "deepseek-test" },
    saveJob: options.saveJob || (async (job) => jobs.push(job)),
    now: () => new Date(nowMs),
    setTimer: options.setTimer,
    clearTimer: options.clearTimer
  });
  return { jobs, requests, sandbox, secret, usageState: () => usageState, usageManager };
}

test("Provider sandbox binds OpenAI endpoint, model, secret scope, privacy defaults, and lifecycle", async () => {
  const harness = await createHarness();
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { ok: { type: "boolean" } },
    required: ["ok"]
  };
  const result = await harness.sandbox.execute({
    providerId: "openai",
    featureId: "assistant",
    url: "https://attacker.invalid/collect",
    model: "caller-model",
    apiKey: "caller-key",
    billable: false,
    system: "private system",
    user: "private user",
    schema,
    validate: (data) => data
  });
  assert.deepEqual(result.data, { ok: true });
  assert.deepEqual(result.usage, { input: 4, output: 2, total: 6, cached: 0 });
  assert.equal(result.requestId, "provider-request-1");
  assert.equal(result.outcome, "completed");
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].url, PROVIDER_ENDPOINTS.openai);
  assert.equal(harness.requests[0].init.redirect, "error");
  assert.equal(harness.requests[0].init.headers.Authorization, `Bearer ${harness.secret}`);
  const body = JSON.parse(harness.requests[0].init.body);
  assert.equal(body.model, "gpt-test");
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 12000);
  assert.equal(JSON.stringify(body).includes("caller-model"), false);
  assert.equal(JSON.stringify(body).includes("caller-key"), false);
  assert.deepEqual(harness.jobs.map(({ status }) => status), [
    "queued", "running", "response-received", "validating", "ready", "completed", "archived"
  ]);
  assert.equal(JSON.stringify(harness.jobs).includes("private user"), false);
  assert.equal(JSON.stringify(result.job).includes(harness.secret), false);
  assert.equal(harness.usageState().trialRemaining, 0);
  assert.equal(harness.usageState().ledger[0].billable, true);
  assert.equal(harness.usageState().ledger[0].totalTokens, 6);
});

test("DeepSeek stays on its fixed endpoint and uses its configured model", async () => {
  const requests = [];
  const harness = await createHarness({
    entitlementStatus: "active",
    localTrial: 0,
    fetch: async (url, init) => {
      requests.push({ url, init });
      return {
        status: 200,
        headers: { get: () => "", forEach() {} },
        text: async () => JSON.stringify({
          id: "deepseek-request",
          choices: [{ finish_reason: "stop", message: { content: "answer" } }],
          usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 }
        })
      };
    }
  });
  const result = await harness.sandbox.execute({
    providerId: "deepseek",
    featureId: "assistant",
    system: "system",
    user: "user",
    validate: (text) => ({ text })
  });
  assert.deepEqual(result.data, { text: "answer" });
  assert.equal(requests[0].url, PROVIDER_ENDPOINTS.deepseek);
  assert.equal(JSON.parse(requests[0].init.body).model, "deepseek-test");
});

test("connection probe fixes its prompt and schema inside the sandbox without charging trial", async () => {
  const harness = await createHarness({
    fetch: async (url, init) => {
      harness.requests.push({ url, init });
      return {
        status: 200,
        headers: { get: () => "", forEach() {} },
        text: async () => JSON.stringify({
          id: "probe-request",
          status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: "{\"ok\":true,\"provider\":\"GPT\"}" }] }],
          usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 }
        })
      };
    }
  });
  const result = await harness.sandbox.testConnection("openai", {
    system: "caller prompt must be ignored",
    user: "private caller text must be ignored",
    billable: true
  });
  assert.deepEqual(result.data, { ok: true, provider: "GPT" });
  const body = JSON.parse(harness.requests[0].init.body);
  assert.equal(JSON.stringify(body).includes("caller prompt"), false);
  assert.equal(JSON.stringify(body).includes("private caller"), false);
  assert.equal(body.text.format.name, "magic_os_connection_test");
  assert.equal(harness.usageState().trialRemaining, 1);
  assert.equal(harness.usageState().ledger[0].billable, false);
  assert.equal(harness.usageState().ledger[0].trialCharged, false);
});

test("read-only knowledge answer owns its prompt, schema, citations, validation, and billing", async () => {
  let request = null;
  const context = `---\ntype: magic-os-ai-knowledge-job\n---\n\n## 用户问题\n\n什么是安全边界？\n\n## 本地召回来源\n\n### 1. [[Dashboard/Knowledge/Safety|安全边界]]`;
  const harness = await createHarness({
    features: ["knowledge"],
    fetch: async (url, init) => {
      request = { url, init };
      return {
        status: 200,
        headers: { get: () => "", forEach() {} },
        text: async () => JSON.stringify({
          id: "knowledge-request",
          status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
            answer_markdown: "结论见 [[Dashboard/Knowledge/Safety|安全边界]]。",
            evidence_links: ["[[Dashboard/Knowledge/Safety]]"],
            gaps: [],
            distinctions: [{ kind: "库内事实", statement: "边界已记录。", source: "[[Dashboard/Knowledge/Safety]]" }]
          }) }] }],
          usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 }
        })
      };
    }
  });
  const result = await harness.sandbox.answerKnowledge("openai", context, {
    system: "caller cannot replace the fixed system prompt",
    schema: { type: "string" },
    billable: false
  });
  assert.equal(result.data.answer_markdown.includes("Safety"), true);
  assert.equal(request.url, PROVIDER_ENDPOINTS.openai);
  const body = JSON.parse(request.init.body);
  assert.equal(body.input[1].content, context);
  assert.equal(JSON.stringify(body).includes("caller cannot"), false);
  assert.equal(body.text.format.name, "magic_os_knowledge_answer");
  assert.equal(body.max_output_tokens, 8000);
  assert.equal(harness.usageState().trialRemaining, 0);
  assert.equal(harness.usageState().ledger[0].feature, "knowledge");
  assert.equal(harness.usageState().ledger[0].billable, true);
  assert.equal(harness.usageState().ledger[0].trialCharged, true);
});

test("knowledge answer rejects invented vault links and preserves trial quota", async () => {
  const context = `---\ntype: magic-os-ai-knowledge-job\n---\n\n## 用户问题\n\n问题\n\n### 1. [[Dashboard/Knowledge/Allowed]]\n\n> 摘录里偶然提到 [[Dashboard/Private/Invented]]`;
  const harness = await createHarness({
    features: ["knowledge"],
    fetch: async () => ({
      status: 200,
      headers: { get: () => "", forEach() {} },
      text: async () => JSON.stringify({
        id: "invalid-knowledge-request",
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
          answer_markdown: "伪造来源 [[Dashboard/Private/Invented]]",
          evidence_links: ["[[Dashboard/Private/Invented]]"],
          gaps: [],
          distinctions: []
        }) }] }],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }
      })
    })
  });
  await assert.rejects(harness.sandbox.answerKnowledge("openai", context), (error) => error.code === "validation");
  assert.equal(harness.usageState().trialRemaining, 1);
  assert.equal(harness.usageState().ledger[0].trialCharged, false);
  assert.deepEqual(harness.jobs.map(({ status }) => status), [
    "queued", "running", "response-received", "validating", "invalid", "archived"
  ]);
});

test("knowledge answer blocks active remote media and raw HTML before rendering", () => {
  const context = `---\ntype: magic-os-ai-knowledge-job\n---\n\n## 用户问题\n\n问题\n\n### 1. [[Dashboard/Knowledge/Allowed]]`;
  const base = { evidence_links: [], gaps: [], distinctions: [] };
  for (const answer_markdown of [
    "![tracking](https://attacker.invalid/pixel.png)",
    "<iframe src=\"https://attacker.invalid\"></iframe>",
    "<img src=\"https://attacker.invalid/pixel.png\">"
  ]) {
    assert.throws(() => normalizeKnowledgeAnswer({ ...base, answer_markdown }, context), (error) => error.code === "validation");
  }
});

test("knowledge answer cancellation aborts transport and releases the trial reservation", async () => {
  const context = `---\ntype: magic-os-ai-knowledge-job\n---\n\n## 用户问题\n\n问题`;
  let transportSignal = null;
  const harness = await createHarness({
    features: ["knowledge"],
    fetch: async (_url, init) => {
      transportSignal = init.signal;
      return new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      });
    }
  });
  const controller = new AbortController();
  const pending = harness.sandbox.answerKnowledge("openai", context, { signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, (error) => error.code === "cancelled");
  assert.equal(transportSignal.aborted, true);
  assert.equal(harness.usageState().trialRemaining, 1);
  assert.equal(harness.usageState().ledger[0].trialCharged, false);
});

test("Agent planner pins its catalog, feature, schema, authority, and managed billing", async () => {
  let request = null;
  const harness = await createHarness({
    features: ["action-closure"],
    fetch: async (url, init) => {
      request = { url, init };
      return {
        status: 200,
        headers: { get: () => "", forEach() {} },
        text: async () => JSON.stringify({
          id: "agent-plan-request",
          status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
            summary: "先搜索再整理。",
            steps: [
              { step_id: "s1", kind: "search", label: "搜索", permission: "P3", params: { query: "资料", limit: 20 }, uses: "" },
              { step_id: "s2", kind: "existing", label: "整理", permission: "P1", params: { sourceFiles: ["{result}", "Dashboard/Private/Invented.md"] }, uses: "s1" }
            ]
          }) }] }],
          usage: { input_tokens: 30, output_tokens: 15, total_tokens: 45 }
        })
      };
    }
  });
  const result = await harness.sandbox.planAgent("openai", "整理资料", {
    featureId: "assistant",
    system: "caller system",
    billable: false
  });
  assert.equal(result.data.steps[0].permission, "P1");
  assert.equal(result.data.steps[1].permission, "P2");
  assert.deepEqual(result.data.steps[1].params.sourceFiles, ["{result}"]);
  assert.equal(JSON.stringify(result).includes("Invented"), false);
  const body = JSON.parse(request.init.body);
  assert.equal(body.text.format.name, "magic_os_agent_plan");
  assert.equal(body.max_output_tokens, 4000);
  assert.equal(JSON.stringify(body).includes("caller system"), false);
  assert.equal(harness.usageState().ledger[0].feature, "action-closure");
  assert.equal(harness.usageState().ledger[0].billable, true);
});

test("link router is fixed to one reviewed public URL and catalog route", async () => {
  let request = null;
  let fetchCalls = 0;
  const catalog = [{
    moduleId: "navigation",
    moduleName: "Navigation",
    typeId: "study-note",
    typeLabel: "Study note",
    typeDesc: "Reviewed note",
    presets: [{ key: "topic-history", label: "History", tag: "#topic/history" }]
  }];
  const harness = await createHarness({
    features: ["classify"],
    fetch: async (url, init) => {
      fetchCalls += 1;
      request = { url, init };
      return {
        status: 200,
        headers: { get: () => "", forEach() {} },
        text: async () => JSON.stringify({
          id: "link-route-request",
          status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
            moduleId: "navigation",
            typeId: "study-note",
            presetKeys: ["topic-history", "invented"],
            customTags: ["#topic/review"],
            profileId: "web-article-deep",
            reason: "Reviewed route."
          }) }] }],
          usage: { input_tokens: 18, output_tokens: 8, total_tokens: 26 }
        })
      };
    }
  });
  const result = await harness.sandbox.routeLink("openai", {
    url: "https://example.org/article",
    sourceKind: "web-article",
    query: "详细梳理",
    catalog
  }, { url: "https://attacker.invalid", billable: false });
  assert.deepEqual(result.data.presetKeys, ["topic-history"]);
  assert.equal(result.data.profileId, "web-article-deep");
  const body = JSON.parse(request.init.body);
  assert.equal(body.text.format.name, "magic_os_link_routing");
  assert.equal(body.max_output_tokens, 2000);
  assert.equal(body.input[1].content.includes("https://example.org/article"), true);
  assert.equal(body.input[1].content.includes("attacker.invalid"), false);
  assert.equal(harness.usageState().ledger[0].feature, "classify");
  assert.equal(harness.usageState().ledger[0].billable, true);
  await assert.rejects(harness.sandbox.routeLink("openai", {
    url: "http://127.0.0.1/private",
    sourceKind: "web-article",
    catalog
  }), (error) => error.code === "validation");
  assert.equal(fetchCalls, 1);
});

test("classification planner tokenizes local paths and owns routes, tools, schema, and billing", async () => {
  let request = null;
  const harness = await createHarness({
    features: ["classify"],
    fetch: async (url, init) => {
      request = { url, init };
      return {
        status: 200,
        headers: { get: () => "", forEach() {} },
        text: async () => JSON.stringify({
          id: "classification-request", status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
            version: 1, summary: "Reviewed plan.", questions: [],
            objects: [{
              id: "primary-1", primary: true, enabled: true, module: "navigation", type: "study-note",
              title: "Safe note", reason: "Useful", body_profile: "invented", body: "# Safe note\n\n## Content\nReviewed.",
              fields: [{ key: "summary", value_json: "\"Reviewed\"" }], tags: [], links: [], relations: []
            }]
          }) }] }],
          usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 }
        })
      };
    }
  });
  const result = await harness.sandbox.planClassification("openai", {
    content: "source: Dashboard/Private/Notes/One.md\n[[Dashboard/Private/Notes/One.md|One]]",
    localPaths: ["Dashboard/Private/Notes/One.md"],
    routes: [{ moduleId: "navigation", typeId: "study-note", label: "Study note" }],
    targetModule: "navigation", targetType: "study-note", bodyProfile: "os-intake-standard",
    system: "caller system", billable: false
  });
  const body = JSON.parse(request.init.body);
  assert.equal(body.text.format.name, "magic_os_classify_plan");
  assert.equal(body.max_output_tokens, 16000);
  assert.equal(JSON.stringify(body).includes("Dashboard/Private"), false);
  assert.equal(JSON.stringify(body).includes("caller system"), false);
  assert.equal(result.data.objects[0].body_profile, "os-intake-standard");
  assert.equal(harness.usageState().ledger[0].feature, "classify");
  assert.equal(harness.usageState().ledger[0].billable, true);
});

test("learning planners keep source paths local and validate coverage before managed billing", async () => {
  const requests = [];
  const harness = await createHarness({
    entitlementStatus: "active",
    localTrial: 0,
    features: ["learning-generation"],
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      requests.push(body);
      const name = body.text.format.name;
      const data = name === "magic_os_learning_cards" ? {
        version: 1, summary: "One card.", warnings: [], cards: [{
          id: "card-1", coverage_key: "coverage-1", coverage_heading: "Heading", title: "Rule",
          prompt: "What is the rule?", answer: "Answer", explanation: "Evidence-based.", source_refs: ["source-1"],
          questions: [{ type: "single", question: "Which is correct?", options: ["A", "B"], correct: [0], explanation: "A." }]
        }]
      } : {
        version: 1, title: "Map", summary: "Complete map.", warnings: [], nodes: [{
          node_id: "node-1", parent_id: "", title: "Rule", summary: "Summary", node_type: "rule", order: 1,
          importance: 4, exam_focus: "Focus", coverage_keys: ["coverage-1"], prerequisite_ids: [], contrast_ids: []
        }]
      };
      return {
        status: 200, headers: { get: () => "", forEach() {} },
        text: async () => JSON.stringify({
          id: `${name}-request`, status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(data) }] }],
          usage: { input_tokens: 24, output_tokens: 12, total_tokens: 36 }
        })
      };
    }
  });
  const sourcePath = "Dashboard/Private/Study/Source.md";
  const cards = await harness.sandbox.planLearningCards("openai", {
    content: `source_files: [${sourcePath}]`, sourcePaths: [sourcePath], coverageKeys: ["coverage-1"], maxCards: 1,
    schema: { type: "string" }, billable: false
  });
  const map = await harness.sandbox.planLearningMap("openai", {
    theme: "Policy", goal: "Build a map", sourcePaths: [sourcePath],
    points: [{ coverageKey: "coverage-1", title: "Rule", sourcePath, evidencePreview: "Evidence" }],
    system: "caller system"
  });
  assert.deepEqual(cards.data.cards[0].source_refs, [sourcePath]);
  assert.equal(map.data.nodes[0].coverage_keys[0], "coverage-1");
  assert.equal(JSON.stringify(requests).includes(sourcePath), false);
  assert.equal(requests[0].text.format.name, "magic_os_learning_cards");
  assert.equal(requests[1].text.format.name, "magic_os_learning_knowledge_map");
  assert.deepEqual(harness.usageState().ledger.map((item) => item.feature), ["learning-generation", "learning-generation"]);
  assert.equal(harness.usageState().ledger.every((item) => item.billable), true);
});

test("maintenance planners keep source paths local and own patch and card-library authority", async () => {
  const requests = [];
  const harness = await createHarness({
    entitlementStatus: "active",
    localTrial: 0,
    features: ["existing-files", "card-library"],
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body);
      requests.push(body);
      const name = body.text.format.name;
      const data = name === "magic_os_existing_files_plan" ? {
        version: 1, mode: "existing-files", target_module: "navigation", summary: "One patch.",
        files: [{
          source_token: "source-1", title: "Policy", suggested_type: "study-note", confidence: 0.9,
          patches: [{ field: "summary", operation: "add", value_json: "\"Reviewed summary\"", confidence: 0.9, reason: "Missing", evidence: "Defined in note" }],
          warnings: []
        }]
      } : {
        version: 1, title: "Model title", summary: "Public archive.",
        subLibraries: [{
          title: "Volume One", author: "Author", era: "Era", summary: "Summary", excerpt: "Excerpt", excerptSource: "Chapter 1", reviews: [],
          cards: [{ topic: "Overview", prompt: "What is it?", answer: "Answer", explanation: "Explanation", quiz: { type: "single", question: "Which?", options: ["A", "B"], correct: [0], explanation: "A" } }]
        }]
      };
      return {
        status: 200, headers: { get: () => "", forEach() {} },
        text: async () => JSON.stringify({
          id: `${name}-request`, status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(data) }] }],
          usage: { input_tokens: 30, output_tokens: 15, total_tokens: 45 }
        })
      };
    }
  });
  const sourcePath = "Dashboard/Private/Modules/Navigation/Study/Policy.md";
  const patches = await harness.sandbox.planExistingFilePatches("openai", {
    targetModule: "navigation", allowedTypes: ["study-note"],
    files: [{ path: sourcePath, title: "Policy", currentFrontmatter: { title: "Policy" }, excerpt: "Evidence" }],
    system: "caller system", schema: { type: "string" }, billable: false
  });
  const library = await harness.sandbox.planCardLibrary("openai", {
    subject: "Public subject", topics: ["Overview"], model: "caller-model", tools: [{ type: "web_search" }], billable: false
  });
  assert.equal(patches.data.files[0].path, sourcePath);
  assert.equal(patches.data.files[0].patches[0].value, "Reviewed summary");
  assert.equal(library.data.title, "Public subject");
  assert.equal(JSON.stringify(requests).includes(sourcePath), false);
  assert.equal(JSON.stringify(requests).includes("caller system"), false);
  assert.equal(JSON.stringify(requests).includes("caller-model"), false);
  assert.equal(requests[0].text.format.name, "magic_os_existing_files_plan");
  assert.equal(requests[0].max_output_tokens, 12000);
  assert.equal(requests[1].text.format.name, "magic_os_card_library_plan");
  assert.equal(requests[1].max_output_tokens, 18000);
  assert.equal(requests[1].tools, undefined);
  assert.deepEqual(harness.usageState().ledger.map((item) => item.feature).sort(), ["card-library", "existing-files"]);
  assert.equal(harness.usageState().ledger.every((item) => item.billable), true);
});

test("Skill runtime owns the read-only prompt, schema, tools, billing, and path redaction", async () => {
  let request = null;
  const harness = await createHarness({
    features: ["skill-runtime"],
    fetch: async (url, init) => {
      request = { url, body: JSON.parse(init.body) };
      return {
        status: 200, headers: { get: () => "", forEach() {} },
        text: async () => JSON.stringify({
          id: "skill-request", status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
            matched: true,
            summary: "The supplied task matches the workflow.",
            completed: [{ item: "Reviewed the supplied text", evidence: "Two claims were present." }],
            failed: [], approvals: [], report_markdown: "## Review\n\nNo external action was performed."
          }) }] }],
          usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 }
        })
      };
    }
  });
  const result = await harness.sandbox.runSkill("openai", {
    skillName: "review-notes",
    skillDefinition: "Review [[Dashboard/Private/Plan]] without writing.",
    task: "Summarize file:///private/private.md",
    system: "caller system",
    schema: { type: "string" },
    tools: [{ type: "web_search" }],
    billable: false
  });
  assert.equal(result.data.matched, true);
  assert.equal(request.url, PROVIDER_ENDPOINTS.openai);
  assert.equal(JSON.stringify(request.body).includes("Dashboard/Private"), false);
  assert.equal(JSON.stringify(request.body).includes("file:///private"), false);
  assert.equal(JSON.stringify(request.body).includes("caller system"), false);
  assert.equal(request.body.text.format.name, "magic_os_skill_report");
  assert.equal(request.body.max_output_tokens, 10000);
  assert.equal(request.body.tools, undefined);
  assert.equal(harness.usageState().ledger[0].feature, "skill-runtime");
  assert.equal(harness.usageState().ledger[0].billable, true);
});

test("locked entitlement and unready providers fail before secret or network access", async () => {
  let secretCalls = 0;
  let fetchCalls = 0;
  const entitlement = await createVerifiedEntitlementAdapter(async () => ({ status: "locked", features: ["assistant"] }))
    .resolve("signed", { nowMs });
  const runtime = {
    async status() { return { entitlement, interactiveEnabled: true, providers: [{ id: "openai", status: "ready" }] }; },
    async withProviderSecret() { secretCalls += 1; }
  };
  const locked = await createHarness({ runtime, fetch: async () => { fetchCalls += 1; } });
  await assert.rejects(locked.sandbox.execute({ providerId: "openai", featureId: "assistant" }), (error) => error.code === "locked");
  assert.equal(secretCalls, 0);
  assert.equal(fetchCalls, 0);
  assert.deepEqual(locked.jobs, []);

  const unready = await createHarness({ providerStatus: "not-configured", fetch: async () => { fetchCalls += 1; } });
  await assert.rejects(unready.sandbox.execute({ providerId: "openai", featureId: "assistant" }), (error) => error.code === "provider-not-ready");
  assert.equal(fetchCalls, 0);
  assert.deepEqual(unready.jobs, []);
});

test("real private runtime keeps provider credentials inside the request scope", async () => {
  const secret = "test-provider-credential";
  const runtime = createPrivateAIRuntimeAdapter({
    secrets: createSecretStorageCapabilities({ async getSecret() { return secret; } }),
    loadEntitlementEnvelope: async () => "signed-private-envelope",
    verifyEntitlement: async () => ({ status: "active", features: ["assistant"] }),
    executionEnabled: true
  });
  const harness = await createHarness({ runtime, secret, localTrial: 0 });
  const result = await harness.sandbox.execute({ providerId: "openai", featureId: "assistant", user: "hello", validate: (data) => data });
  assert.equal(result.outcome, "completed");
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(harness.jobs).includes(secret), false);
});

test("Provider validation failure archives safely and does not charge trial quota", async () => {
  const harness = await createHarness();
  await assert.rejects(harness.sandbox.execute({
    providerId: "openai",
    featureId: "assistant",
    schema: { type: "object" },
    validate() { throw new Error("private schema detail"); }
  }), (error) => error.code === "validation" && !error.message.includes("private"));
  assert.deepEqual(harness.jobs.map(({ status }) => status), [
    "queued", "running", "response-received", "validating", "invalid", "archived"
  ]);
  assert.equal(harness.usageState().trialRemaining, 1);
  assert.equal(harness.usageState().ledger[0].trialCharged, false);
});

test("only sandbox-issued transports are accepted and model identifiers are constrained", () => {
  const runtime = { status() {}, withProviderSecret() {} };
  const usageManager = createUsageManager();
  assert.throws(() => createAIProviderSandbox({
    runtime,
    usageManager,
    transport: async () => {},
    models: { openai: "gpt-test", deepseek: "deepseek-test" }
  }), (error) => error.code === "transport-unsupported");
  const transport = createAIProviderSandboxTransport(async () => {});
  assert.throws(() => createAIProviderSandbox({
    runtime,
    usageManager,
    transport,
    models: { openai: "https://attacker.invalid", deepseek: "deepseek-test" }
  }), (error) => error.code === "validation");
});

test("runtime execution must be explicitly enabled even with valid entitlement and secrets", async () => {
  let secretCalls = 0;
  const entitlement = await createVerifiedEntitlementAdapter(async () => ({ status: "active", features: ["assistant"] }))
    .resolve("signed", { nowMs });
  const runtime = {
    async status() { return { entitlement, interactiveEnabled: false, providers: [{ id: "openai", status: "ready" }] }; },
    async withProviderSecret() { secretCalls += 1; }
  };
  const harness = await createHarness({ runtime, localTrial: 0 });
  await assert.rejects(harness.sandbox.execute({ providerId: "openai", featureId: "assistant" }), (error) => error.code === "disabled");
  assert.equal(secretCalls, 0);
  assert.equal(harness.requests.length, 0);
});

test("sandbox permits only bounded web search and rejects remote tools, getters, and oversized prompts", async () => {
  const harness = await createHarness({ entitlementStatus: "active", localTrial: 0 });
  await harness.sandbox.execute({
    providerId: "openai",
    featureId: "assistant",
    tools: [{ type: "web_search" }],
    user: "search"
  });
  assert.deepEqual(JSON.parse(harness.requests[0].init.body).tools, [{ type: "web_search" }]);
  for (const tools of [
    [{ type: "mcp", server_url: "https://attacker.invalid" }],
    [{ type: "web_search", extra: true }]
  ]) {
    await assert.rejects(harness.sandbox.execute({ providerId: "openai", featureId: "assistant", tools }), (error) => error.code === "validation");
  }
  let getterCalls = 0;
  const unsafeSchema = Object.defineProperty({}, "type", { enumerable: true, get() { getterCalls += 1; return "object"; } });
  await assert.rejects(harness.sandbox.execute({ providerId: "openai", featureId: "assistant", schema: unsafeSchema }), (error) => error.code === "validation");
  assert.equal(getterCalls, 0);
  await assert.rejects(harness.sandbox.execute({
    providerId: "openai",
    featureId: "assistant",
    user: "x".repeat(MAX_PROMPT_BYTES + 1)
  }), (error) => error.code === "validation");
  assert.equal(harness.usageState().ledger.length, 1);
});

test("HTTP failure is redacted, archived, and does not charge trial quota", async () => {
  const harness = await createHarness({
    fetch: async () => ({
      status: 401,
      headers: { get: () => "", forEach() {} },
      text: async () => "{\"error\":{\"message\":\"bad private credential\"}}"
    })
  });
  await assert.rejects(harness.sandbox.execute({ providerId: "openai", featureId: "assistant" }), (error) => (
    error.code === "auth" && !error.message.includes("private")
  ));
  assert.deepEqual(harness.jobs.map(({ status }) => status), ["queued", "running", "failed", "archived"]);
  assert.equal(JSON.stringify(harness.jobs).includes("private credential"), false);
  assert.equal(harness.usageState().trialRemaining, 1);
  assert.equal(harness.usageState().ledger[0].trialCharged, false);
});

test("user cancellation reaches fetch and releases the trial reservation", async () => {
  const controller = new AbortController();
  let fetchSignal;
  const harness = await createHarness({
    fetch: async (_url, init) => {
      fetchSignal = init.signal;
      return new Promise((_, reject) => init.signal.addEventListener("abort", () => {
        reject(Object.assign(new Error("private abort detail"), { code: "cancelled" }));
      }, { once: true }));
    },
    setTimer() { return 17; },
    clearTimer() {}
  });
  const pending = harness.sandbox.execute({ providerId: "openai", featureId: "assistant", signal: controller.signal });
  while (!fetchSignal) await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, (error) => error.code === "cancelled" && !error.message.includes("private"));
  assert.equal(fetchSignal.aborted, true);
  assert.equal(harness.usageManager.reservationCount(), 0);
  assert.equal(harness.usageState().trialRemaining, 1);
  assert.deepEqual(harness.jobs.map(({ status }) => status), ["queued", "running", "cancelled", "archived"]);
});
