"use strict";

const { PluginSettingTab, Setting } = require("obsidian");
const { normalizeLanguagePreference } = require("./i18n");
const { normalizeStoragePreference, STORAGE_SCHEMA_VERSION } = require("./storage/profiles");

const DEFAULT_SETTINGS = Object.freeze({
  interfaceLanguage: "auto",
  storagePreference: "auto",
  storageProfileId: "",
  storageSetupCompleted: false,
  storageSchemaVersion: STORAGE_SCHEMA_VERSION
});

function normalizeSettings(value = {}) {
  return {
    ...DEFAULT_SETTINGS,
    interfaceLanguage: normalizeLanguagePreference(value.interfaceLanguage),
    storagePreference: normalizeStoragePreference(value.storagePreference),
    storageProfileId: ["portable", "legacy-dashboard"].includes(value.storageProfileId) ? value.storageProfileId : "",
    storageSetupCompleted: value.storageSetupCompleted === true,
    storageSchemaVersion: Math.max(1, Number(value.storageSchemaVersion || STORAGE_SCHEMA_VERSION))
  };
}

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
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  normalizeSettings,
  DashboardMagicOSSettingTab
};
