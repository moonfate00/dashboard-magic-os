"use strict";

const { ItemView } = require("obsidian");
const {
  createTranslatedButton,
  renderCabinContextBar,
  renderEmptyState
} = require("../../ui/shared-shell");
const { loadVaultRecords } = require("../../storage/record-source");
const { buildCommandModel } = require("./model");

const COMMAND_VIEW_TYPE = "dashboard-magic-os-command";

class CommandView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.query = "";
    this.filter = "all";
    this.model = null;
  }

  getViewType() {
    return COMMAND_VIEW_TYPE;
  }

  getDisplayText() {
    return this.plugin.t("command.title");
  }

  getIcon() {
    return "radar";
  }

  async onOpen() {
    await this.refresh();
  }

  async refresh() {
    const profile = this.plugin.storageProfile();
    const roots = this.plugin.recordRootsFor(["command"], [profile.paths.command]);
    const records = await loadVaultRecords(this.plugin.recordCapabilities, {
      roots,
      mounts: this.plugin.folderMounts()
    });
    this.model = buildCommandModel(records, {
      cabinRuntime: this.plugin.services?.cabinRuntime,
      now: new Date(),
      shell: { query: this.query }
    });
    this.render();
  }

  render() {
    const container = this.containerEl?.children?.[1] || this.containerEl;
    if (!container) return;
    container.empty();
    container.addClass?.("mos-command-view");
    this.renderHeader(container);
    renderCabinContextBar(container, this.plugin.i18n, this.model?.shell);
    this.renderStats(container);
    this.renderToolbar(container);
    const tasks = this.visibleTasks();
    const projects = this.visibleProjects();
    if (!tasks.length && !projects.length) {
      renderEmptyState(container, this.plugin.i18n, {
        titleKey: this.query || this.filter !== "all" ? "command.empty.filteredTitle" : "command.empty.title",
        descriptionKey: this.query || this.filter !== "all" ? "command.empty.filteredDescription" : "command.empty.description"
      });
      return;
    }
    if (tasks.length) this.renderTaskList(container, tasks);
    if (projects.length) this.renderProjects(container, projects);
  }

  renderHeader(container) {
    const header = container.createDiv({ cls: "mos-command-header" });
    const copy = header.createDiv({ cls: "mos-command-heading" });
    copy.createEl("h2", { text: this.plugin.t("command.title") });
    copy.createEl("p", { text: this.plugin.t("command.description") });
    createTranslatedButton(header, this.plugin.i18n, "common.refresh", () => this.refresh(), { cls: "mod-cta" });
  }

  renderStats(container) {
    const totals = this.model?.totals || {};
    const stats = container.createDiv({ cls: "mos-command-stats" });
    [
      ["command.stats.tasks", totals.tasks],
      ["command.stats.active", totals.active],
      ["command.stats.due", totals.due],
      ["command.stats.blocked", totals.blocked],
      ["command.stats.projects", totals.projects],
      ["command.stats.goals", totals.goals]
    ].forEach(([key, value]) => {
      const item = stats.createDiv({ cls: "mos-command-stat" });
      item.createEl("strong", { text: String(value || 0) });
      item.createEl("span", { text: this.plugin.t(key) });
    });
  }

  renderToolbar(container) {
    const toolbar = container.createDiv({ cls: "mos-command-toolbar" });
    const search = toolbar.createEl("input", {
      cls: "mos-command-search",
      attr: {
        type: "search",
        "aria-label": this.plugin.t("command.searchLabel"),
        placeholder: this.plugin.t("command.searchPlaceholder")
      }
    });
    search.value = this.query;
    search.addEventListener("input", (event) => {
      this.query = String(event.target?.value || "");
      this.render();
      const next = this.containerEl?.children?.[1]?.querySelector?.(".mos-command-search");
      next?.focus?.();
      if (typeof next?.setSelectionRange === "function") next.setSelectionRange(this.query.length, this.query.length);
    });
    const filters = toolbar.createDiv({ cls: "mos-command-filters" });
    ["all", "active", "due", "blocked", "completed"].forEach((filter) => {
      const button = createTranslatedButton(filters, this.plugin.i18n, `command.filter.${filter}`, () => {
        this.filter = filter;
        this.render();
      }, { cls: this.filter === filter ? "is-active" : "" });
      button.setAttribute?.("aria-pressed", this.filter === filter ? "true" : "false");
    });
  }

  visibleTasks() {
    const query = String(this.query || "").trim().toLocaleLowerCase();
    return (this.model?.tasks || []).filter((task) => {
      if (this.filter === "active" && task.status !== "active") return false;
      if (this.filter === "due" && !task.isDue) return false;
      if (this.filter === "blocked" && !task.blocked) return false;
      if (this.filter === "completed" && task.status !== "completed") return false;
      if (!query) return true;
      return [task.title, task.projectTitle, task.goalTitle, task.nextAction, task.status]
        .some((value) => String(value || "").toLocaleLowerCase().includes(query));
    });
  }

  visibleProjects() {
    const query = String(this.query || "").trim().toLocaleLowerCase();
    return (this.model?.projects || []).filter((project) => {
      if (!query) return true;
      return [project.title, project.description, project.nextAction]
        .some((value) => String(value || "").toLocaleLowerCase().includes(query));
    });
  }

  renderTaskList(container, tasks) {
    const section = container.createDiv({ cls: "mos-command-section" });
    const heading = section.createDiv({ cls: "mos-command-section-heading" });
    heading.createEl("h3", { text: this.plugin.t("command.tasksTitle") });
    heading.createEl("span", { text: this.plugin.t("command.taskCount", { count: tasks.length }) });
    const list = section.createDiv({ cls: "mos-command-task-list" });
    tasks.forEach((task) => this.renderTaskCard(list, task));
  }

  renderTaskCard(container, task) {
    const card = container.createEl("button", {
      cls: `mos-command-task-card ${task.blocked ? "is-blocked" : ""}`,
      attr: { type: "button", "aria-label": this.plugin.t("command.openTask", { title: task.title }) }
    });
    const top = card.createDiv({ cls: "mos-command-task-top" });
    top.createEl("span", { text: this.plugin.t(`command.status.${task.status}`) });
    if (task.priority) top.createEl("em", { text: this.plugin.t("command.priority", { value: task.priority }) });
    card.createEl("strong", { text: task.title || this.plugin.t("common.untitled") });
    const meta = card.createDiv({ cls: "mos-command-task-meta" });
    meta.createEl("span", { text: task.due
      ? this.plugin.t(task.overdue ? "command.overdue" : "command.due", { date: task.due })
      : this.plugin.t("command.noDue") });
    if (task.projectTitle) meta.createEl("span", { text: this.plugin.t("command.project", { title: task.projectTitle }) });
    if (task.nextAction) card.createEl("small", { text: this.plugin.t("command.nextAction", { value: task.nextAction }) });
    else card.createEl("small", { text: this.plugin.t("command.noNextAction") });
    card.addEventListener("click", () => this.openRecord(task.file));
  }

  renderProjects(container, projects = this.model?.projects || []) {
    const section = container.createDiv({ cls: "mos-command-section mos-command-projects" });
    const heading = section.createDiv({ cls: "mos-command-section-heading" });
    heading.createEl("h3", { text: this.plugin.t("command.projectsTitle") });
    heading.createEl("span", { text: this.plugin.t("command.projectCount", { count: projects.length }) });
    const grid = section.createDiv({ cls: "mos-command-project-grid" });
    projects.forEach((project) => {
      const card = grid.createEl("button", {
        cls: "mos-command-project-card",
        attr: { type: "button", "aria-label": this.plugin.t("command.openProject", { title: project.title }) }
      });
      card.createEl("strong", { text: project.title || this.plugin.t("common.untitled") });
      if (project.description) card.createEl("p", { text: project.description.slice(0, 160) });
      const meta = card.createDiv({ cls: "mos-command-project-meta" });
      meta.createEl("span", { text: this.plugin.t("command.projectTasks", { count: project.taskCount }) });
      meta.createEl("span", { text: this.plugin.t("command.projectGoals", { count: project.goalCount }) });
      if (project.nextAction) card.createEl("small", { text: this.plugin.t("command.nextAction", { value: project.nextAction }) });
      card.addEventListener("click", () => this.openRecord(project.file));
    });
  }

  async openRecord(file) {
    if (!file) return;
    await this.app?.workspace?.getLeaf?.(true)?.openFile?.(file);
  }
}

module.exports = { COMMAND_VIEW_TYPE, CommandView };
