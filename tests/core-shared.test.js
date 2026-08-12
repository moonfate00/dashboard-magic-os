"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { asList, escapeYaml, formatStickyDate, yamlArray, yamlValue } = require("../src/core/shared");

test("list normalization keeps the existing Magic OS contract", () => {
  assert.deepEqual(asList(["a", "b"]), ["a", "b"]);
  assert.deepEqual(asList("  a  "), ["a"]);
  assert.deepEqual(asList(""), []);
  assert.deepEqual(asList(null), []);
});

test("YAML helpers escape strings and preserve primitive values", () => {
  assert.equal(escapeYaml("a\\b\"c"), "a\\\\b\\\"c");
  assert.equal(yamlArray(["a", "b"]), "[\"a\", \"b\"]");
  assert.equal(yamlValue(true), "true");
  assert.equal(yamlValue(42), "42");
  assert.equal(yamlValue("hello"), "\"hello\"");
});

test("sticky dates have stable note and filename formats", () => {
  const date = new Date(2026, 7, 12, 9, 5, 7);
  assert.equal(formatStickyDate(date), "2026-08-12 09:05");
  assert.equal(formatStickyDate(date, "date"), "20260812");
  assert.equal(formatStickyDate(date, "file"), "20260812-090507");
});
