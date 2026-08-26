"use strict";

const { ItemView } = require("obsidian");
const { renderEmptyState, createTranslatedButton } = require("../../ui/shared-shell");
const { loadVaultRecords } = require("../../storage/record-source");
const { buildOrganizerModel } = require("./model");

const ORGANIZER_VIEW_TYPE = "dashboard-magic-os-organizer";

class OrganizerView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentCollectionId = "";
    this.model = null;
  }

  getViewType() {
    return ORGANIZER_VIEW_TYPE;
  }

  getDisplayText() {
    return this.plugin.t("app.shelf.name");
  }

  getIcon() {
    return "layout-grid";
  }

  async onOpen() {
    await this.refresh();
  }

  async refresh() {
    const profile = this.plugin.storageProfile();
    const roots = this.plugin.recordRootsFor(["assets"], [profile.paths.assets]);
    const records = await loadVaultRecords(this.plugin.recordCapabilities, {
      roots,
      mounts: this.plugin.folderMounts()
    });
    this.model = buildOrganizerModel(records);
    this.render();
  }

  render() {
    const container = this.containerEl?.children?.[1] || this.containerEl;
    if (!container) return;
    container.empty();
    container.addClass?.("mos-organizer-view");
    const collection = this.currentCollectionId ? this.model?.byId?.get(this.currentCollectionId) : null;
    if (collection) this.renderCollection(container, collection);
    else this.renderOverview(container);
  }

  renderOverview(container) {
    const header = container.createDiv({ cls: "mos-organizer-header" });
    const copy = header.createDiv({ cls: "mos-organizer-heading" });
    copy.createEl("h2", { text: this.plugin.t("organizer.title") });
    copy.createEl("p", { text: this.plugin.t("organizer.description") });
    createTranslatedButton(header, this.plugin.i18n, "common.refresh", () => this.refresh(), { cls: "mod-cta" });
    const collections = this.model?.roots || [];
    if (!collections.length) {
      renderEmptyState(container, this.plugin.i18n, {
        titleKey: "organizer.empty.title",
        descriptionKey: "organizer.empty.description"
      });
      return;
    }
    const grid = container.createDiv({ cls: "mos-organizer-grid" });
    collections.forEach((collection) => this.renderCollectionCard(grid, collection));
  }

  renderCollectionCard(container, collection) {
    const card = container.createEl("button", {
      cls: "mos-organizer-collection",
      attr: { type: "button", "aria-label": this.plugin.t("organizer.openCollection", { title: collection.title }) }
    });
    const cover = card.createDiv({ cls: "mos-organizer-cover" });
    if (collection.coverMembers.length) {
      collection.coverMembers.forEach((member) => {
        const cell = cover.createDiv({ cls: "mos-organizer-cover-cell" });
        this.renderMemberMedia(cell, member);
      });
    } else {
      cover.createEl("span", { text: this.plugin.t("organizer.media.generic"), cls: "mos-organizer-cover-fallback" });
    }
    const body = card.createDiv({ cls: "mos-organizer-card-body" });
    body.createEl("strong", { text: collection.title || this.plugin.t("common.untitled") });
    body.createEl("span", { text: this.plugin.t("shelf.memberCount", { count: collection.resolvedCount }) });
    const detail = [];
    if (collection.childCount) detail.push(this.plugin.t("organizer.childCount", { count: collection.childCount }));
    if (collection.dynamicCount) detail.push(this.plugin.t("organizer.dynamicCount", { count: collection.dynamicCount }));
    if (collection.missingCount) detail.push(this.plugin.t("organizer.missingCount", { count: collection.missingCount }));
    if (detail.length) body.createEl("small", { text: detail.join(" · ") });
    card.addEventListener("click", () => {
      this.currentCollectionId = collection.id;
      this.render();
    });
  }

  renderCollection(container, collection) {
    const header = container.createDiv({ cls: "mos-organizer-header" });
    createTranslatedButton(header, this.plugin.i18n, "common.back", () => {
      this.currentCollectionId = "";
      this.render();
    });
    const copy = header.createDiv({ cls: "mos-organizer-heading" });
    copy.createEl("h2", { text: collection.title || this.plugin.t("common.untitled") });
    copy.createEl("p", { text: this.plugin.t("organizer.collectionSummary", {
      count: collection.resolvedCount,
      mode: this.plugin.t(`organizer.mode.${["query", "hybrid"].includes(collection.mode) ? collection.mode : "manual"}`)
    }) });
    if (!collection.members.length) {
      renderEmptyState(container, this.plugin.i18n, {
        titleKey: "organizer.collectionEmpty.title",
        descriptionKey: "organizer.collectionEmpty.description"
      });
      return;
    }
    const grid = container.createDiv({ cls: "mos-organizer-member-grid" });
    collection.members.forEach((member) => this.renderMemberCard(grid, member));
  }

  renderMemberCard(container, member) {
    const card = container.createEl("button", {
      cls: "mos-organizer-member",
      attr: { type: "button", "aria-label": this.plugin.t("organizer.openRecord", { title: member.title }) }
    });
    const media = card.createDiv({ cls: "mos-organizer-member-media" });
    this.renderMemberMedia(media, member);
    const body = card.createDiv({ cls: "mos-organizer-card-body" });
    body.createEl("small", { text: this.plugin.t("organizer.typeLabel", { type: member.type }) });
    body.createEl("strong", { text: member.title || this.plugin.t("common.untitled") });
    if (member.summary) body.createEl("p", { text: member.summary.slice(0, 180) });
    card.addEventListener("click", () => this.openRecord(member.record));
  }

  renderMemberMedia(container, member) {
    const preview = this.plugin.services.mediaPreview.selectMediaPreview(member.media, this.plugin.mediaCapabilities);
    if (preview?.kind === "image" && preview.src) {
      container.createEl("img", { attr: { src: preview.src, alt: member.title || "" } });
      return;
    }
    container.createEl("span", {
      text: this.plugin.t(member.type === "asset-pdf" ? "organizer.media.pdf" : "organizer.media.generic")
    });
  }

  async openRecord(record) {
    if (!record?.file) return;
    const leaf = this.app?.workspace?.getLeaf?.(true);
    await leaf?.openFile?.(record.file);
  }
}

module.exports = { ORGANIZER_VIEW_TYPE, OrganizerView };
