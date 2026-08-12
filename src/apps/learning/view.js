"use strict";

const { ItemView } = require("obsidian");
const { renderEmptyState, createTranslatedButton } = require("../../ui/shared-shell");
const { loadVaultRecords } = require("../../storage/record-source");
const { recordFrontmatter, recordModule, recordType } = require("../../services/record-query");
const { buildLearningModel } = require("./model");

const LEARNING_VIEW_TYPE = "dashboard-magic-os-learning";

class LearningView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentThreadId = "";
    this.model = null;
  }

  getViewType() {
    return LEARNING_VIEW_TYPE;
  }

  getDisplayText() {
    return this.plugin.t("app.learning.name");
  }

  getIcon() {
    return "route";
  }

  async onOpen() {
    await this.refresh();
  }

  async refresh() {
    const paths = this.plugin.storageProfile().paths;
    const roots = [paths.command, paths.assets, paths.social, paths.navigation, paths.memory];
    const records = await loadVaultRecords(this.plugin.recordCapabilities, { roots });
    this.model = buildLearningModel(records, {
      resolvedLinks: this.app?.metadataCache?.resolvedLinks || {}
    });
    this.render();
  }

  render() {
    const container = this.containerEl?.children?.[1] || this.containerEl;
    if (!container) return;
    container.empty();
    container.addClass?.("mos-learning-view");
    const thread = this.currentThreadId ? this.model?.byId?.get(this.currentThreadId) : null;
    if (thread) this.renderThread(container, thread);
    else this.renderOverview(container);
  }

  renderOverview(container) {
    const header = container.createDiv({ cls: "mos-learning-header" });
    const copy = header.createDiv({ cls: "mos-learning-heading" });
    copy.createEl("h2", { text: this.plugin.t("learning.title") });
    copy.createEl("p", { text: this.plugin.t("learning.description") });
    createTranslatedButton(header, this.plugin.i18n, "common.refresh", () => this.refresh(), { cls: "mod-cta" });
    const totals = this.model?.totals || { threads: 0, cards: 0, due: 0, mastered: 0 };
    const stats = container.createDiv({ cls: "mos-learning-stats" });
    [
      ["learning.stats.threads", totals.threads],
      ["learning.stats.cards", totals.cards],
      ["learning.stats.due", totals.due],
      ["learning.stats.mastered", totals.mastered]
    ].forEach(([key, value]) => {
      const card = stats.createDiv();
      card.createEl("strong", { text: String(value) });
      card.createEl("span", { text: this.plugin.t(key) });
    });
    if (!this.model?.threads?.length) {
      renderEmptyState(container, this.plugin.i18n, {
        titleKey: "learning.empty.title",
        descriptionKey: "learning.empty.description"
      });
      return;
    }
    const grid = container.createDiv({ cls: "mos-learning-thread-grid" });
    this.model.threads.forEach((thread) => this.renderThreadCard(grid, thread));
  }

  renderThreadCard(container, thread) {
    const card = container.createEl("button", {
      cls: "mos-learning-thread-card",
      attr: { type: "button", "aria-label": this.plugin.t("learning.openThread", { title: thread.title }) }
    });
    const top = card.createDiv({ cls: "mos-learning-thread-top" });
    top.createEl("span", { text: this.plugin.t(`learning.status.${thread.status}`) });
    top.createEl("strong", { text: this.plugin.t("learning.progress", { progress: thread.progress }) });
    card.createEl("h3", { text: thread.title || this.plugin.t("common.untitled") });
    if (thread.summary) card.createEl("p", { text: thread.summary.slice(0, 180) });
    const counts = card.createDiv({ cls: "mos-learning-thread-counts" });
    counts.createEl("span", { text: this.plugin.t("learning.cardCount", { count: thread.cardCount }) });
    counts.createEl("span", { text: this.plugin.t("learning.memberCount", { count: thread.memberCount }) });
    if (thread.dueCount) counts.createEl("em", { text: this.plugin.t("learning.dueCount", { count: thread.dueCount }) });
    const track = card.createDiv({ cls: "mos-learning-progress-track" });
    track.createDiv({ attr: { style: `width:${thread.progress}%` } });
    card.addEventListener("click", () => {
      this.currentThreadId = thread.id;
      this.render();
    });
  }

  renderThread(container, thread) {
    const header = container.createDiv({ cls: "mos-learning-header" });
    createTranslatedButton(header, this.plugin.i18n, "common.back", () => {
      this.currentThreadId = "";
      this.render();
    });
    const copy = header.createDiv({ cls: "mos-learning-heading" });
    copy.createEl("h2", { text: thread.title || this.plugin.t("common.untitled") });
    copy.createEl("p", { text: thread.summary || this.plugin.t("learning.threadFallback") });
    createTranslatedButton(header, this.plugin.i18n, "learning.openSource", () => this.openRecord(thread.record));

    const summary = container.createDiv({ cls: "mos-learning-thread-summary" });
    [
      ["learning.cardCount", thread.cardCount],
      ["learning.dueCount", thread.dueCount],
      ["learning.newCount", thread.newCount],
      ["learning.masteredCount", thread.masteredCount],
      ["learning.memberCount", thread.memberCount]
    ].forEach(([key, count]) => {
      const item = summary.createDiv();
      item.createEl("strong", { text: String(count) });
      item.createEl("span", { text: this.plugin.t(key, { count }) });
    });

    const layout = container.createDiv({ cls: "mos-learning-detail-layout" });
    const cards = layout.createDiv({ cls: "mos-learning-panel" });
    cards.createEl("h3", { text: this.plugin.t("learning.cards.title") });
    if (!thread.cards.length) {
      renderEmptyState(cards, this.plugin.i18n, {
        titleKey: "learning.cards.empty.title",
        descriptionKey: "learning.cards.empty.description"
      });
    } else {
      const list = cards.createDiv({ cls: "mos-learning-card-list" });
      thread.cards.forEach((card) => this.renderKnowledgeCard(list, card));
    }

    const sources = layout.createDiv({ cls: "mos-learning-panel" });
    sources.createEl("h3", { text: this.plugin.t("learning.sources.title") });
    if (!thread.members.length) {
      renderEmptyState(sources, this.plugin.i18n, {
        titleKey: "learning.sources.empty.title",
        descriptionKey: "learning.sources.empty.description"
      });
    } else {
      const list = sources.createDiv({ cls: "mos-learning-source-list" });
      thread.members.forEach((member) => this.renderSourceRecord(list, member));
    }
  }

  renderKnowledgeCard(container, card) {
    const button = container.createEl("button", {
      cls: `mos-learning-card${card.isDue ? " is-due" : ""}${card.mastered ? " is-mastered" : ""}`,
      attr: { type: "button", "aria-label": this.plugin.t("learning.openCard", { title: card.title }) }
    });
    const top = button.createDiv({ cls: "mos-learning-card-top" });
    top.createEl("span", { text: card.topic || this.plugin.t("learning.topicFallback") });
    top.createEl("strong", { text: this.plugin.t("learning.progress", { progress: card.progress }) });
    button.createEl("h4", { text: card.title || this.plugin.t("common.untitled") });
    if (card.prompt) button.createEl("p", { text: card.prompt.slice(0, 160) });
    const meta = button.createDiv({ cls: "mos-learning-card-meta" });
    meta.createEl("span", { text: this.plugin.t("learning.reviewCount", { count: card.reviewCount }) });
    if (card.isDue) meta.createEl("em", { text: this.plugin.t("learning.cardDue", { date: card.due }) });
    else if (card.mastered) meta.createEl("em", { text: this.plugin.t("learning.cardMastered") });
    else if (card.isNew) meta.createEl("em", { text: this.plugin.t("learning.cardNew") });
    const track = button.createDiv({ cls: "mos-learning-progress-track" });
    track.createDiv({ attr: { style: `width:${card.progress}%` } });
    button.addEventListener("click", () => this.openRecord(card.record));
  }

  renderSourceRecord(container, record) {
    const frontmatter = recordFrontmatter(record);
    const title = String(frontmatter.title || record?.title || record?.name || "");
    const button = container.createEl("button", {
      cls: "mos-learning-source",
      attr: { type: "button", "aria-label": this.plugin.t("learning.openSourceRecord", { title }) }
    });
    button.createEl("small", { text: this.plugin.t("learning.sourceType", {
      module: recordModule(record) || "global",
      type: recordType(record) || "record"
    }) });
    button.createEl("strong", { text: title || this.plugin.t("common.untitled") });
    button.addEventListener("click", () => this.openRecord(record));
  }

  async openRecord(record) {
    if (!record?.file) return;
    await this.app?.workspace?.getLeaf?.(true)?.openFile?.(record.file);
  }
}

module.exports = { LEARNING_VIEW_TYPE, LearningView };
