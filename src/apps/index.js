"use strict";

const { ORGANIZER_VIEW_TYPE, OrganizerView } = require("./organizer/view");
const { LEARNING_VIEW_TYPE, LearningView } = require("./learning/view");
const { PEOPLE_HEALTH_VIEW_TYPE, PeopleHealthView } = require("./people-health/view");
const { AI_STEWARD_VIEW_TYPE, AIStewardView } = require("./ai-steward/view");
const { COMMAND_VIEW_TYPE, CommandView } = require("./command/view");

function registerApplications(plugin) {
  plugin.registerView(ORGANIZER_VIEW_TYPE, (leaf) => new OrganizerView(leaf, plugin));
  plugin.registerView(LEARNING_VIEW_TYPE, (leaf) => new LearningView(leaf, plugin));
  plugin.registerView(PEOPLE_HEALTH_VIEW_TYPE, (leaf) => new PeopleHealthView(leaf, plugin));
  plugin.registerView(AI_STEWARD_VIEW_TYPE, (leaf) => new AIStewardView(leaf, plugin));
  plugin.registerView(COMMAND_VIEW_TYPE, (leaf) => new CommandView(leaf, plugin));
  return Object.freeze({
    organizer: Object.freeze({ id: "organizer", viewType: ORGANIZER_VIEW_TYPE }),
    learning: Object.freeze({ id: "learning", viewType: LEARNING_VIEW_TYPE }),
    peopleHealth: Object.freeze({ id: "people-health", viewType: PEOPLE_HEALTH_VIEW_TYPE }),
    aiSteward: Object.freeze({ id: "ai-steward", viewType: AI_STEWARD_VIEW_TYPE }),
    command: Object.freeze({ id: "command", viewType: COMMAND_VIEW_TYPE })
  });
}

async function activateApplication(plugin, viewType) {
  const workspace = plugin.app?.workspace;
  let leaf = workspace?.getLeavesOfType?.(viewType)?.[0] || null;
  if (!leaf) {
    leaf = workspace?.getLeaf?.("tab") || workspace?.getLeaf?.(true);
    await leaf?.setViewState?.({ type: viewType, active: true });
  }
  workspace?.revealLeaf?.(leaf);
  return leaf;
}

module.exports = { activateApplication, registerApplications };
