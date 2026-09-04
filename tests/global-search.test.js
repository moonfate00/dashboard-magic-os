"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildGlobalTextMatch,
  deriveGlobalSearchTerms,
  globalSearchExcerpt,
  globalSearchHeadingAtOffset,
  globalSearchLineAtOffset
} = require("../src/services/global-search");

test("natural-language questions retain the subject terms needed for local search", () => {
  const terms = deriveGlobalSearchTerms("请问毛泽东思想的主要内容是什么？");
  assert.equal(terms.includes("毛泽东思想"), true);
  assert.equal(terms.includes("是什么"), false);
  assert.equal(terms.includes("主要内容"), false);
});

test("full-text matches preserve exact note location and a readable excerpt", () => {
  const content = "# 公文\n\n## 毛泽东思想专题\n\n这里讨论毛泽东思想的形成和主要内容。\n";
  const match = buildGlobalTextMatch(content, "毛泽东思想");
  assert.ok(match);
  assert.equal(globalSearchLineAtOffset(content, match.firstHit), 2);
  assert.equal(globalSearchHeadingAtOffset(content, match.firstHit), "毛泽东思想专题");
  assert.match(globalSearchExcerpt(content, match.firstHit), /毛泽东思想/);
});

test("unrelated text is not promoted as a global-search match", () => {
  assert.equal(buildGlobalTextMatch("今天整理了资产舱的背景图片。", "毛泽东思想"), null);
});
