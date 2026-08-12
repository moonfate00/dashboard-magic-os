"use strict";

const { ORGANIZER_VIEW_TYPE, OrganizerView } = require("./organizer/view");

function registerApplications(plugin) {
  plugin.registerView(ORGANIZER_VIEW_TYPE, (leaf) => new OrganizerView(leaf, plugin));
  return Object.freeze({ organizer: Object.freeze({ id: "organizer", viewType: ORGANIZER_VIEW_TYPE }) });
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
