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
const { createPersonalizationService, serializePersonalization } = require("./config/personalization");
const { downloadTextFile, pickTextFile } = require("./config/personalization-files");
const { PersonalizationImportModal } = require("./config/personalization-modal");

module.exports = class DashboardMagicOSPlugin extends Plugin {
  async onload() {
    this.settings = normalizeSettings(await this.loadData() || {});
    this.personalization = createPersonalizationService();
    this.i18n = createI18n({
      locale: this.resolveLocale()
    });
    this.openCommand = this.addCommand({
      id: "open-organizer",
      name: this.t("command.open.name"),
      callback: () => this.openOrganizer()
    });
    this.storageCommand = this.addCommand({
      id: "configure-storage-layout",
      name: this.t("command.storage.name"),
      callback: () => this.openStorageOnboarding()
    });
    this.learningCommand = this.addCommand({
      id: "open-learning-threads",
      name: this.t("command.learning.name"),
      callback: () => this.openLearning()
    });
    this.peopleHealthCommand = this.addCommand({
      id: "open-people-health",
      name: this.t("command.health.name"),
      callback: () => this.openPeopleHealth()
    });
    this.aiStewardCommand = this.addCommand({
      id: "open-ai-steward",
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
    await this.saveData(this.settings);
    const locale = this.refreshTranslatedState();
    new Notice(this.t("notice.languageChanged", {
      language: this.t(`language.${locale}`)
    }));
    return locale;
  }

  refreshTranslatedState() {
    const locale = this.resolveLocale();
    this.i18n.setLocale(locale);
    if (this.openCommand) this.openCommand.name = this.t("command.open.name");
    if (this.storageCommand) this.storageCommand.name = this.t("command.storage.name");
    if (this.learningCommand) this.learningCommand.name = this.t("command.learning.name");
    if (this.peopleHealthCommand) this.peopleHealthCommand.name = this.t("command.health.name");
    if (this.aiStewardCommand) this.aiStewardCommand.name = this.t("command.ai.name");
    this.app?.workspace?.trigger?.("dashboard-magic-os:locale-changed", locale);
    return locale;
  }

  exportPersonalization() {
    try {
      downloadTextFile(serializePersonalization(this.settings));
      new Notice(this.t("notice.personalizationExported"));
      return true;
    } catch (error) {
      this.showFailure(error);
      return false;
    }
  }

  async choosePersonalizationImport() {
    try {
      const text = await pickTextFile();
      if (text === null) return null;
      const prepared = this.personalization.prepare(text, this.settings);
      const modal = new PersonalizationImportModal(this.app, this, prepared);
      modal.open();
      return modal;
    } catch (error) {
      this.showFailure(error);
      return null;
    }
  }

  cancelPersonalizationImport(confirmation) {
    return this.personalization.cancel(confirmation);
  }

  async applyPersonalizationImport(confirmation) {
    const result = this.personalization.apply(confirmation, { confirmed: true });
    const previous = this.settings;
    const next = normalizeSettings({ ...previous, ...result.preferences });
    try {
      await this.saveData(next);
      this.settings = next;
    } catch (error) {
      this.settings = previous;
      throw error;
    }
    this.refreshTranslatedState();
    this.storageState = await detectStorageState(this.storageCapabilities, this.settings.storagePreference);
    if (this.settingTab?.containerEl) this.settingTab.display();
    this.app?.workspace?.trigger?.("dashboard-magic-os:personalization-imported", result.changes.length);
    new Notice(this.t("notice.personalizationImported", { count: result.changes.length }));
    return result;
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
