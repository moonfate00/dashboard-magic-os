"use strict";

const { Plugin, Notice, getLanguage } = require("obsidian");
const { createI18n, resolveInterfaceLocale } = require("./i18n");
const { normalizeSettings, DashboardMagicOSSettingTab } = require("./settings");
const {
  STORAGE_SCHEMA_VERSION,
  detectStorageState,
  initializeStorageProfile,
  storageProfileById
} = require("./storage/profiles");
const { createObsidianMediaCapabilities, createObsidianSecretCapabilities, createObsidianStorageCapabilities } = require("./storage/adapter");
const { createObsidianRecordCapabilities } = require("./storage/record-source");
const { StorageOnboardingModal } = require("./onboarding");
const { createCoreServices } = require("./services");
const { activateApplication, registerApplications } = require("./apps");

module.exports = class DashboardMagicOSPlugin extends Plugin {
  async onload() {
    this.settings = normalizeSettings(await this.loadData() || {});
    this.i18n = createI18n({
      locale: this.resolveLocale()
    });
    this.openCommand = this.addCommand({
      id: "open-dashboard-magic-os",
      name: this.t("command.open.name"),
      callback: () => this.openOrganizer()
    });
    this.storageCommand = this.addCommand({
      id: "configure-dashboard-magic-os-storage",
      name: this.t("command.storage.name"),
      callback: () => this.openStorageOnboarding()
    });
    this.learningCommand = this.addCommand({
      id: "open-dashboard-magic-os-learning",
      name: this.t("command.learning.name"),
      callback: () => this.openLearning()
    });
    this.peopleHealthCommand = this.addCommand({
      id: "open-dashboard-magic-os-people-health",
      name: this.t("command.health.name"),
      callback: () => this.openPeopleHealth()
    });
    this.aiStewardCommand = this.addCommand({
      id: "open-dashboard-magic-os-ai-steward",
      name: this.t("command.ai.name"),
      callback: () => this.openAISteward()
    });
    this.settingTab = new DashboardMagicOSSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    this.storageCapabilities = createObsidianStorageCapabilities(this.app);
    this.recordCapabilities = createObsidianRecordCapabilities(this.app);
    this.mediaCapabilities = createObsidianMediaCapabilities(this.app);
    this.secretCapabilities = createObsidianSecretCapabilities(this.app);
    this.storageState = await detectStorageState(this.storageCapabilities, this.settings.storagePreference);
    this.services = createCoreServices({ storageProfile: () => this.storageProfile() });
    this.aiRuntime = this.createAIRuntimeAdapter();
    this.applications = registerApplications(this);
    this.app?.workspace?.onLayoutReady?.(() => {
      if (!this.settings.storageSetupCompleted) this.openStorageOnboarding();
    });
  }

  appLocale() {
    try {
      return getLanguage() || this.app?.locale || "zh-CN";
    } catch (error) {
      return this.app?.locale || "zh-CN";
    }
  }

  resolveLocale(preference = this.settings?.interfaceLanguage) {
    return resolveInterfaceLocale(preference, this.appLocale());
  }

  t(key, params = {}) {
    return this.i18n?.t(key, params) || String(key || "");
  }

  async setInterfaceLanguage(preference) {
    this.settings = normalizeSettings({
      ...this.settings,
      interfaceLanguage: preference
    });
    const locale = this.resolveLocale();
    this.i18n.setLocale(locale);
    await this.saveData(this.settings);
    if (this.openCommand) this.openCommand.name = this.t("command.open.name");
    if (this.storageCommand) this.storageCommand.name = this.t("command.storage.name");
    if (this.learningCommand) this.learningCommand.name = this.t("command.learning.name");
    if (this.peopleHealthCommand) this.peopleHealthCommand.name = this.t("command.health.name");
    if (this.aiStewardCommand) this.aiStewardCommand.name = this.t("command.ai.name");
    this.app?.workspace?.trigger?.("dashboard-magic-os:locale-changed", locale);
    new Notice(this.t("notice.languageChanged", {
      language: this.t(`language.${locale}`)
    }));
    return locale;
  }

  activeStorageProfileId() {
    return this.settings?.storageProfileId || this.storageState?.recommendedProfileId || "portable";
  }

  storageProfile() {
    return storageProfileById(this.activeStorageProfileId());
  }

  async openOrganizer() {
    return activateApplication(this, this.applications.organizer.viewType);
  }

  async openLearning() {
    return activateApplication(this, this.applications.learning.viewType);
  }

  async openPeopleHealth() {
    return activateApplication(this, this.applications.peopleHealth.viewType);
  }

  createAIRuntimeAdapter() {
    return this.services.aiRuntimeAdapter.createLockedAIRuntimeAdapter();
  }

  async aiStewardState() {
    try {
      return await this.aiRuntime.status();
    } catch (error) {
      return this.services.aiRuntimeAdapter.createLockedAIRuntimeAdapter().status();
    }
  }

  async openAISteward() {
    return activateApplication(this, this.applications.aiSteward.viewType);
  }

  async openStorageOnboarding() {
    this.storageState = await detectStorageState(this.storageCapabilities, this.settings.storagePreference);
    const modal = new StorageOnboardingModal(this.app, this, this.storageState);
    modal.open();
    return modal;
  }

  async completeStorageSetup(profileId) {
    const result = await initializeStorageProfile(this.storageCapabilities, profileId);
    this.settings = normalizeSettings({
      ...this.settings,
      storagePreference: profileId,
      storageProfileId: result.profile.id,
      storageSetupCompleted: true,
      storageSchemaVersion: STORAGE_SCHEMA_VERSION
    });
    await this.saveData(this.settings);
    this.storageState = await detectStorageState(this.storageCapabilities, result.profile.id);
    this.app?.workspace?.trigger?.("dashboard-magic-os:storage-ready", result.profile.id);
    new Notice(this.t("notice.storageReady", {
      profile: this.t(`storage.profile.${result.profile.id}.name`),
      count: result.created.length
    }));
    return result;
  }

  showFailure(error) {
    new Notice(this.t("notice.failed", { reason: error?.message || error }));
  }
};
