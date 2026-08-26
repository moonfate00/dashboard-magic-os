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
const {
  createObsidianAIJournalPersistence,
  createObsidianMediaCapabilities,
  createObsidianSecretCapabilities,
  createObsidianStorageCapabilities
} = require("./storage/adapter");
const { createObsidianRecordCapabilities } = require("./storage/record-source");
const { StorageOnboardingModal } = require("./onboarding");
const { createCoreServices } = require("./services");
const { activateApplication, registerApplications } = require("./apps");
const { createPersonalizationService, serializePersonalization } = require("./config/personalization");
const { downloadTextFile, pickTextFile } = require("./config/personalization-files");
const { PersonalizationImportModal } = require("./config/personalization-modal");
const { AIRecoveryModal } = require("./apps/ai-steward/recovery-modal");
const { FolderMountsModal } = require("./storage/folder-mounts-modal");

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
    if (typeof this.app?.vault?.on === "function" && typeof this.registerEvent === "function") {
      this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
        void this.followFolderMountRename(oldPath, file?.path);
      }));
    }
    this.aiRuntime = this.createAIRuntimeAdapter();
    this.aiChangeJournal = null;
    this.aiRecoveryReports = Object.freeze([]);
    this.aiRecoveryUnavailable = false;
    this.aiRecoveryConfirmations = new WeakMap();
    if (this.settings.storageSetupCompleted) await this.initializeAIRecovery();
    this.applications = registerApplications(this);
    this.app?.workspace?.onLayoutReady?.(() => {
      if (!this.settings.storageSetupCompleted) this.openStorageOnboarding();
      else if (this.aiRecoveryReports.length) {
        new Notice(this.t("ai.recovery.startupNotice", { count: this.aiRecoveryReports.length }));
      }
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

  folderMounts() {
    return this.settings?.folderMounts || Object.freeze([]);
  }

  recordRootsFor(moduleIds = [], defaultRoots = []) {
    const roots = [
      ...(Array.isArray(defaultRoots) ? defaultRoots : [defaultRoots]),
      ...this.services.folderMounts.folderMountRoots(this.folderMounts(), moduleIds)
    ].filter(Boolean);
    return [...new Set(roots)];
  }

  availableFolderPaths() {
    const files = this.app?.vault?.getAllLoadedFiles?.() || [];
    return files
      .filter((candidate) => candidate?.path && !Object.prototype.hasOwnProperty.call(candidate, "extension"))
      .map((candidate) => candidate.path)
      .filter((path) => {
        try {
          this.services.folderMounts.normalizeMountPath(path);
          return !this.folderMountPathConflicts(path);
        } catch (_error) {
          return false;
        }
      })
      .sort((a, b) => a.localeCompare(b));
  }

  folderMountPathConflicts(pathValue) {
    const path = this.services.folderMounts.normalizeMountPath(pathValue);
    const profile = this.storageProfile();
    return Object.entries(profile.paths)
      .filter(([key]) => key !== "root")
      .some(([, protectedPath]) => (
        this.services.folderMounts.pathInsideMount(path, protectedPath)
        || this.services.folderMounts.pathInsideMount(protectedPath, path)
      ));
  }

  assertFolderMountAvailable(pathValue, ignoreId = "") {
    const path = this.services.folderMounts.normalizeMountPath(pathValue);
    if (this.folderMountPathConflicts(path)) throw new Error(this.t("mounts.error.protected"));
    const duplicate = this.folderMounts().find((mount) => mount.id !== ignoreId && mount.path.toLowerCase() === path.toLowerCase());
    if (duplicate) throw new Error(this.t("mounts.error.duplicate"));
    const candidate = this.app?.vault?.getAbstractFileByPath?.(path);
    if (!candidate || Object.prototype.hasOwnProperty.call(candidate, "extension")) {
      throw new Error(this.t("mounts.error.notFolder"));
    }
    return path;
  }

  async persistFolderMounts(mounts) {
    const next = normalizeSettings({ ...this.settings, folderMounts: mounts });
    await this.saveData(next);
    this.settings = next;
    this.app?.workspace?.trigger?.("dashboard-magic-os:folder-mounts-changed", next.folderMounts.length);
    return next.folderMounts;
  }

  async addFolderMount(input = {}) {
    const path = this.assertFolderMountAvailable(input.path);
    const suggestion = this.services.folderMounts.suggestFolderMount(path);
    const mount = this.services.folderMounts.normalizeFolderMount({
      ...suggestion,
      ...input,
      path,
      aiScope: input.aiScope || "manual",
      enabled: input.enabled !== false
    });
    await this.persistFolderMounts([...this.folderMounts(), mount]);
    return mount;
  }

  async updateFolderMount(id, patch = {}) {
    const current = this.folderMounts().find((mount) => mount.id === id);
    if (!current) throw new Error(this.t("mounts.error.missing"));
    const path = Object.prototype.hasOwnProperty.call(patch, "path")
      ? this.assertFolderMountAvailable(patch.path, id)
      : current.path;
    const updated = this.services.folderMounts.normalizeFolderMount({ ...current, ...patch, id, path });
    await this.persistFolderMounts(this.folderMounts().map((mount) => mount.id === id ? updated : mount));
    return updated;
  }

  async removeFolderMount(id) {
    const current = this.folderMounts().find((mount) => mount.id === id);
    if (!current) throw new Error(this.t("mounts.error.missing"));
    await this.persistFolderMounts(this.folderMounts().filter((mount) => mount.id !== id));
    return current;
  }

  async followFolderMountRename(oldPath, nextPath) {
    if (!oldPath || !nextPath || !this.folderMounts().length) return this.folderMounts();
    let renamed;
    try {
      renamed = this.services.folderMounts.followFolderMountRename(this.folderMounts(), oldPath, nextPath);
    } catch (_error) {
      return this.folderMounts();
    }
    if (renamed.every((mount, index) => mount.path === this.folderMounts()[index]?.path)) return this.folderMounts();
    const safe = renamed.map((mount) => Object.freeze({
      ...mount,
      enabled: mount.enabled && !this.folderMountPathConflicts(mount.path)
    }));
    return this.persistFolderMounts(safe);
  }

  openFolderMounts() {
    const modal = new FolderMountsModal(this.app, this);
    modal.open();
    return modal;
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
    const recoveryReports = this.aiRecoveryPublicReports();
    try {
      return {
        ...await this.aiRuntime.status(),
        recoveryReports,
        recoveryUnavailable: this.aiRecoveryUnavailable
      };
    } catch (error) {
      return {
        ...await this.services.aiRuntimeAdapter.createLockedAIRuntimeAdapter().status(),
        recoveryReports,
        recoveryUnavailable: this.aiRecoveryUnavailable
      };
    }
  }

  aiRecoveryPublicReports() {
    return Object.freeze(this.aiRecoveryReports.map((report) => Object.freeze({
      id: report.id,
      planId: report.planId,
      status: report.status,
      action: report.action,
      updatedAt: report.updatedAt,
      operations: Object.freeze(report.operations.map((operation) => Object.freeze({
        id: operation.id,
        kind: operation.kind,
        path: operation.path,
        observed: operation.observed
      })))
    })));
  }

  async initializeAIRecovery() {
    try {
      const profile = this.storageProfile();
      const persistence = createObsidianAIJournalPersistence(this.app, profile);
      this.aiChangeJournal = this.services.aiChangeJournal.createAIChangeJournal({
        persistence,
        capabilities: this.storageCapabilities,
        profile
      });
      return await this.refreshAIRecoveryState();
    } catch (error) {
      this.aiChangeJournal = null;
      this.aiRecoveryReports = Object.freeze([]);
      this.aiRecoveryUnavailable = true;
      return this.aiRecoveryReports;
    }
  }

  async refreshAIRecoveryState() {
    if (!this.aiChangeJournal) {
      this.aiRecoveryReports = Object.freeze([]);
      this.aiRecoveryUnavailable = this.settings.storageSetupCompleted === true;
      return this.aiRecoveryReports;
    }
    try {
      this.aiRecoveryReports = await this.aiChangeJournal.inspect();
      this.aiRecoveryUnavailable = false;
    } catch (error) {
      this.aiRecoveryReports = Object.freeze([]);
      this.aiRecoveryUnavailable = true;
    }
    this.app?.workspace?.trigger?.("dashboard-magic-os:ai-recovery-changed", this.aiRecoveryReports.length);
    return this.aiRecoveryReports;
  }

  openAIRecovery(reportId) {
    const prepared = this.prepareAIRecovery(reportId);
    const modal = new AIRecoveryModal(this.app, this, prepared);
    modal.open();
    return modal;
  }

  prepareAIRecovery(reportId) {
    const report = this.aiRecoveryReports.find((item) => item.id === reportId);
    if (!report || report.action === "manual-review") throw new Error(this.t("ai.recovery.actionUnavailable"));
    const confirmation = Object.freeze({ id: report.id, action: report.action });
    this.aiRecoveryConfirmations.set(confirmation, { state: "prepared", reportId: report.id });
    const projected = this.aiRecoveryPublicReports().find((item) => item.id === report.id);
    return Object.freeze({ report: projected, confirmation });
  }

  cancelAIRecovery(confirmation) {
    const entry = this.aiRecoveryConfirmations.get(confirmation);
    if (!entry || entry.state !== "prepared") throw new Error(this.t("ai.recovery.actionUnavailable"));
    entry.state = "cancelled";
    return Object.freeze({ status: "cancelled" });
  }

  async applyAIRecovery(confirmation) {
    const entry = this.aiRecoveryConfirmations.get(confirmation);
    if (!entry || entry.state !== "prepared") throw new Error(this.t("ai.recovery.actionUnavailable"));
    entry.state = "applying";
    const report = this.aiRecoveryReports.find((item) => item.id === entry.reportId);
    if (!report || report.action === "manual-review" || !this.aiChangeJournal) {
      entry.state = "failed";
      throw new Error(this.t("ai.recovery.actionUnavailable"));
    }
    try {
      const result = await this.aiChangeJournal.recover(report.token, { confirmed: true });
      entry.state = "applied";
      await this.refreshAIRecoveryState();
      new Notice(this.t(`ai.recovery.notice.${result.status}`));
      return result;
    } catch (error) {
      entry.state = "failed";
      await this.refreshAIRecoveryState();
      throw error;
    }
  }

  async openAIRecoveryRecord(reportId, path) {
    const report = this.aiRecoveryReports.find((item) => item.id === reportId);
    const allowed = report?.operations?.some((operation) => operation.path === path);
    const file = allowed ? this.app?.vault?.getAbstractFileByPath?.(path) : null;
    if (!file) throw new Error(this.t("ai.recovery.recordUnavailable"));
    const leaf = this.app?.workspace?.getLeaf?.("tab") || this.app?.workspace?.getLeaf?.(true);
    await leaf?.openFile?.(file);
    return file;
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
    await this.initializeAIRecovery();
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
