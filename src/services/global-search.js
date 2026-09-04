"use strict";

function normalizeGlobalSearchText(value) {
  return String(value || "")
    .toLocaleLowerCase("zh-Hans-CN")
    .replace(/[，。！？、；：“”‘’（）《》【】[\]{}<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveGlobalSearchTerms(query) {
  const raw = normalizeGlobalSearchText(query);
  if (!raw) return [];
  const focused = raw
    .replace(/^(?:(?:我想知道|我想了解|告诉我|查一下|搜一下|请问|麻烦|帮我|给我|搜索|查找|看看|请)\s*)+/g, "")
    .replace(/(?:在哪里|在哪篇|哪一篇|是什么|讲了什么|说了什么|有哪些|有没有|怎么|如何|为什么|是否|能不能|可不可以|相关的?|主要内容|具体内容|资料|笔记|记录|文章|文件|一下)/g, " ")
    .replace(/的/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const source = focused || raw;
  const terms = [];
  const seen = new Set();
  const add = (value) => {
    const term = normalizeGlobalSearchText(value).replace(/\s+/g, "");
    if (term.length < 2 || seen.has(term)) return;
    seen.add(term);
    terms.push(term);
  };
  add(source);
  (source.match(/[a-z0-9][a-z0-9_.+-]{1,}/gi) || []).forEach(add);
  (source.match(/[\u3400-\u9fff]{2,}/g) || []).forEach((sequence) => {
    add(sequence);
    if (sequence.length <= 4) return;
    [4, 3].forEach((size) => {
      for (let index = 0; index <= sequence.length - size; index += 1) add(sequence.slice(index, index + size));
    });
  });
  return terms.sort((a, b) => b.length - a.length).slice(0, 36);
}

function countOccurrences(haystack, needle) {
  if (!haystack || !needle) return { count: 0, first: -1 };
  let count = 0;
  let first = -1;
  let from = 0;
  let index = haystack.indexOf(needle, from);
  while (index >= 0) {
    count += 1;
    if (first < 0) first = index;
    from = index + Math.max(1, needle.length);
    index = haystack.indexOf(needle, from);
  }
  return { count, first };
}

function buildGlobalTextMatch(content, query, suppliedTerms = null) {
  const text = String(content || "");
  const lower = text.toLocaleLowerCase("zh-Hans-CN");
  const terms = Array.isArray(suppliedTerms) ? suppliedTerms : deriveGlobalSearchTerms(query);
  if (!lower || !terms.length) return null;
  const matches = [];
  terms.forEach((term, index) => {
    const match = countOccurrences(lower, term);
    if (!match.count) return;
    matches.push({ term, index, ...match });
  });
  if (!matches.length) return null;
  const longest = matches.reduce((max, item) => Math.max(max, item.term.length), 0);
  if (longest < 4 && matches.length < 2) return null;
  matches.sort((a, b) => b.term.length - a.term.length || a.index - b.index || b.count - a.count);
  const primary = matches[0];
  const coverageBonus = Math.min(16, matches.length * 2);
  const score = Math.min(132, primary.term.length * 8 + Math.min(12, primary.count) * 3 + (primary.index === 0 ? 24 : 0) + coverageBonus);
  return {
    score,
    hits: primary.count,
    firstHit: primary.first,
    matchedTerms: matches.map((item) => item.term).slice(0, 10)
  };
}

function globalSearchLineAtOffset(content, offset) {
  const safeOffset = Math.max(0, Math.min(String(content || "").length, Number(offset) || 0));
  return Math.max(0, String(content || "").slice(0, safeOffset).split("\n").length - 1);
}

function globalSearchHeadingAtOffset(content, offset) {
  const text = String(content || "");
  const safeOffset = Math.max(0, Number(offset) || 0);
  const lineEnd = text.indexOf("\n", safeOffset);
  const before = text.slice(0, lineEnd >= 0 ? lineEnd : text.length);
  const headings = Array.from(before.matchAll(/^#{1,6}\s+(.+)$/gm));
  return headings.length ? headings[headings.length - 1][1].replace(/<!--[\s\S]*?-->/g, "").trim().slice(0, 120) : "";
}

function globalSearchExcerpt(content, offset, maxChars = 300) {
  const text = String(content || "");
  if (!text) return "";
  const center = Math.max(0, Number(offset) || 0);
  const radius = Math.max(80, Math.round(Number(maxChars || 300) * 0.36));
  const start = Math.max(0, center - radius);
  const end = Math.min(text.length, start + Math.max(160, Number(maxChars || 300)));
  const excerpt = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${excerpt}${end < text.length ? "…" : ""}`;
}

module.exports = {
  buildGlobalTextMatch,
  deriveGlobalSearchTerms,
  globalSearchExcerpt,
  globalSearchHeadingAtOffset,
  globalSearchLineAtOffset,
  normalizeGlobalSearchText
};
