"use strict";

const { Modal } = require("obsidian");

class PersonalizationImportModal extends Modal {
  constructor(app, plugin, prepared) {
    super(app);
    this.plugin = plugin;
    this.prepared = prepared;
    this.applying = false;
  }

  onOpen() {
    this.render();
  }

  render() {
    const { contentEl } = this;
    const t = (key, params) => this.plugin.t(key, params);
    contentEl.empty();
    contentEl.createEl("h2", { text: t("settings.personalization.importTitle") });
    contentEl.createEl("p", { text: t("settings.personalization.importSafety") });

    const changes = this.prepared.preview.changes;
    if (!changes.length) {
      contentEl.createDiv({ cls: "mos-personalization-empty", text: t("settings.personalization.noChanges") });
    } else {
      const list = contentEl.createDiv({ cls: "mos-personalization-changes" });
      changes.forEach((change) => {
        const row = list.createDiv({ cls: "mos-personalization-change" });
        row.createEl("strong", { text: t(`settings.personalization.field.${change.key}`) });
        row.createEl("span", {
          text: t("settings.personalization.change", {
            before: this.valueLabel(change.key, change.before),
            after: this.valueLabel(change.key, change.after)
          })
        });
      });
    }

    const actions = contentEl.createDiv({ cls: "mos-personalization-actions" });
    const cancel = actions.createEl("button", { text: t("common.cancel"), attr: { type: "button" } });
    cancel.disabled = this.applying;
    cancel.addEventListener("click", () => {
      if (this.applying) return;
      this.plugin.cancelPersonalizationImport(this.prepared.confirmation);
      this.close();
    });
    const confirm = actions.createEl("button", {
      cls: "mod-cta",
      text: this.applying ? t("settings.personalization.importing") : t("settings.personalization.confirmImport"),
      attr: { type: "button" }
    });
    confirm.disabled = this.applying;
    confirm.addEventListener("click", async () => {
      if (this.applying) return;
      this.applying = true;
      this.render();
      try {
        await this.plugin.applyPersonalizationImport(this.prepared.confirmation);
        this.close();
      } catch (error) {
        this.applying = false;
        this.render();
        this.plugin.showFailure(error);
      }
    });
  }

  valueLabel(key, value) {
    if (key === "interfaceLanguage") return this.plugin.t(`language.${value}`);
    if (key === "storagePreference") {
      return value === "auto"
        ? this.plugin.t("settings.personalization.storage.auto")
        : this.plugin.t(`storage.profile.${value}.name`);
    }
    return String(value || "");
  }
}

module.exports = { PersonalizationImportModal };
