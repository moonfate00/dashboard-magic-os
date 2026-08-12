"use strict";

function finiteTimeout(value, fallback = 120000) {
  const number = Number(value);
  const safe = Number.isFinite(number) ? number : fallback;
  return Math.max(15000, Math.min(10 * 60 * 1000, Math.floor(safe)));
}

function responseSizeError() {
  const error = new Error("AI response exceeded the configured size limit");
  error.code = "response-too-large";
  return error;
}

async function readBoundedText(response, maxResponseBytes) {
  const declaredLength = Number(response.headers?.get?.("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) throw responseSizeError();
  const reader = response.body?.getReader?.();
  if (reader && typeof TextDecoder === "function") {
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
      bytes += chunk.byteLength;
      if (bytes > maxResponseBytes) {
        await reader.cancel?.();
        throw responseSizeError();
      }
      text += decoder.decode(chunk, { stream: true });
    }
    return text + decoder.decode();
  }
  const text = await response.text();
  const responseBytes = typeof TextEncoder === "function" ? new TextEncoder().encode(text).byteLength : text.length;
  if (responseBytes > maxResponseBytes) throw responseSizeError();
  return text;
}

async function requestWithTimeout(transport, request, options = {}) {
  if (typeof transport !== "function") throw new TypeError("AI transport must be a function");
  if (typeof AbortController !== "function") {
    const error = new Error("AbortController is required for AI requests");
    error.code = "transport-unsupported";
    throw error;
  }
  const timeoutMs = finiteTimeout(options.timeoutMs);
  const controller = new AbortController();
  const schedule = typeof options.setTimer === "function" ? options.setTimer : setTimeout;
  const cancel = typeof options.clearTimer === "function" ? options.clearTimer : clearTimeout;
  const parentSignal = options.signal;
  if (parentSignal?.aborted) {
    const error = new Error("AI request cancelled");
    error.code = "cancelled";
    throw error;
  }
  let timeoutId;
  let removeParentAbort = () => {};
  try {
    let rejectCancelled;
    const cancelled = new Promise((_, reject) => { rejectCancelled = reject; });
    const abortFromParent = () => {
      const error = new Error("AI request cancelled");
      error.code = "cancelled";
      rejectCancelled(error);
      controller.abort(parentSignal?.reason);
    };
    if (typeof parentSignal?.addEventListener === "function") {
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
      removeParentAbort = () => parentSignal.removeEventListener?.("abort", abortFromParent);
    }
    const timeout = new Promise((_, reject) => {
      timeoutId = schedule(() => {
        const error = new Error(`AI request timed out after ${timeoutMs}ms`);
        error.code = "timeout";
        reject(error);
        controller.abort(error);
      }, timeoutMs);
    });
    return await Promise.race([
      transport({ ...request, signal: controller?.signal }),
      timeout,
      cancelled
    ]);
  } finally {
    cancel(timeoutId);
    removeParentAbort();
  }
}

function createFetchTransport(fetchImplementation = globalThis.fetch, options = {}) {
  if (typeof fetchImplementation !== "function") throw new TypeError("fetch must be a function");
  const allowedOrigins = new Set((Array.isArray(options.allowedOrigins)
    ? options.allowedOrigins
    : ["https://api.openai.com", "https://api.deepseek.com"])
    .map((value) => {
      try { return new URL(String(value)).origin; } catch { return ""; }
    })
    .filter(Boolean));
  const maxResponseBytes = Math.max(1024, Math.min(20 * 1024 * 1024,
    Number.isFinite(Number(options.maxResponseBytes)) ? Math.floor(Number(options.maxResponseBytes)) : 10 * 1024 * 1024));
  return async function fetchAITransport(request = {}) {
    let url;
    try { url = new URL(String(request.url || "")); } catch {
      const error = new Error("AI provider URL is invalid");
      error.code = "provider-url";
      throw error;
    }
    if (url.protocol !== "https:" || !allowedOrigins.has(url.origin)) {
      const error = new Error("AI provider origin is not allowlisted");
      error.code = "provider-origin";
      throw error;
    }
    const response = await fetchImplementation(url.toString(), {
      method: String(request.method || "POST"),
      headers: request.headers && typeof request.headers === "object" ? request.headers : {},
      body: request.body,
      signal: request.signal,
      redirect: "error"
    });
    const text = await readBoundedText(response, maxResponseBytes);
    let json;
    try { json = JSON.parse(text); } catch { json = undefined; }
    const headers = {};
    response.headers?.forEach?.((value, key) => {
      const normalizedKey = String(key).toLowerCase();
      if (["x-request-id", "openai-request-id"].includes(normalizedKey)) headers[normalizedKey] = String(value).slice(0, 200);
    });
    return { status: Number(response.status || 0), headers, json, text };
  };
}

module.exports = { createFetchTransport, finiteTimeout, readBoundedText, requestWithTimeout };
