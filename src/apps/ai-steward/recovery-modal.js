"use strict";

const { Modal } = require("obsidian");

class AIRecoveryModal extends Modal {
  constructor(app, plugin, prepared) {
    super(app);
    this.plugin = plugin;
    this.prepared = prepared;
    this.report = prepared.report;
    this.applying = false;
  }

  onOpen() {
    this.render();
  }

  onClose() {
    if (this.applying) return;
    try { this.plugin.cancelAIRecovery(this.prepared.confirmation); } catch (error) {}
  }

  render() {
    const { contentEl } = this;
    const t = (key, params) => this.plugin.t(key, params);
    contentEl.empty();
    contentEl.createEl("h2", { text: t("ai.recovery.confirmTitle") });
    contentEl.createEl("p", { text: t("ai.recovery.confirmSafety") });
    contentEl.createEl("p", {
      text: t("ai.recovery.confirmCount", { count: this.report.operations.length })
    });
    const list = contentEl.createDiv({ cls: "mos-ai-recovery-confirm-list" });
    this.report.operations.forEach((operation) => {
      const row = list.createDiv();
      row.createEl("strong", { text: operation.path });
      row.createEl("span", { text: t(`ai.recovery.observed.${operation.observed}`) });
    });
    const actions = contentEl.createDiv({ cls: "mos-ai-recovery-actions" });
    const cancel = actions.createEl("button", { text: t("common.cancel"), attr: { type: "button" } });
    cancel.disabled = this.applying;
    cancel.addEventListener("click", () => {
      if (this.applying) return;
      this.plugin.cancelAIRecovery(this.prepared.confirmation);
      this.close();
    });
    const confirm = actions.createEl("button", {
      cls: "mod-warning",
      text: this.applying ? t("ai.recovery.applying") : t(`ai.recovery.action.${this.report.action}`),
      attr: { type: "button" }
    });
    confirm.disabled = this.applying;
    confirm.addEventListener("click", async () => {
      if (this.applying) return;
      this.applying = true;
      this.render();
      try {
        await this.plugin.applyAIRecovery(this.prepared.confirmation);
        this.close();
      } catch (error) {
        this.applying = false;
        this.render();
        this.plugin.showFailure(error);
      }
    });
  }
}

module.exports = { AIRecoveryModal };
