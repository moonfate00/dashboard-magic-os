"use strict";

const { ItemView } = require("obsidian");
const { renderEmptyState, createTranslatedButton, renderCabinContextBar } = require("../../ui/shared-shell");
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
    this.threadMode = "cards";
    this.graphBranchId = "";
    this.graphCardId = "";
    this.graphTopic = "";
    this.graphViewMode = "cards";
    this.graphTransform = { x: 0, y: 0, scale: 1 };
    this.graphCameraTransition = null;
    this.graphCameraTimer = 0;
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
      cabinRuntime: this.plugin.services?.cabinRuntime,
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
    renderCabinContextBar(container, this.plugin.i18n, this.model?.shell);
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
      attr: { type: "button", "aria-label": this.plugin.t("learning.openThread", { title: thread.title }), style: thread.branchColor ? `--learning-branch-color:${thread.branchColor}` : "" }
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
      this.threadMode = "cards";
      this.graphBranchId = "";
      this.graphCardId = "";
      this.graphTopic = "";
      this.graphViewMode = "cards";
      this.graphTransform = { x: 0, y: 0, scale: 1 };
      this.render();
    });
  }

  learningContentThread(thread) {
    if (!thread) return null;
    if (thread.isBranch) return thread;
    if (thread.contentId) return this.model?.byId?.get(thread.contentId) || null;
    if (!thread.branchSections?.length) return null;
    return {
      ...thread,
      cards: thread.aggregateCards || [],
      members: thread.aggregateMembers || [],
      progress: thread.aggregateProgress || 0,
      cardCount: thread.aggregateCardCount || 0,
      dueCount: thread.aggregateDueCount || 0,
      newCount: thread.aggregateNewCount || 0,
      masteredCount: thread.aggregateMasteredCount || 0,
      memberCount: thread.aggregateMemberCount || 0,
      aggregate: true
    };
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
    renderCabinContextBar(container, this.plugin.i18n, this.model?.shell);
    if (!thread.isBranch && thread.branchSections?.length) {
      createTranslatedButton(header, this.plugin.i18n, this.threadMode === "graph" ? "learning.mode.cards" : "learning.mode.graph", () => {
        this.threadMode = this.threadMode === "graph" ? "cards" : "graph";
        if (this.threadMode === "graph") {
          this.graphViewMode = "cards";
          this.graphBranchId = "";
          this.graphCardId = "";
          this.graphTopic = "";
          this.queueGraphCamera("reveal", { x: 500, y: 350 });
        }
        this.render();
      }, { cls: this.threadMode === "graph" ? "mod-cta" : "" });
    }

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

    if (!thread.isBranch && this.threadMode === "graph") {
      this.renderKnowledgeGraph(container, thread);
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
      if (!thread.isBranch && thread.branchSections?.length > 1) this.renderCardSections(cards, thread);
      else {
        const list = cards.createDiv({ cls: "mos-learning-card-list" });
        contentThread.cards.forEach((card) => this.renderKnowledgeCard(list, card, thread.branchColor));
      }
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

  createGraphSvgNode(tag, attributes, parent) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attributes || {}).forEach(([key, value]) => node.setAttribute(key, String(value)));
    parent?.appendChild(node);
    return node;
  }

  stepBackGraph() {
    if (this.graphCardId) {
      this.graphCardId = "";
      this.queueGraphCamera("pull", { x: 735, y: 280 });
    } else if (this.graphTopic) {
      this.graphTopic = "";
      this.queueGraphCamera("pull", { x: 700, y: 315 });
    } else if (this.graphBranchId) {
      this.graphViewMode = "cards";
      this.graphBranchId = "";
      this.queueGraphCamera("pull", { x: 500, y: 350 });
    }
    else return;
    this.graphTransform = { x: 0, y: 0, scale: 1 };
    this.render();
  }

  graphBranchCameraPoint(thread, branchId) {
    const branches = thread?.branchSections || [];
    const index = branches.findIndex((section) => section.id === branchId);
    if (index < 0) return { x: 500, y: 350 };
    const angle = -Math.PI / 2 + Math.PI * 2 * index / Math.max(1, branches.length);
    return { x: 500 + Math.cos(angle) * 214, y: 350 + Math.sin(angle) * 214 };
  }

  queueGraphCamera(kind, point = { x: 500, y: 350 }) {
    this.graphCameraTransition = { kind, x: point.x, y: point.y };
  }

  playGraphCamera(stage, layer) {
    const transition = this.graphCameraTransition;
    if (!transition || !stage || !layer) return;
    this.graphCameraTransition = null;
    stage.addClass?.("is-camera-transition");
    stage.addClass?.(`is-camera-${transition.kind}`);
    stage.style.setProperty("--camera-x", `${transition.x / 10}%`);
    stage.style.setProperty("--camera-y", `${transition.y / 7}%`);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => stage.addClass?.("is-camera-settled")));
    window.clearTimeout(this.graphCameraTimer);
    this.graphCameraTimer = window.setTimeout(() => {
      stage.removeClass?.("is-camera-transition");
      stage.removeClass?.("is-camera-settled");
      ["reveal", "push", "pull", "shift", "detail"].forEach((kind) => stage.removeClass?.(`is-camera-${kind}`));
    }, 860);
  }

  renderKnowledgeGraph(container, thread) {
    const shell = container.createDiv({ cls: "mos-learning-knowledge-graph" });
    const tools = shell.createDiv({ cls: "mos-learning-graph-tools" });
    const search = tools.createEl("input", { attr: { type: "search", placeholder: this.plugin.t("learning.graph.search"), autocomplete: "off" } });
    const results = tools.createDiv({ cls: "mos-learning-graph-results" });
    search.addEventListener("input", () => {
      const query = String(search.value || "").trim().toLocaleLowerCase();
      results.empty();
      tools.toggleClass?.("has-results", Boolean(query));
      if (!query) return;
      const matches = thread.branchSections.flatMap((section) => section.cards
        .filter((card) => [card.title, card.topic, card.knowledgePath].join(" ").toLocaleLowerCase().includes(query))
        .map((card) => ({ section, card }))).slice(0, 24);
      if (!matches.length) results.createDiv({ text: this.plugin.t("learning.graph.noResults") });
      matches.forEach(({ section, card }) => {
        const button = results.createEl("button", { attr: { type: "button" } });
        button.createEl("small", { text: section.title });
        button.createEl("strong", { text: card.title });
        button.addEventListener("click", () => {
          this.graphViewMode = "structure";
          this.graphBranchId = section.id;
          this.graphCardId = card.id;
          this.graphTopic = card.topic || this.plugin.t("learning.topicFallback");
          this.graphTransform = { x: 0, y: 0, scale: 1 };
          this.queueGraphCamera("detail", this.graphBranchCameraPoint(thread, section.id));
          this.render();
        });
      });
    });
    const zoom = tools.createDiv({ cls: "mos-learning-graph-zoom" });
    [["＋", 1.08], ["－", 1 / 1.08]].forEach(([label, factor]) => zoom.createEl("button", { text: label, attr: { type: "button" } })
      .addEventListener("click", () => {
        this.setGraphScale(this.graphTransform.scale * factor);
      }));
    this.graphZoomLabel = zoom.createEl("span", { cls: "mos-learning-graph-zoom-label", text: this.plugin.t("learning.graph.zoomDefault") });
    this.graphZoomSlider = zoom.createEl("input", { cls: "mos-learning-graph-zoom-slider", attr: { type: "range", min: "55", max: "230", step: "5", value: "100", "aria-label": this.plugin.t("learning.graph.zoomAria") } });
    this.graphZoomSlider.addEventListener("input", () => this.setGraphScale(Number(this.graphZoomSlider.value) / 100));
    zoom.createEl("button", { text: this.plugin.t("learning.graph.center"), attr: { type: "button" } })
      .addEventListener("click", () => {
        this.graphTransform = { x: 0, y: 0, scale: 1 };
        this.applyGraphTransform();
      });
    const backButton = zoom.createEl("button", {
      text: this.plugin.t(this.graphCardId ? "learning.graph.backTopic" : this.graphTopic ? "learning.graph.backBranch" : this.graphBranchId ? "learning.graph.backOverview" : "common.back"),
      attr: { type: "button" }
    });
    backButton.disabled = !this.graphBranchId;
    backButton.addEventListener("click", () => this.stepBackGraph());
    const cardOverviewButton = zoom.createEl("button", { text: this.plugin.t("learning.graph.cardOverview"), attr: { type: "button", title: this.plugin.t("learning.graph.cardOverviewHint") } });
    cardOverviewButton.toggleClass?.("is-active", this.graphViewMode === "cards");
    cardOverviewButton.addEventListener("click", () => {
      this.graphViewMode = "cards";
      this.graphBranchId = "";
      this.graphCardId = "";
      this.graphTopic = "";
      this.graphTransform = { x: 0, y: 0, scale: 1 };
      this.queueGraphCamera("pull", { x: 500, y: 350 });
      this.render();
    });

    const body = shell.createDiv({ cls: "mos-learning-graph-layout" });
    const contextBar = body.createDiv({ cls: "mos-learning-graph-contextbar" });
    const stage = body.createDiv({ cls: "mos-learning-graph-stage" });
    stage.createDiv({ cls: "mos-learning-graph-hint", text: this.plugin.t("learning.graph.cameraHint") });
    const svg = this.createGraphSvgNode("svg", { viewBox: "0 0 1000 700", role: "img", "aria-label": this.plugin.t("learning.graph.aria") }, stage);
    const graphViewport = this.createGraphSvgNode("g", { class: "mos-learning-graph-viewport" }, svg);
    const viewport = this.createGraphSvgNode("g", { class: "mos-learning-graph-camera-layer" }, graphViewport);
    this.graphViewport = graphViewport;
    const aside = body.createDiv({ cls: "mos-learning-graph-inspector" });
    const branches = thread.branchSections;
    const focused = Boolean(this.graphBranchId) && branches.some((section) => section.id === this.graphBranchId);
    const selectedSection = branches.find((section) => section.id === this.graphBranchId);
    this.renderGraphContextBar(contextBar, thread, selectedSection);
    if (this.graphViewMode === "cards") {
      stage.toggleClass?.("is-card-overview", true);
      this.renderCardOverviewGraph(viewport, aside, thread);
      this.applyGraphTransform();
      this.playGraphCamera(stage, viewport);
      this.bindGraphViewportInteractions(svg);
      return;
    }
    stage.toggleClass?.("is-focus-layout", focused);
    stage.toggleClass?.("has-topic-focus", Boolean(this.graphTopic));
    shell.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || (!this.graphBranchId && !this.graphTopic && !this.graphCardId)) return;
      event.preventDefault();
      event.stopPropagation();
      this.stepBackGraph();
    }, true);
    const center = focused ? { x: -340, y: 350 } : { x: 500, y: 350 };
    const rootEdge = focused ? { x: 200, y: 350 } : center;
    const branchPositions = new Map();
    const edges = this.createGraphSvgNode("g", { class: "mos-learning-graph-edges" }, viewport);
    const nodes = this.createGraphSvgNode("g", { class: "mos-learning-graph-nodes" }, viewport);
    const inactiveBranches = branches.filter((section) => section.id !== this.graphBranchId);
    if (focused) {
      [565, 655, 730].forEach((radius, index) => this.createGraphSvgNode("circle", {
        cx: center.x,
        cy: center.y,
        r: radius,
        class: `mos-learning-focus-orbit is-orbit-${index + 1}`
      }, edges));
    }
    const focusSlots = [
      { angle: -30 * Math.PI / 180, radius: 565 },
      { angle: -17 * Math.PI / 180, radius: 625 },
      { angle: 17 * Math.PI / 180, radius: 625 },
      { angle: 30 * Math.PI / 180, radius: 565 },
      { angle: 7 * Math.PI / 180, radius: 610 }
    ];
    branches.forEach((section, index) => {
      const selected = section.id === this.graphBranchId;
      const inactiveIndex = inactiveBranches.indexOf(section);
      const slot = focusSlots[Math.max(0, inactiveIndex) % focusSlots.length];
      const angle = focused ? (selected ? 0 : slot.angle) : -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, branches.length);
      const radius = focused ? (selected ? 730 : slot.radius) : 225;
      const point = focused && selected
        ? { x: 390, y: 350, angle: 0 }
        : { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius, angle };
      const lineStart = focused
        ? { x: center.x + Math.cos(angle) * 540, y: center.y + Math.sin(angle) * 540 }
        : rootEdge;
      branchPositions.set(section.id, point);
      this.createGraphSvgNode("line", {
        x1: lineStart.x,
        y1: lineStart.y,
        x2: point.x,
        y2: point.y,
        class: focused && !selected ? "is-muted" : selected ? "is-selected" : ""
      }, edges);
    });
    const root = this.createGraphSvgNode("g", { class: `mos-learning-graph-node is-root${focused ? " is-planet-closeup" : ""}` }, nodes);
    if (focused) this.createGraphSvgNode("circle", { cx: center.x, cy: center.y, r: 558, class: "is-planet-atmosphere" }, root);
    this.createGraphSvgNode("circle", { cx: center.x, cy: center.y, r: focused ? 540 : 62, class: "is-planet-body" }, root);
    const rootLabelPoint = focused ? { x: 72, y: 350 } : center;
    const rootTitle = this.createGraphSvgNode("text", { x: rootLabelPoint.x, y: rootLabelPoint.y - 2, "text-anchor": "middle" }, root);
    rootTitle.textContent = thread.title;
    const rootMeta = this.createGraphSvgNode("text", { x: rootLabelPoint.x, y: rootLabelPoint.y + 20, "text-anchor": "middle", class: "is-meta" }, root);
    rootMeta.textContent = `P1 · ${thread.aggregateCardCount || 0}`;
    root.addEventListener("click", () => {
      this.graphViewMode = "cards";
      this.graphBranchId = "";
      this.graphCardId = "";
      this.graphTopic = "";
      this.graphTransform = { x: 0, y: 0, scale: 1 };
      this.queueGraphCamera("pull", { x: 500, y: 350 });
      this.render();
    });
    branches.forEach((section) => {
      const point = branchPositions.get(section.id);
      const selected = section.id === this.graphBranchId;
      const group = this.createGraphSvgNode("g", { class: `mos-learning-graph-node is-branch${selected ? " is-selected" : ""}${this.graphBranchId && !selected ? " is-muted" : ""}`, style: `--learning-branch-color:${section.color}` }, nodes);
      this.createGraphSvgNode("circle", { cx: point.x, cy: point.y, r: focused && !selected ? 34 : selected ? 54 : 48 }, group);
      const title = this.createGraphSvgNode("text", { x: point.x, y: point.y - 2, "text-anchor": "middle" }, group);
      title.textContent = section.title.length > 11 ? `${section.title.slice(0, 10)}…` : section.title;
      const meta = this.createGraphSvgNode("text", { x: point.x, y: point.y + 19, "text-anchor": "middle", class: "is-meta" }, group);
      meta.textContent = `P2 · ${section.cardCount}`;
      group.addEventListener("click", () => {
        this.graphViewMode = selected ? "cards" : "structure";
        this.graphBranchId = selected ? "" : section.id;
        this.graphCardId = "";
        this.graphTopic = "";
        this.graphTransform = { x: 0, y: 0, scale: 1 };
        this.queueGraphCamera(selected ? "pull" : "shift", this.graphBranchCameraPoint(thread, section.id));
        this.render();
      });
    });

    const cardPositions = new Map();
    if (selectedSection) {
      const topicGroups = Array.from(selectedSection.cards.reduce((groups, card) => {
        const topic = card.topic || this.plugin.t("learning.topicFallback");
        if (!groups.has(topic)) groups.set(topic, []);
        groups.get(topic).push(card);
        return groups;
      }, new Map()).entries())
        .map(([topic, cards]) => ({ topic, cards }))
        .sort((a, b) => b.cards.length - a.cards.length || a.topic.localeCompare(b.topic));
      const cardEdges = this.createGraphSvgNode("g", { class: "mos-learning-graph-card-edges" }, viewport);
      const clusterNodes = this.createGraphSvgNode("g", { class: "mos-learning-graph-topic-clusters" }, viewport);
      const skillPaths = this.createGraphSvgNode("g", { class: "mos-learning-graph-skill-paths" }, viewport);
      const cardNodes = this.createGraphSvgNode("g", { class: "mos-learning-graph-card-nodes" }, viewport);
      viewport.insertBefore(cardEdges, nodes);
      viewport.insertBefore(clusterNodes, nodes);
      viewport.insertBefore(skillPaths, nodes);
      const branchPoint = branchPositions.get(selectedSection.id);
      const cardLayouts = new Map();
      const focusedTopicGroup = this.graphTopic ? topicGroups.find((item) => item.topic === this.graphTopic) : null;
      const createCluster = (topicGroup, { x, y, width, height, compact = false, spotlight = false, delay = 0 }) => {
        const active = spotlight || this.graphTopic === topicGroup.topic;
        const cluster = this.createGraphSvgNode("g", {
          class: `mos-learning-graph-topic-cluster${active ? " is-active" : ""}${compact ? " is-topic-nav" : ""}${spotlight ? " is-spotlight" : ""}${topicGroup.cards.length === 1 ? " is-single" : ""}`,
          tabindex: "0",
          role: "button",
          "aria-label": this.plugin.t("learning.graph.topicAria", { topic: topicGroup.topic, count: topicGroup.cards.length }),
          style: `--learning-branch-color:${selectedSection.color};--cluster-delay:${Math.min(360, delay)}ms`
        }, clusterNodes);
        this.createGraphSvgNode("rect", { x, y, width, height, rx: compact ? 9 : 12, class: "is-cluster-shell" }, cluster);
        this.createGraphSvgNode("circle", { cx: x + 13, cy: y + 16, r: 3.5, class: "is-cluster-mark" }, cluster);
        const label = this.createGraphSvgNode("text", { x: x + 22, y: y + 20, class: "is-cluster-title" }, cluster);
        const compactTitle = topicGroup.topic.length > 7 ? `${topicGroup.topic.slice(0, 7)}…` : topicGroup.topic;
        label.textContent = `${compact ? compactTitle : topicGroup.topic} · ${topicGroup.cards.length}`;
        const tooltip = this.createGraphSvgNode("title", {}, cluster);
        tooltip.textContent = this.plugin.t("learning.graph.topicTooltip", { topic: topicGroup.topic, count: topicGroup.cards.length });
        const toggleTopic = (event) => {
          event?.stopPropagation?.();
          this.graphTopic = active ? "" : topicGroup.topic;
          this.graphCardId = "";
          this.queueGraphCamera(this.graphTopic ? "push" : "pull", { x: 720, y: 285 });
          this.render();
        };
        cluster.addEventListener("click", toggleTopic);
        cluster.addEventListener("keydown", (event) => {
          if (!["Enter", " "].includes(event.key)) return;
          event.preventDefault();
          toggleTopic(event);
        });
        return cluster;
      };

      if (focusedTopicGroup) {
        const x = 530;
        const y = 62;
        const panelWidth = 414;
        const panelHeight = 54 + focusedTopicGroup.cards.length * 42;
        const spotlight = createCluster(focusedTopicGroup, { x, y, width: panelWidth, height: panelHeight, spotlight: true });
        const badge = this.createGraphSvgNode("text", { x: x + panelWidth - 16, y: y + 20, "text-anchor": "end", class: "is-skill-branch-label" }, spotlight);
        badge.textContent = this.plugin.t("learning.graph.skillBranch").toLocaleUpperCase();
        const clusterMidY = y + panelHeight / 2;
        this.createGraphSvgNode("path", {
          d: `M ${branchPoint.x + 48} ${branchPoint.y} C ${branchPoint.x + 88} ${branchPoint.y}, ${x - 48} ${clusterMidY}, ${x} ${clusterMidY}`,
          class: "is-topic-bundle is-active-topic",
          style: `--learning-branch-color:${selectedSection.color}`
        }, cardEdges);
        const skillPoints = [];
        focusedTopicGroup.cards.forEach((card, cardIndex) => {
          const laneShift = cardIndex % 2 ? 16 : 0;
          const nodeX = x + 44 + laneShift;
          const cardX = x + 68 + laneShift;
          const cardWidth = panelWidth - 84 - laneShift;
          const point = { x: cardX + cardWidth / 2, y: y + 56 + cardIndex * 42 + 16 };
          cardPositions.set(card.id, point);
          skillPoints.push({ x: nodeX, y: point.y });
          const fullTitle = String(card.title || this.plugin.t("common.untitled"));
          cardLayouts.set(card.id, {
            point, nodeX, cardWidth, cardHeight: 32, fullTitle,
            visibleTitle: fullTitle.length > 22 ? `${fullTitle.slice(0, 21)}…` : fullTitle,
            topicGroupIndex: 0, cardIndex, order: cardIndex + 1, large: true
          });
        });
        if (skillPoints.length > 1) this.createGraphSvgNode("path", {
          d: skillPoints.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" "),
          class: "is-skill-energy-path",
          style: `--learning-branch-color:${selectedSection.color}`
        }, skillPaths);
        const navigationGroups = topicGroups.filter((item) => item.topic !== focusedTopicGroup.topic);
        const navStartY = Math.max(350, y + panelHeight + 34);
        navigationGroups.forEach((topicGroup, index) => {
          const navX = 530 + (index % 3) * 142;
          const navY = navStartY + Math.floor(index / 3) * 40;
          createCluster(topicGroup, { x: navX, y: navY, width: 126, height: 30, compact: true, delay: 80 + index * 18 });
          this.createGraphSvgNode("path", {
            d: `M ${branchPoint.x + 48} ${branchPoint.y} C ${branchPoint.x + 92} ${branchPoint.y}, ${navX - 34} ${navY + 15}, ${navX} ${navY + 15}`,
            class: "is-topic-bundle is-navigation-bundle"
          }, cardEdges);
        });
      } else {
        const columns = topicGroups.length <= 5 ? 1 : 2;
        const panelWidth = columns === 1 ? 280 : 196;
        const panelX = columns === 1 ? [610] : [535, 748];
        const columnHeights = Array(columns).fill(28);
        topicGroups.forEach((topicGroup, groupIndex) => {
          const column = columnHeights.indexOf(Math.min(...columnHeights));
          const x = panelX[column];
          const y = columnHeights[column];
          const panelHeight = 30 + topicGroup.cards.length * 21;
          columnHeights[column] += panelHeight + 10;
          createCluster(topicGroup, { x, y, width: panelWidth, height: panelHeight, delay: groupIndex * 28 });
          const clusterMidY = y + panelHeight / 2;
          this.createGraphSvgNode("path", {
            d: `M ${branchPoint.x + 48} ${branchPoint.y} C ${branchPoint.x + 88} ${branchPoint.y}, ${x - 48} ${clusterMidY}, ${x} ${clusterMidY}`,
            class: "is-topic-bundle"
          }, cardEdges);
          topicGroup.cards.forEach((card, cardIndex) => {
            const point = { x: x + panelWidth / 2, y: y + 29 + cardIndex * 21 + 9 };
            cardPositions.set(card.id, point);
            const fullTitle = String(card.title || this.plugin.t("common.untitled"));
            cardLayouts.set(card.id, {
              point, cardWidth: panelWidth - 16, cardHeight: 17, fullTitle,
              visibleTitle: fullTitle.length > 18 ? `${fullTitle.slice(0, 17)}…` : fullTitle,
              topicGroupIndex: groupIndex, cardIndex, large: false
            });
          });
        });
      }
      const selectedCard = selectedSection.cards.find((card) => card.id === this.graphCardId);
      if (selectedCard) {
        const from = cardPositions.get(selectedCard.id);
        const targets = new Set(selectedCard.relationTargets.map((target) => target.replace(/\.md$/i, "").toLocaleLowerCase()));
        selectedSection.cards.forEach((card) => {
          const pathKey = card.record.path.replace(/\.md$/i, "").toLocaleLowerCase();
          if (!targets.has(pathKey)) return;
          const to = cardPositions.get(card.id);
          this.createGraphSvgNode("line", { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: "is-relation" }, cardEdges);
        });
      }
      selectedSection.cards.forEach((card) => {
        const layout = cardLayouts.get(card.id);
        if (!layout) return;
        const { point, nodeX, cardWidth, cardHeight, fullTitle, visibleTitle, topicGroupIndex, cardIndex, order, large } = layout;
        const selected = card.id === this.graphCardId;
        const topic = card.topic || this.plugin.t("learning.topicFallback");
        const cardX = point.x - cardWidth / 2;
        const cardY = point.y - cardHeight / 2;
        const group = this.createGraphSvgNode("g", {
          class: `mos-learning-graph-node is-card${selected ? " is-selected" : ""}${card.mastered ? " is-mastered" : ""}${card.isNew ? " is-new" : ""}${card.isDue ? " is-due" : ""}${large ? " is-topic-focus-card" : ""}`,
          tabindex: "0",
          role: "button",
          "aria-label": fullTitle,
          style: `--learning-branch-color:${selectedSection.color};--card-delay:${Math.min(460, topicGroupIndex * 28 + cardIndex * 18)}ms`
        }, cardNodes);
        this.createGraphSvgNode("rect", { x: cardX, y: cardY, width: cardWidth, height: cardHeight, rx: large ? 8 : 5, class: "is-card-surface" }, group);
        if (card.progress > 0) this.createGraphSvgNode("rect", { x: cardX, y: cardY + cardHeight - 2, width: Math.max(3, cardWidth * card.progress / 100), height: 2, rx: 1, class: "is-card-progress" }, group);
        const markX = large ? nodeX : cardX + 10;
        this.createGraphSvgNode("circle", { cx: markX, cy: point.y, r: large ? (selected ? 10 : 8) : (selected ? 3.8 : 3), class: "is-card-mark" }, group);
        if (large) {
          const orderLabel = this.createGraphSvgNode("text", { x: markX, y: point.y + 3, "text-anchor": "middle", class: "is-skill-order" }, group);
          orderLabel.textContent = String(order);
        }
        const cardLabel = this.createGraphSvgNode("text", { x: cardX + (large ? 14 : 19), y: point.y + (large ? 4 : 3), class: "is-card-title" }, group);
        cardLabel.textContent = visibleTitle;
        if (large) {
          const stateLabel = this.createGraphSvgNode("text", { x: cardX + cardWidth - 12, y: point.y + 4, "text-anchor": "end", class: "is-card-state" }, group);
          stateLabel.textContent = card.mastered ? this.plugin.t("learning.graph.stateMax") : card.isNew ? this.plugin.t("learning.graph.stateNew") : `${card.progress}%`;
        }
        const tooltip = this.createGraphSvgNode("title", {}, group);
        tooltip.textContent = `${card.topic} · ${fullTitle}`;
        group.addEventListener("click", (event) => {
          event.stopPropagation();
          this.graphCardId = selected ? "" : card.id;
          if (!selected) this.graphTopic = topic;
          this.queueGraphCamera(selected ? "pull" : "detail", { x: 740, y: point.y });
          this.render();
        });
        group.addEventListener("keydown", (event) => {
          if (!["Enter", " "].includes(event.key)) return;
          event.preventDefault();
          this.graphCardId = selected ? "" : card.id;
          if (!selected) this.graphTopic = topic;
          this.queueGraphCamera(selected ? "pull" : "detail", { x: 740, y: point.y });
          this.render();
        });
        group.addEventListener("dblclick", () => this.openRecord(card.record));
      });
    }
    this.renderGraphInspector(aside, thread, selectedSection);
    this.applyGraphTransform();
    this.playGraphCamera(stage, viewport);

    this.bindGraphViewportInteractions(svg);
  }

  bindGraphViewportInteractions(svg) {
    svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      const delta = Math.max(-120, Math.min(120, Number(event.deltaY) || 0));
      this.setGraphScale(this.graphTransform.scale * Math.exp(-delta * .0018));
    }, { passive: false });
    svg.addEventListener("pointerdown", (event) => {
      if (event.target.closest?.(".mos-learning-graph-node, .mos-learning-graph-topic-cluster")) return;
      this.graphDrag = { x: event.clientX, y: event.clientY, originX: this.graphTransform.x, originY: this.graphTransform.y };
      svg.setPointerCapture?.(event.pointerId);
    });
    svg.addEventListener("pointermove", (event) => {
      if (!this.graphDrag) return;
      this.graphTransform.x = this.graphDrag.originX + event.clientX - this.graphDrag.x;
      this.graphTransform.y = this.graphDrag.originY + event.clientY - this.graphDrag.y;
      this.applyGraphTransform();
    });
    const stop = () => { this.graphDrag = null; };
    svg.addEventListener("pointerup", stop);
    svg.addEventListener("pointercancel", stop);
  }

  applyGraphTransform() {
    this.graphViewport?.setAttribute?.("transform", `translate(${this.graphTransform.x} ${this.graphTransform.y}) scale(${this.graphTransform.scale})`);
    const percent = Math.round(this.graphTransform.scale * 100);
    if (this.graphZoomLabel) this.graphZoomLabel.setText(`${percent}%`);
    if (this.graphZoomSlider && document.activeElement !== this.graphZoomSlider) this.graphZoomSlider.value = String(Math.round(percent / 5) * 5);
  }

  setGraphScale(value) {
    this.graphTransform.scale = Math.max(.55, Math.min(2.3, Number(value) || 1));
    this.applyGraphTransform();
  }

  renderCardOverviewGraph(viewport, aside, thread) {
    const center = { x: 500, y: 350 };
    const orbitLayer = this.createGraphSvgNode("g", { class: "mos-learning-overview-orbits" }, viewport);
    const structureLayer = this.createGraphSvgNode("g", { class: "mos-learning-overview-structure" }, viewport);
    const relationLayer = this.createGraphSvgNode("g", { class: "mos-learning-overview-relations" }, viewport);
    const nodeLayer = this.createGraphSvgNode("g", { class: "mos-learning-overview-nodes" }, viewport);
    const labelLayer = this.createGraphSvgNode("g", { class: "mos-learning-overview-labels" }, viewport);
    const positions = new Map();
    const owners = new Map();
    const relationNodes = [];
    const allCards = thread.branchSections.flatMap((section) => section.cards);
    const pathIndex = new Map(allCards.map((card) => [card.record.path.replace(/\.md$/i, "").toLocaleLowerCase(), card]));
    const polarPoint = (radius, angle) => ({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
    const arcPath = (radius, startAngle, endAngle) => {
      const start = polarPoint(radius, startAngle);
      const end = polarPoint(radius, endAngle);
      return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${endAngle - startAngle > Math.PI ? 1 : 0} 1 ${end.x} ${end.y}`;
    };
    this.createGraphSvgNode("circle", { cx: center.x, cy: center.y, r: 264, class: "is-overview-p3-field" }, orbitLayer);
    [82, 118, 198, 242, 286, 330].forEach((radius, ringIndex) => {
      this.createGraphSvgNode("circle", { cx: center.x, cy: center.y, r: radius, class: `is-overview-orbit is-ring-${ringIndex + 1}` }, orbitLayer);
    });
    const root = this.createGraphSvgNode("g", { class: "mos-learning-graph-node is-root is-overview-root" }, nodeLayer);
    this.createGraphSvgNode("circle", { cx: center.x, cy: center.y, r: 48 }, root);
    const rootTitle = this.createGraphSvgNode("text", { x: center.x, y: center.y - 1, "text-anchor": "middle", class: "is-overview-root-title" }, labelLayer);
    rootTitle.textContent = thread.title;
    const rootMeta = this.createGraphSvgNode("text", { x: center.x, y: center.y + 17, "text-anchor": "middle", class: "is-overview-root-meta" }, labelLayer);
    rootMeta.textContent = this.plugin.t("learning.graph.p3Count", { count: allCards.length });

    const branchCount = Math.max(1, thread.branchSections.length);
    thread.branchSections.forEach((section, branchIndex) => {
      const angle = -Math.PI / 2 + Math.PI * 2 * branchIndex / branchCount;
      const hub = polarPoint(118, angle);
      const spread = Math.min(.78, Math.PI * 2 / branchCount * .74);
      const outerRadius = 198 + Math.max(0, Math.ceil(section.cards.length / 10) - 1) * 44;
      this.createGraphSvgNode("path", {
        d: arcPath(Math.min(330, outerRadius + 15), angle - spread * .56, angle + spread * .56),
        class: "is-overview-sector-arc",
        style: `--learning-branch-color:${section.color}`
      }, orbitLayer);
      const railStart = polarPoint(144, angle);
      const railEnd = polarPoint(Math.min(181, outerRadius - 12), angle);
      this.createGraphSvgNode("path", {
        d: `M ${railStart.x} ${railStart.y} L ${railEnd.x} ${railEnd.y}`,
        class: "is-overview-branch-rail",
        style: `--learning-branch-color:${section.color}`
      }, structureLayer);
      this.createGraphSvgNode("line", { x1: center.x, y1: center.y, x2: hub.x, y2: hub.y, class: "is-overview-trunk", style: `--learning-branch-color:${section.color}` }, structureLayer);
      const branchNode = this.createGraphSvgNode("g", { class: "mos-learning-graph-node is-overview-branch", role: "button", tabindex: "0", "aria-label": `${section.title} · ${section.cards.length}`, style: `--learning-branch-color:${section.color}` }, nodeLayer);
      this.createGraphSvgNode("circle", { cx: hub.x, cy: hub.y, r: 25 }, branchNode);
      const branchLabel = this.createGraphSvgNode("text", { x: hub.x, y: hub.y - 1, "text-anchor": "middle", class: "is-overview-branch-title", style: `--learning-branch-color:${section.color}` }, labelLayer);
      branchLabel.textContent = section.title.length > 7 ? `${section.title.slice(0, 6)}…` : section.title;
      const meta = this.createGraphSvgNode("text", { x: hub.x, y: hub.y + 12, "text-anchor": "middle", class: "is-overview-branch-meta", style: `--learning-branch-color:${section.color}` }, labelLayer);
      meta.textContent = String(section.cards.length);
      branchNode.addEventListener("click", () => {
        this.graphViewMode = "structure";
        this.graphBranchId = section.id;
        this.graphCardId = "";
        this.graphTopic = "";
        this.graphTransform = { x: 0, y: 0, scale: 1 };
        this.queueGraphCamera("push", { x: hub.x, y: hub.y });
        this.render();
      });
      section.cards.forEach((card, cardIndex) => {
        const ring = Math.floor(cardIndex / 10);
        const ringStart = ring * 10;
        const ringCount = Math.min(10, section.cards.length - ringStart);
        const indexInRing = cardIndex - ringStart;
        const offset = ringCount <= 1 ? 0 : (indexInRing / (ringCount - 1) - .5) * spread;
        const radius = 198 + ring * 44;
        const cardAngle = angle + offset;
        const point = polarPoint(radius, cardAngle);
        positions.set(card.id, { ...point, radius, angle: cardAngle });
        owners.set(card.id, section);
        const control = polarPoint(150 + ring * 15, angle + offset * .32);
        this.createGraphSvgNode("path", {
          d: `M ${hub.x} ${hub.y} Q ${control.x} ${control.y} ${point.x} ${point.y}`,
          class: "is-overview-ownership",
          style: `--learning-branch-color:${section.color}`
        }, structureLayer);
      });
    });

    const relationKeys = new Set();
    allCards.forEach((card) => {
      const from = positions.get(card.id);
      if (!from) return;
      card.relationTargets.forEach((targetPath) => {
        const target = pathIndex.get(targetPath.replace(/\.md$/i, "").toLocaleLowerCase());
        const to = target ? positions.get(target.id) : null;
        if (!target || !to) return;
        const key = [card.id, target.id].sort().join("::");
        if (relationKeys.has(key)) return;
        relationKeys.add(key);
        let angleDelta = to.angle - from.angle;
        while (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
        while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
        const controlAngle = from.angle + angleDelta / 2;
        const controlRadius = Math.max(142, Math.min(from.radius, to.radius) - 66);
        const control = polarPoint(controlRadius, controlAngle);
        const relationNode = this.createGraphSvgNode("path", {
          d: `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`,
          class: "is-overview-relation",
          style: `--signal-color:${owners.get(card.id)?.color || "var(--color-cyan)"}`
        }, relationLayer);
        relationNodes.push({ node: relationNode, from: card.id, to: target.id });
      });
    });

    allCards.forEach((card) => {
      const point = positions.get(card.id);
      const section = owners.get(card.id);
      if (!point || !section) return;
      const landmark = card.mastered || card.isDue || card.progress >= 70;
      const group = this.createGraphSvgNode("g", {
        class: `mos-learning-graph-node is-overview-card${card.mastered ? " is-mastered" : ""}${card.isNew ? " is-new" : ""}${card.isDue ? " is-due" : ""}${landmark ? " is-landmark" : ""}`,
        tabindex: "0",
        role: "button",
        "aria-label": card.title,
        style: `--learning-branch-color:${section.color}`
      }, nodeLayer);
      if (landmark) this.createGraphSvgNode("circle", { cx: point.x, cy: point.y, r: 11, class: "is-overview-card-halo" }, group);
      this.createGraphSvgNode("circle", { cx: point.x, cy: point.y, r: landmark ? 6.4 : card.progress > 0 ? 5.2 : 4.2, class: "is-overview-card-mark" }, group);
      if (card.progress > 0) this.createGraphSvgNode("circle", { cx: point.x, cy: point.y, r: 7, class: "is-overview-progress", "stroke-dasharray": `${Math.max(1, card.progress * .44)} 44` }, group);
      const hoverLabel = this.createGraphSvgNode("text", {
        x: point.x + (point.x >= center.x ? 12 : -12),
        y: point.y - 9,
        class: "is-overview-card-label",
        "text-anchor": point.x >= center.x ? "start" : "end",
        style: `--learning-branch-color:${section.color}`
      }, labelLayer);
      hoverLabel.textContent = card.title.length > 16 ? `${card.title.slice(0, 15)}…` : card.title;
      const tooltip = this.createGraphSvgNode("title", {}, group);
      tooltip.textContent = `${section.title} · ${card.topic || this.plugin.t("learning.topicFallback")} · ${card.title}`;
      const focusRelations = (active) => {
        hoverLabel.classList.toggle("is-visible", active);
        relationNodes.forEach((relation) => {
          const connected = relation.from === card.id || relation.to === card.id;
          relation.node.classList.toggle("is-signal", active && connected);
          relation.node.classList.toggle("is-muted", active && !connected);
        });
      };
      group.addEventListener("pointerenter", () => focusRelations(true));
      group.addEventListener("pointerleave", () => focusRelations(false));
      group.addEventListener("focus", () => focusRelations(true));
      group.addEventListener("blur", () => focusRelations(false));
      const open = () => {
        this.graphViewMode = "structure";
        this.graphBranchId = section.id;
        this.graphCardId = card.id;
        this.graphTopic = card.topic || this.plugin.t("learning.topicFallback");
        this.graphTransform = { x: 0, y: 0, scale: 1 };
        this.queueGraphCamera("detail", { x: point.x, y: point.y });
        this.render();
      };
      group.addEventListener("click", open);
      group.addEventListener("keydown", (event) => {
        if (!["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        open();
      });
    });

    const guide = aside.createDiv({ cls: "mos-learning-graph-selection-empty is-orbit-guide" });
    guide.createEl("small", { text: this.plugin.t("learning.graph.p3DeckEyebrow") });
    guide.createEl("strong", { text: this.plugin.t("learning.graph.chooseBranch") });
    guide.createEl("span", { text: this.plugin.t("learning.graph.chooseBranchHint") });
  }

  renderGraphInspector(container, thread, section) {
    if (!section) {
      container.createEl("small", { text: this.plugin.t("learning.levelPath") });
      container.createEl("h3", { text: thread.title });
      container.createEl("p", { text: this.plugin.t("learning.graph.overview") });
      thread.branchSections.forEach((item) => {
        const button = container.createEl("button", { cls: "mos-learning-graph-branch-button", attr: { type: "button", style: `--learning-branch-color:${item.color}` } });
        button.createEl("strong", { text: item.title });
        const topicCount = new Set(item.cards.map((card) => card.topic || this.plugin.t("learning.topicFallback"))).size;
        button.createEl("span", { text: this.plugin.t("learning.graph.branchSummary", { cards: item.cardCount, topics: topicCount }) });
        button.addEventListener("click", () => {
          this.graphBranchId = item.id;
          this.graphCardId = "";
          this.graphTopic = "";
          this.graphTransform = { x: 0, y: 0, scale: 1 };
          this.render();
        });
      });
      return;
    }
    const card = section.cards.find((item) => item.id === this.graphCardId);
    if (!card) {
      const cards = section.cards.filter((item) => !this.graphTopic || (item.topic || this.plugin.t("learning.topicFallback")) === this.graphTopic);
      const head = container.createDiv({ cls: "mos-learning-graph-p3-head" });
      head.createEl("small", { text: this.plugin.t("learning.graph.p3DeckEyebrow") });
      head.createEl("strong", { text: this.graphTopic || section.title });
      head.createEl("span", { text: this.plugin.t("learning.graph.p3DeckCount", { count: cards.length }) });
      const list = container.createDiv({ cls: "mos-learning-graph-p3-list" });
      cards.forEach((item) => {
        const button = list.createEl("button", { attr: { type: "button", style: `--learning-branch-color:${section.color}` } });
        button.createEl("small", { text: item.topic || this.plugin.t("learning.topicFallback") });
        button.createEl("strong", { text: item.title });
        button.createEl("em", { text: this.plugin.t("learning.progress", { progress: item.progress }) });
        button.addEventListener("click", () => {
          this.graphCardId = item.id;
          this.graphTopic = item.topic || this.plugin.t("learning.topicFallback");
          this.queueGraphCamera("detail", { x: 740, y: 300 });
          this.render();
        });
      });
      return;
    }
    const detail = container.createDiv({ cls: "mos-learning-graph-card-detail", attr: { style: `--learning-branch-color:${section.color}` } });
    detail.createEl("small", { text: this.plugin.t("learning.graph.cardEyebrow", { topic: card.topic || this.plugin.t("learning.topicFallback") }) });
    detail.createEl("h4", { text: card.title });
    if (card.prompt && card.prompt !== card.title) {
      const prompt = detail.createDiv({ cls: "mos-learning-graph-card-copy" });
      prompt.createEl("strong", { text: this.plugin.t("learning.graph.promptLabel") });
      prompt.createEl("p", { text: card.prompt });
    }
    const answer = detail.createDiv({ cls: "mos-learning-graph-card-copy is-answer" });
    answer.createEl("strong", { text: this.plugin.t("learning.graph.answerLabel") });
    answer.createEl("p", { text: card.answer || card.prompt || this.plugin.t("learning.graph.answerEmpty") });
    detail.createEl("button", { cls: "mod-cta", text: this.plugin.t("learning.graph.openCard"), attr: { type: "button" } })
      .addEventListener("click", () => this.openRecord(card.record));
  }

  renderGraphContextBar(container, thread, section) {
    const summary = container.createDiv({ cls: "mos-learning-graph-context-summary" });
    if (!section || this.graphViewMode === "cards") {
      const relationCount = thread.branchSections.reduce((count, item) => count + item.cards.reduce((sum, card) => sum + (card.relationTargets?.length || 0), 0), 0);
      const cardCount = thread.aggregateCardCount || thread.branchSections.reduce((count, item) => count + item.cards.length, 0);
      summary.createEl("small", { text: this.plugin.t("learning.graph.orbitEyebrow") });
      summary.createEl("strong", { text: thread.title });
      summary.createEl("span", { text: this.plugin.t("learning.graph.orbitContext", { branches: thread.branchSections.length, cards: cardCount, relations: relationCount }) });
      const branches = container.createDiv({ cls: "mos-learning-graph-context-topics is-branches" });
      thread.branchSections.forEach((item) => {
        const button = branches.createEl("button", { attr: { type: "button", style: `--learning-branch-color:${item.color}` } });
        button.createEl("i");
        button.createEl("strong", { text: item.title });
        button.createEl("span", { text: String(item.cardCount) });
        button.addEventListener("click", () => {
          this.graphViewMode = "structure";
          this.graphBranchId = item.id;
          this.graphCardId = "";
          this.graphTopic = "";
          this.graphTransform = { x: 0, y: 0, scale: 1 };
          this.queueGraphCamera("push", this.graphBranchCameraPoint(thread, item.id));
          this.render();
        });
      });
      return;
    }
    summary.createEl("small", { text: this.plugin.t("learning.branchOrdinal", { order: String(section.order).padStart(2, "0") }) });
    summary.createEl("strong", { text: section.title });
    summary.createEl("span", { text: this.plugin.t("learning.graph.branchContext", { count: section.cardCount, topic: this.graphTopic || this.plugin.t("learning.graph.allTopics") }) });
    const counts = new Map();
    section.cards.forEach((card) => {
      const topic = card.topic || this.plugin.t("learning.topicFallback");
      counts.set(topic, (counts.get(topic) || 0) + 1);
    });
    const topics = container.createDiv({ cls: "mos-learning-graph-context-topics" });
    Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).forEach(([topic, count]) => {
      const active = this.graphTopic === topic;
      const button = topics.createEl("button", { cls: active ? "is-active" : "", text: this.plugin.t("learning.graph.topicChip", { topic, count }), attr: { type: "button", "aria-pressed": String(active) } });
      button.addEventListener("click", () => {
        this.graphTopic = active ? "" : topic;
        this.graphCardId = "";
        this.queueGraphCamera(this.graphTopic ? "push" : "pull", { x: 720, y: 285 });
        this.render();
      });
    });
  }

  renderCardSections(container, thread) {
    const sections = container.createDiv({ cls: "mos-learning-card-sections" });
    thread.branchSections.forEach((section) => {
      if (!section.cards.length) return;
      const details = sections.createEl("details", { cls: "mos-learning-card-section", attr: { open: "", style: `--learning-branch-color:${section.color}` } });
      const summary = details.createEl("summary");
      const copy = summary.createDiv();
      copy.createEl("small", { text: this.plugin.t("learning.branchOrdinal", { order: String(section.order).padStart(2, "0") }) });
      copy.createEl("strong", { text: section.title });
      copy.createEl("span", { text: this.plugin.t("learning.sectionSummary", { cards: section.cardCount, mastered: section.masteredCount }) });
      summary.createEl("em", { text: this.plugin.t("learning.progress", { progress: section.progress }) });
      const list = details.createDiv({ cls: "mos-learning-card-list" });
      section.cards.forEach((card) => this.renderKnowledgeCard(list, card, section.color));
    });
  }

  renderKnowledgeCard(container, card, branchColor = "") {
    const button = container.createEl("button", {
      cls: `mos-learning-card${card.isDue ? " is-due" : ""}${card.mastered ? " is-mastered" : ""}`,
      attr: { type: "button", "aria-label": this.plugin.t("learning.openCard", { title: card.title }), style: branchColor ? `--learning-branch-color:${branchColor}` : "" }
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
