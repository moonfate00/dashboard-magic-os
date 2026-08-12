"use strict";

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

module.exports = { renderEmptyState, createTranslatedButton };

