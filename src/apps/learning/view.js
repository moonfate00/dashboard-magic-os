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
    const defaults = [paths.command, paths.assets, paths.social, paths.navigation, paths.memory];
    const roots = this.plugin.recordRootsFor([], defaults);
    const records = await loadVaultRecords(this.plugin.recordCapabilities, {
      roots,
      mounts: this.plugin.folderMounts()
    });
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
    const totals = this.model?.totals || { threads: 0, branches: 0, cards: 0, due: 0, mastered: 0 };
    const stats = container.createDiv({ cls: "mos-learning-stats" });
    [
      ["learning.stats.threads", totals.threads],
      ["learning.stats.branches", totals.branches],
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
    const contentThread = this.learningContentThread(thread);
    const card = container.createEl("button", {
      cls: "mos-learning-thread-card",
      attr: { type: "button", "aria-label": this.plugin.t("learning.openThread", { title: thread.title }) }
    });
    const top = card.createDiv({ cls: "mos-learning-thread-top" });
    top.createEl("span", { text: this.plugin.t(`learning.status.${thread.status}`) });
    top.createEl("strong", { text: this.plugin.t("learning.progress", { progress: contentThread?.progress || 0 }) });
    card.createEl("h3", { text: thread.title || this.plugin.t("common.untitled") });
    if (thread.summary) card.createEl("p", { text: thread.summary.slice(0, 180) });
    const counts = card.createDiv({ cls: "mos-learning-thread-counts" });
    if (contentThread) counts.createEl("span", { text: this.plugin.t("learning.cardCount", { count: contentThread.cardCount }) });
    if (contentThread) counts.createEl("span", { text: this.plugin.t("learning.memberCount", { count: contentThread.memberCount }) });
    if (thread.branches?.length) counts.createEl("span", { text: this.plugin.t("learning.branchCount", { count: thread.branches.length }) });
    if (contentThread?.dueCount) counts.createEl("em", { text: this.plugin.t("learning.dueCount", { count: contentThread.dueCount }) });
    const track = card.createDiv({ cls: "mos-learning-progress-track" });
    track.createDiv({ attr: { style: `width:${contentThread?.progress || 0}%` } });
    card.addEventListener("click", () => {
      this.currentThreadId = thread.id;
      this.render();
    });
  }

  learningContentThread(thread) {
    if (!thread) return null;
    if (thread.isBranch) return thread;
    return thread.contentId ? this.model?.byId?.get(thread.contentId) || null : null;
  }

  renderThread(container, thread) {
    const contentThread = this.learningContentThread(thread);
    const header = container.createDiv({ cls: "mos-learning-header" });
    createTranslatedButton(header, this.plugin.i18n, "common.back", () => {
      this.currentThreadId = thread.parentId || "";
      this.render();
    });
    const copy = header.createDiv({ cls: "mos-learning-heading" });
    copy.createEl("h2", { text: thread.title || this.plugin.t("common.untitled") });
    copy.createEl("p", { text: thread.summary || this.plugin.t("learning.threadFallback") });
    createTranslatedButton(header, this.plugin.i18n, "learning.openSource", () => this.openRecord(thread.record));

    if (thread.parentId) {
      const parent = this.model?.byId?.get(thread.parentId);
      if (parent) {
        const breadcrumb = container.createDiv({ cls: "mos-learning-breadcrumb" });
        breadcrumb.createEl("span", { text: this.plugin.t("learning.branchLevel") });
        const parentButton = breadcrumb.createEl("button", { text: parent.title, attr: { type: "button" } });
        parentButton.addEventListener("click", () => {
          this.currentThreadId = parent.id;
          this.render();
        });
      }
    }

    const summary = container.createDiv({ cls: "mos-learning-thread-summary" });
    const summaryItems = thread.isBranch
      ? []
      : [["learning.branchCount", thread.branches?.length || 0]];
    if (contentThread) summaryItems.push(
      ["learning.cardCount", contentThread.cardCount],
      ["learning.dueCount", contentThread.dueCount],
      ["learning.newCount", contentThread.newCount],
      ["learning.masteredCount", contentThread.masteredCount],
      ["learning.memberCount", contentThread.memberCount]
    );
    summaryItems.forEach(([key, count]) => {
      const item = summary.createDiv();
      item.createEl("strong", { text: String(count) });
      item.createEl("span", { text: this.plugin.t(key, { count }) });
    });

    if (!thread.isBranch) this.renderBranches(container, thread);

    if (!contentThread) {
      renderEmptyState(container, this.plugin.i18n, {
        titleKey: "learning.content.empty.title",
        descriptionKey: "learning.content.empty.description"
      });
      return;
    }

    const layout = container.createDiv({ cls: "mos-learning-detail-layout" });
    const cards = layout.createDiv({ cls: "mos-learning-panel" });
    cards.createEl("h3", { text: this.plugin.t("learning.cards.title") });
    if (!contentThread.cards.length) {
      renderEmptyState(cards, this.plugin.i18n, {
        titleKey: "learning.cards.empty.title",
        descriptionKey: "learning.cards.empty.description"
      });
    } else {
      const list = cards.createDiv({ cls: "mos-learning-card-list" });
      contentThread.cards.forEach((card) => this.renderKnowledgeCard(list, card));
    }

    const sources = layout.createDiv({ cls: "mos-learning-panel" });
    sources.createEl("h3", { text: this.plugin.t("learning.sources.title") });
    if (!contentThread.members.length) {
      renderEmptyState(sources, this.plugin.i18n, {
        titleKey: "learning.sources.empty.title",
        descriptionKey: "learning.sources.empty.description"
      });
    } else {
      const list = sources.createDiv({ cls: "mos-learning-source-list" });
      contentThread.members.forEach((member) => this.renderSourceRecord(list, member));
    }
  }

  renderBranches(container, thread) {
    const panel = container.createDiv({ cls: "mos-learning-panel mos-learning-branch-panel" });
    const heading = panel.createDiv({ cls: "mos-learning-panel-heading" });
    heading.createEl("h3", { text: this.plugin.t("learning.branches.title") });
    heading.createEl("span", { text: this.plugin.t("learning.branchCount", { count: thread.branches?.length || 0 }) });
    if (!thread.branches?.length) {
      renderEmptyState(panel, this.plugin.i18n, {
        titleKey: "learning.branches.empty.title",
        descriptionKey: "learning.branches.empty.description"
      });
      return;
    }
    const grid = panel.createDiv({ cls: "mos-learning-branch-grid" });
    thread.branches.forEach((branch) => this.renderThreadCard(grid, branch));
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
