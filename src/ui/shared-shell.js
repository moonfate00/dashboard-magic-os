"use strict";

let setIcon;
try {
  ({ setIcon } = require("obsidian"));
} catch (_error) {
  setIcon = null;
}

const SHELL_COUNTERS = Object.freeze(["indexed", "formal", "visible", "inbox", "attention"]);

function normalizeShellQuery(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function shellRecordMatches(envelope, query) {
  if (!query) return true;
  const haystack = [envelope?.title, envelope?.type, envelope?.status, envelope?.path]
    .map((value) => String(value || "").toLocaleLowerCase());
  return haystack.some((value) => value.includes(query));
}

function cabinHealthFindings(snapshot, cabinId) {
  return (snapshot?.health?.findings || []).filter((item) => item.cabinId === cabinId);
}

function buildCabinShellModel(snapshot, cabinId, options = {}) {
  const id = String(cabinId || "").trim().toLowerCase();
  const cabin = snapshot?.cabins?.[id];
  if (!cabin) return null;
  const query = normalizeShellQuery(options.query);
  const records = Array.isArray(cabin.records) ? cabin.records : [];
  const filtered = records.filter((record) => shellRecordMatches(record, query));
  const requestedView = String(options.viewId || "").trim().toLowerCase();
  const view = cabin.manifest.views.find((item) => item.id === requestedView)
    || cabin.manifest.views.find((item) => item.primary)
    || cabin.manifest.views[0];
  const selectedEntityId = String(options.selectedEntityId || "").trim();
  return Object.freeze({
    cabinId: id,
    manifest: cabin.manifest,
    view,
    query,
    counts: cabin.counts,
    records: Object.freeze(filtered),
    totalRecords: records.length,
    health: Object.freeze(cabinHealthFindings(snapshot, id)),
    selectedEntityId,
    selected: selectedEntityId ? filtered.find((record) => record.entityId === selectedEntityId) || null : null
  });
}

function renderEmptyState(container, i18n, options = {}) {
  const shell = container.createDiv({ cls: "mos-empty-state" });
  shell.createEl("strong", { text: i18n.t(options.titleKey || "shell.empty.title", options.params) });
  shell.createEl("span", { text: i18n.t(options.descriptionKey || "shell.empty.description", options.params) });
  return shell;
}

function createTranslatedButton(container, i18n, key, onClick, options = {}) {
  const button = container.createEl("button", {
    cls: options.cls || "",
    text: i18n.t(key, options.params),
    attr: { type: "button", ...(options.attr || {}) }
  });
  if (typeof onClick === "function") button.addEventListener("click", onClick);
  return button;
}

function renderCabinContextBar(container, i18n, shell, options = {}) {
  if (!container || !shell) return null;
  const bar = container.createDiv({ cls: "mos-cabin-context-bar" });
  const identity = bar.createDiv({ cls: "mos-cabin-context-identity" });
  const icon = shell.manifest?.icon;
  if (icon) {
    const iconEl = identity.createEl("span", { cls: "mos-cabin-context-icon", attr: { "aria-hidden": "true" } });
    if (typeof setIcon === "function") setIcon(iconEl, icon);
  }
  identity.createEl("strong", { text: i18n.t(shell.manifest?.labelKey || `module.${shell.cabinId}`) });
  if (shell.view?.labelKey) identity.createEl("small", { text: i18n.t(shell.view.labelKey) });
  const counts = bar.createDiv({ cls: "mos-cabin-context-counts" });
  const labels = options.counterLabels || {};
  SHELL_COUNTERS.forEach((counter) => {
    const value = Number(shell.counts?.[counter] || 0);
    const item = counts.createDiv({ cls: `mos-cabin-context-count mos-cabin-context-count-${counter}` });
    item.createEl("strong", { text: String(value) });
    item.createEl("span", { text: i18n.t(labels[counter] || `cabin.stats.${counter}`) });
  });
  if (shell.health?.length) {
    const health = bar.createDiv({ cls: "mos-cabin-context-health" });
    health.createEl("span", { text: i18n.t("cabin.healthFindings", { count: shell.health.length }) });
  }
  return bar;
}

module.exports = {
  SHELL_COUNTERS,
  buildCabinShellModel,
  createTranslatedButton,
  renderCabinContextBar,
  normalizeShellQuery,
  renderEmptyState,
  shellRecordMatches
};
