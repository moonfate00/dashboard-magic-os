"use strict";

const { ItemView } = require("obsidian");
const { buildAIReadModel } = require("./model");

const AI_STEWARD_VIEW_TYPE = "dashboard-magic-os-ai-steward";

class AIStewardView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.model = buildAIReadModel();
  }

  getViewType() {
    return AI_STEWARD_VIEW_TYPE;
  }

  getDisplayText() {
    return this.plugin.t("app.ai.name");
  }

  getIcon() {
    return "sparkles";
  }

  async onOpen() {
    this.model = buildAIReadModel(this.plugin.aiStewardState?.() || {});
    this.render();
  }

  render() {
    const container = this.containerEl?.children?.[1] || this.containerEl;
    if (!container) return;
    container.empty();
    container.addClass?.("mos-ai-view");
    this.renderHeader(container);
    this.renderPrivacyBoundary(container);
    this.renderStatus(container);
    this.renderFeatures(container);
    this.renderProviders(container);
    this.renderJobs(container);
  }

  renderHeader(container) {
    const header = container.createDiv({ cls: "mos-ai-header" });
    const copy = header.createDiv({ cls: "mos-ai-heading" });
    copy.createEl("span", { cls: "mos-ai-eyebrow", text: this.plugin.t("ai.eyebrow") });
    copy.createEl("h2", { text: this.plugin.t("ai.title") });
    copy.createEl("p", { text: this.plugin.t("ai.description") });
    header.createEl("span", {
      cls: `mos-ai-state is-${this.model.status}`,
      text: this.plugin.t(`ai.status.${this.model.status}`)
    });
  }

  renderPrivacyBoundary(container) {
    const notice = container.createDiv({ cls: "mos-ai-privacy" });
    notice.createEl("strong", { text: this.plugin.t("ai.privacy.title") });
    notice.createEl("span", { text: this.plugin.t("ai.privacy.description") });
  }

  renderStatus(container) {
    const grid = container.createDiv({ cls: "mos-ai-stats" });
    const values = [
      ["ai.stats.entitlement", this.plugin.t(`ai.status.${this.model.status}`)],
      ["ai.stats.providers", String(this.model.totals.providersReady)],
      ["ai.stats.activeJobs", String(this.model.totals.activeJobs)],
      ["ai.stats.trial", this.model.trialRemaining === null ? this.plugin.t("ai.stats.notAvailable") : String(this.model.trialRemaining)]
    ];
    values.forEach(([key, value]) => {
      const item = grid.createDiv();
      item.createEl("strong", { text: value });
      item.createEl("span", { text: this.plugin.t(key) });
    });
  }

  renderFeatures(container) {
    const section = container.createDiv({ cls: "mos-ai-section" });
    section.createEl("h3", { text: this.plugin.t("ai.features.title") });
    section.createEl("p", { text: this.plugin.t(this.model.locked ? "ai.locked.description" : "ai.readOnly.description") });
    const grid = section.createDiv({ cls: "mos-ai-feature-grid" });
    this.model.features.forEach((feature) => {
      const card = grid.createEl("button", {
        cls: "mos-ai-feature",
        attr: {
          type: "button",
          disabled: "",
          "aria-disabled": "true",
          "aria-label": this.plugin.t("ai.feature.disabledLabel", { feature: this.plugin.t(`ai.feature.${feature.id}.name`) })
        }
      });
      card.createEl("strong", { text: this.plugin.t(`ai.feature.${feature.id}.name`) });
      card.createEl("span", { text: this.plugin.t(`ai.feature.${feature.id}.description`) });
      card.createEl("small", { text: this.plugin.t(feature.entitled ? "ai.feature.notConnected" : "ai.feature.locked") });
    });
  }

  renderProviders(container) {
    const section = container.createDiv({ cls: "mos-ai-section" });
    section.createEl("h3", { text: this.plugin.t("ai.providers.title") });
    section.createEl("p", { text: this.plugin.t("ai.providers.description") });
    const list = section.createDiv({ cls: "mos-ai-provider-list" });
    this.model.providers.forEach((provider) => {
      const item = list.createDiv({ cls: "mos-ai-provider" });
      item.createEl("strong", { text: this.plugin.t(`ai.provider.${provider.id}`) });
      item.createEl("span", { text: this.plugin.t(`ai.providerStatus.${provider.status}`) });
    });
  }

  renderJobs(container) {
    const section = container.createDiv({ cls: "mos-ai-section" });
    section.createEl("h3", { text: this.plugin.t("ai.jobs.title") });
    section.createEl("p", { text: this.plugin.t("ai.jobs.description") });
    if (!this.model.jobs.length) {
      section.createDiv({ cls: "mos-ai-jobs-empty", text: this.plugin.t("ai.jobs.empty") });
      return;
    }
    const list = section.createDiv({ cls: "mos-ai-job-list" });
    this.model.jobs.slice(0, 8).forEach((job) => {
      const item = list.createDiv({ cls: "mos-ai-job" });
      item.createEl("strong", { text: this.plugin.t(`ai.feature.${job.featureId}.name`) });
      item.createEl("span", { text: this.plugin.t(`ai.jobStatus.${job.status}`) });
      item.createEl("small", { text: this.plugin.t(`ai.provider.${job.providerId}`) });
    });
  }
}

module.exports = { AI_STEWARD_VIEW_TYPE, AIStewardView };
