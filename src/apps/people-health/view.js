"use strict";

const { ItemView } = require("obsidian");
const { renderEmptyState, createTranslatedButton, renderCabinContextBar } = require("../../ui/shared-shell");
const { loadVaultRecords } = require("../../storage/record-source");
const { buildPeopleHealthModel } = require("./model");

const PEOPLE_HEALTH_VIEW_TYPE = "dashboard-magic-os-people-health";

class PeopleHealthView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentPersonId = "";
    this.model = null;
  }

  getViewType() {
    return PEOPLE_HEALTH_VIEW_TYPE;
  }

  getDisplayText() {
    return this.plugin.t("app.health.name");
  }

  getIcon() {
    return "heart-pulse";
  }

  async onOpen() {
    await this.refresh();
  }

  async refresh() {
    const root = this.plugin.storageProfile().paths.social;
    const roots = this.plugin.recordRootsFor(["social"], [root]);
    const records = await loadVaultRecords(this.plugin.recordCapabilities, {
      roots,
      mounts: this.plugin.folderMounts()
    });
    this.model = buildPeopleHealthModel(records, { cabinRuntime: this.plugin.services?.cabinRuntime });
    this.render();
  }

  render() {
    const container = this.containerEl?.children?.[1] || this.containerEl;
    if (!container) return;
    container.empty();
    container.addClass?.("mos-health-view");
    const person = this.currentPersonId ? this.model?.byId?.get(this.currentPersonId) : null;
    if (person) this.renderPerson(container, person);
    else this.renderDirectory(container);
  }

  renderDirectory(container) {
    const header = container.createDiv({ cls: "mos-health-header" });
    const copy = header.createDiv({ cls: "mos-health-heading" });
    copy.createEl("h2", { text: this.plugin.t("health.title") });
    copy.createEl("p", { text: this.plugin.t("health.description") });
    createTranslatedButton(header, this.plugin.i18n, "common.refresh", () => this.refresh(), { cls: "mod-cta" });
    container.createDiv({ cls: "mos-health-privacy-note", text: this.plugin.t("health.privacyNotice") });
    renderCabinContextBar(container, this.plugin.i18n, this.model?.shell);

    const totals = this.model?.totals || { people: 0, healthRecords: 0, linkedRecords: 0, unassignedRecords: 0 };
    const stats = container.createDiv({ cls: "mos-health-stats" });
    [
      ["health.stats.people", totals.people],
      ["health.stats.records", totals.healthRecords],
      ["health.stats.linked", totals.linkedRecords],
      ["health.stats.unassigned", totals.unassignedRecords]
    ].forEach(([key, value]) => {
      const item = stats.createDiv();
      item.createEl("strong", { text: String(value) });
      item.createEl("span", { text: this.plugin.t(key) });
    });

    if (!this.model?.people?.length) {
      renderEmptyState(container, this.plugin.i18n, {
        titleKey: "health.empty.title",
        descriptionKey: "health.empty.description"
      });
      return;
    }
    const grid = container.createDiv({ cls: "mos-health-people-grid" });
    this.model.people.forEach((person) => this.renderPersonCard(grid, person));
    if (totals.unassignedRecords) {
      const warning = container.createDiv({ cls: "mos-health-unassigned" });
      warning.createEl("strong", { text: this.plugin.t("health.unassigned.title") });
      warning.createEl("span", { text: this.plugin.t("health.unassigned.description", { count: totals.unassignedRecords }) });
    }
  }

  renderPersonCard(container, person) {
    const card = container.createEl("button", {
      cls: "mos-health-person-card",
      attr: { type: "button", "aria-label": this.plugin.t("health.openPerson", { name: person.name }) }
    });
    const avatar = card.createDiv({ cls: "mos-health-avatar" });
    avatar.createEl("span", { text: (person.name || this.plugin.t("common.untitled")).slice(0, 2).toUpperCase() });
    const body = card.createDiv({ cls: "mos-health-person-body" });
    body.createEl("strong", { text: person.name || this.plugin.t("common.untitled") });
    if (person.relationScope) body.createEl("small", { text: this.plugin.t("health.relationship", { scope: person.relationScope }) });
    body.createEl("span", { text: this.plugin.t("health.recordCount", { count: person.healthCount }) });
    body.createEl("em", { text: person.latestDate
      ? this.plugin.t("health.latestRecord", { date: person.latestDate })
      : this.plugin.t("health.noRecords") });
    card.addEventListener("click", () => {
      this.currentPersonId = person.id;
      this.render();
    });
  }

  renderPerson(container, person) {
    const header = container.createDiv({ cls: "mos-health-header" });
    createTranslatedButton(header, this.plugin.i18n, "common.back", () => {
      this.currentPersonId = "";
      this.render();
    });
    const copy = header.createDiv({ cls: "mos-health-heading" });
    copy.createEl("h2", { text: person.name || this.plugin.t("common.untitled") });
    copy.createEl("p", { text: this.plugin.t("health.personSummary", { count: person.healthCount }) });
    createTranslatedButton(header, this.plugin.i18n, "health.openPersonNote", () => this.openFile(person.file));
    renderCabinContextBar(container, this.plugin.i18n, this.model?.shell);
    container.createDiv({ cls: "mos-health-privacy-note", text: this.plugin.t("health.timelinePrivacyNotice") });

    if (!person.healthRecords.length) {
      renderEmptyState(container, this.plugin.i18n, {
        titleKey: "health.timeline.empty.title",
        descriptionKey: "health.timeline.empty.description"
      });
      return;
    }
    const timeline = container.createDiv({ cls: "mos-health-timeline" });
    person.healthRecords.forEach((record) => {
      const item = timeline.createEl("button", {
        cls: "mos-health-record",
        attr: { type: "button", "aria-label": this.plugin.t("health.openRecord", { title: record.title }) }
      });
      const marker = item.createDiv({ cls: "mos-health-record-marker" });
      marker.createEl("span", { text: this.plugin.t(`health.type.${record.type}`) });
      const body = item.createDiv({ cls: "mos-health-record-body" });
      body.createEl("time", { text: record.date || this.plugin.t("health.dateUnknown") });
      body.createEl("strong", { text: record.title || this.plugin.t("health.recordFallback") });
      body.createEl("small", { text: this.plugin.t("health.openForDetails") });
      item.addEventListener("click", () => this.openFile(record.file));
    });
  }

  async openFile(file) {
    if (!file) return;
    await this.app?.workspace?.getLeaf?.(true)?.openFile?.(file);
  }
}

module.exports = { PEOPLE_HEALTH_VIEW_TYPE, PeopleHealthView };
