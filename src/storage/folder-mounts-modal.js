"use strict";

const { Modal, Notice } = require("obsidian");
const {
  FOLDER_MOUNT_AI_SCOPES,
  FOLDER_MOUNT_MODULES,
  FOLDER_MOUNT_ROLES
} = require("./folder-mounts");

class FolderMountsModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  t(key, params = {}) {
    return this.plugin.t(key, params);
  }

  onOpen() {
    this.render();
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("mos-folder-mounts-modal");
    contentEl.createEl("h2", { text: this.t("mounts.title") });
    contentEl.createEl("p", { cls: "mos-folder-mounts-intro", text: this.t("mounts.description") });
    contentEl.createEl("p", { cls: "mos-folder-mounts-safety", text: this.t("mounts.safety") });
    this.renderAddForm(contentEl);
    const mounts = this.plugin.folderMounts();
    const list = contentEl.createDiv({ cls: "mos-folder-mounts-list" });
    if (!mounts.length) {
      list.createEl("p", { cls: "mos-folder-mounts-empty", text: this.t("mounts.empty") });
      return;
    }
    mounts.forEach((mount) => this.renderMount(list, mount));
  }

  renderAddForm(container) {
    const form = container.createDiv({ cls: "mos-folder-mounts-add" });
    const input = form.createEl("input", {
      attr: {
        type: "text",
        placeholder: this.t("mounts.pathPlaceholder"),
        list: "mos-folder-mount-candidates"
      }
    });
    const candidates = form.createEl("datalist", { attr: { id: "mos-folder-mount-candidates" } });
    this.plugin.availableFolderPaths().forEach((path) => {
      candidates.createEl("option", { attr: { value: path } });
    });
    const add = form.createEl("button", { text: this.t("mounts.add"), attr: { type: "button" } });
    const submit = async () => {
      add.disabled = true;
      try {
        await this.plugin.addFolderMount({ path: input.value });
        new Notice(this.t("mounts.notice.added"));
        this.render();
      } catch (error) {
        new Notice(this.t("notice.failed", { reason: error?.message || error }));
      } finally {
        add.disabled = false;
      }
    };
    add.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void submit();
    });
  }

  selector(container, value, values, labelKey, onChange) {
    const label = container.createEl("label");
    label.createEl("span", { text: this.t(labelKey) });
    const select = label.createEl("select");
    values.forEach((item) => select.createEl("option", {
      text: this.t(`${labelKey}.${item}`),
      attr: { value: item }
    }));
    select.value = value;
    select.addEventListener("change", () => void onChange(select.value));
    return select;
  }

  renderMount(container, mount) {
    const card = container.createDiv({ cls: `mos-folder-mount ${mount.enabled ? "is-enabled" : "is-disabled"}` });
    const header = card.createDiv({ cls: "mos-folder-mount-header" });
    const identity = header.createDiv();
    identity.createEl("strong", { text: mount.path });
    identity.createEl("small", { text: this.t("mounts.indexOnly") });
    const enabledLabel = header.createEl("label", { cls: "mos-folder-mount-enabled" });
    enabledLabel.createEl("span", { text: this.t("mounts.enabled") });
    const enabled = enabledLabel.createEl("input", { attr: { type: "checkbox" } });
    enabled.checked = mount.enabled;
    enabled.addEventListener("change", async () => {
      await this.plugin.updateFolderMount(mount.id, { enabled: enabled.checked });
      this.render();
    });

    const fields = card.createDiv({ cls: "mos-folder-mount-fields" });
    const update = async (patch) => {
      try {
        await this.plugin.updateFolderMount(mount.id, patch);
        this.render();
      } catch (error) {
        new Notice(this.t("notice.failed", { reason: error?.message || error }));
      }
    };
    this.selector(fields, mount.module, FOLDER_MOUNT_MODULES, "mounts.module", (module) => update({ module }));
    this.selector(fields, mount.role, FOLDER_MOUNT_ROLES, "mounts.role", (role) => update({ role }));
    this.selector(fields, mount.aiScope, FOLDER_MOUNT_AI_SCOPES, "mounts.aiScope", (aiScope) => update({ aiScope }));

    const remove = card.createEl("button", {
      cls: "mos-folder-mount-remove",
      text: this.t("mounts.remove"),
      attr: { type: "button" }
    });
    remove.addEventListener("click", async () => {
      await this.plugin.removeFolderMount(mount.id);
      new Notice(this.t("mounts.notice.removed"));
      this.render();
    });
  }
}

module.exports = { FolderMountsModal };
