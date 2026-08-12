"use strict";

function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function escapeYaml(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function yamlArray(values) {
  if (!Array.isArray(values) || !values.length) return "[]";
  return `[${values.map((value) => `"${escapeYaml(value)}"`).join(", ")}]`;
}

function yamlValue(value) {
  if (Array.isArray(value)) return yamlArray(value);
  if (value === true || value === false) return String(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `"${escapeYaml(value)}"`;
}

function formatStickyDate(date, mode) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  if (mode === "file") return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
  if (mode === "date") return `${yyyy}${mm}${dd}`;
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

module.exports = {
  asList,
  escapeYaml,
  formatStickyDate,
  yamlArray,
  yamlValue
};
