"use strict";

const { PluginSettingTab, Setting } = require("obsidian");
const { DEFAULT_SETTINGS, normalizeSettings } = require("./config/settings-schema");

class DashboardMagicOSSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const t = (key, params) => this.plugin.t(key, params);
    containerEl.empty();
    containerEl.createEl("h2", { text: t("settings.title") });

    new Setting(containerEl)
      .setName(t("settings.language.name"))
      .setDesc(t("settings.language.description"))
      .addDropdown((dropdown) => dropdown
        .addOption("auto", t("language.auto"))
        .addOption("zh-CN", t("language.zh-CN"))
        .addOption("en", t("language.en"))
        .setValue(this.plugin.settings.interfaceLanguage)
        .onChange(async (value) => {
          await this.plugin.setInterfaceLanguage(value);
          this.display();
        }));

    new Setting(containerEl)
      .setName(t("settings.storage.name"))
      .setDesc(t("settings.storage.description", {
        profile: t(`storage.profile.${this.plugin.activeStorageProfileId()}.name`)
      }))
      .addButton((button) => button
        .setButtonText(t("settings.storage.configure"))
        .onClick(() => this.plugin.openStorageOnboarding()));

    new Setting(containerEl)
      .setName(t("settings.mounts.name"))
      .setDesc(t("settings.mounts.description", { count: this.plugin.folderMounts().length }))
      .addButton((button) => button
        .setButtonText(t("settings.mounts.configure"))
        .onClick(() => this.plugin.openFolderMounts()));

    new Setting(containerEl)
      .setName(t("settings.personalization.name"))
      .setDesc(t("settings.personalization.description"))
      .addButton((button) => button
        .setButtonText(t("settings.personalization.export"))
        .onClick(() => this.plugin.exportPersonalization()))
      .addButton((button) => button
        .setButtonText(t("settings.personalization.import"))
        .onClick(() => this.plugin.choosePersonalizationImport()));
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  normalizeSettings,
  DashboardMagicOSSettingTab
};
