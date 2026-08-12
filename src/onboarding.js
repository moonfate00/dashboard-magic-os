"use strict";

const { Modal } = require("obsidian");

class StorageOnboardingModal extends Modal {
  constructor(app, plugin, storageState) {
    super(app);
    this.plugin = plugin;
    this.storageState = storageState;
  }

  onOpen() {
    this.render();
  }

  render() {
    const { contentEl } = this;
    const t = (key, params) => this.plugin.t(key, params);
    contentEl.empty();
    contentEl.createEl("h2", { text: t("onboarding.storage.title") });
    contentEl.createEl("p", { text: t(`onboarding.storage.detected.${this.storageState.detected}`) });
    contentEl.createEl("p", { text: t("onboarding.storage.safety") });

    const choices = contentEl.createDiv({ cls: "mos-storage-choices" });
    this.renderChoice(choices, "portable");
    this.renderChoice(choices, "legacy-dashboard");
  }

  renderChoice(container, profileId) {
    const t = (key, params) => this.plugin.t(key, params);
    const recommended = this.storageState.recommendedProfileId === profileId;
    const card = container.createDiv({ cls: `mos-storage-choice${recommended ? " is-recommended" : ""}` });
    card.createEl("strong", { text: t(`storage.profile.${profileId}.name`) });
    card.createEl("span", { text: t(`storage.profile.${profileId}.description`) });
    if (recommended) card.createEl("em", { text: t("onboarding.storage.recommended") });
    card.createEl("button", {
      text: t("onboarding.storage.useProfile"),
      attr: { type: "button" }
    }).addEventListener("click", async () => {
      card.addClass?.("is-busy");
      try {
        await this.plugin.completeStorageSetup(profileId);
        this.close();
      } catch (error) {
        card.removeClass?.("is-busy");
        this.plugin.showFailure(error);
      }
    });
  }
}

module.exports = { StorageOnboardingModal };

