"use strict";

const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

let appLanguage = "zh-CN";
const notices = [];
const renderedSettings = [];

class PluginMock {
  constructor(app) {
    this.app = app;
    this.savedData = null;
    this.commands = [];
    this.settingTabs = [];
    this.views = new Map();
  }

  async loadData() {
    return this.initialData || {};
  }

  async saveData(data) {
    this.savedData = data;
  }

  addCommand(command) {
    this.commands.push(command);
    return command;
  }

  addSettingTab(tab) {
    this.settingTabs.push(tab);
  }

  registerView(type, creator) {
    this.views.set(type, creator);
  }
}

class ModalMock {
  constructor(app) {
    this.app = app;
    this.opened = false;
    this.contentEl = null;
  }

  open() {
    this.opened = true;
  }

  close() {
    this.opened = false;
  }
}

class PluginSettingTabMock {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
  }
}

class ItemViewMock {
  constructor(leaf) {
    this.leaf = leaf;
    this.app = leaf?.app;
    this.containerEl = null;
  }
}

class SettingMock {
  constructor() {
    this.options = [];
    renderedSettings.push(this);
  }

  setName(value) {
    this.name = value;
    return this;
  }

  setDesc(value) {
    this.description = value;
    return this;
  }

  addDropdown(callback) {
    const dropdown = {
      addOption: (value, label) => {
        this.options.push([value, label]);
        return dropdown;
      },
      setValue: (value) => {
        this.value = value;
        return dropdown;
      },
      onChange: (handler) => {
        this.onChange = handler;
        return dropdown;
      }
    };
    callback(dropdown);
    return this;
  }

  addButton(callback) {
    const button = {
      setButtonText: (value) => {
        this.buttonText = value;
        return button;
      },
      onClick: (handler) => {
        this.onClick = handler;
        return button;
      }
    };
    callback(button);
    return this;
  }
}

const obsidianMock = {
  Plugin: PluginMock,
  Modal: ModalMock,
  PluginSettingTab: PluginSettingTabMock,
  ItemView: ItemViewMock,
  Setting: SettingMock,
  Notice: class {
    constructor(message) {
      notices.push(message);
    }
  },
  getLanguage: () => appLanguage
};

function loadPlugin() {
  const mainPath = path.resolve(__dirname, "..", "src", "main.js");
  const originalLoad = Module._load;
  delete require.cache[mainPath];
  delete require.cache[require.resolve("../src/settings")];
  Module._load = function load(request, parent, isMain) {
    if (request === "obsidian") return obsidianMock;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(mainPath);
  } finally {
    Module._load = originalLoad;
  }
}

function createApp() {
  const events = [];
  const paths = new Set();
  const layoutReadyCallbacks = [];
  const viewStates = [];
  const leaf = {
    setViewState: async (state) => viewStates.push(state),
    openFile: async (file) => viewStates.push({ file: file.path })
  };
  return {
    events,
    paths,
    layoutReadyCallbacks,
    viewStates,
    vault: {
      getAbstractFileByPath: (path) => paths.has(path) ? { path } : null,
      adapter: { exists: async (path) => paths.has(path) },
      createFolder: async (path) => {
        paths.add(path);
        return { path };
      }
    },
    workspace: {
      trigger: (...args) => events.push(args),
      onLayoutReady: (callback) => layoutReadyCallbacks.push(callback),
      getLeavesOfType: () => [],
      getLeaf: () => leaf,
      revealLeaf: () => {}
    }
  };
}

class ElementMock {
  constructor(tag = "div", options = {}) {
    this.tag = tag;
    this.options = options;
    this.children = [];
    this.classes = [];
    this.listeners = new Map();
  }

  empty() {
    this.children = [];
  }

  addClass(value) {
    this.classes.push(value);
  }

  createDiv(options = {}) {
    return this.createEl("div", options);
  }

  createEl(tag, options = {}) {
    const child = new ElementMock(tag, options);
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  all(predicate) {
    return [...(predicate(this) ? [this] : []), ...this.children.flatMap((child) => child.all(predicate))];
  }
}

test("auto language follows Obsidian at plugin load", async () => {
  appLanguage = "en-US";
  notices.length = 0;
  const PluginClass = loadPlugin();
  const plugin = new PluginClass(createApp());
  plugin.initialData = { interfaceLanguage: "auto" };
  await plugin.onload();
  assert.equal(plugin.i18n.locale, "en");
  assert.equal(plugin.commands[0].name, "Open Dashboard Magic OS");
  assert.equal(plugin.commands[1].name, "Configure Dashboard Magic OS storage");
  assert.equal(plugin.commands[2].name, "Open Learning Threads");
  assert.equal(plugin.commands[3].name, "Open People & Health");
  assert.equal(plugin.commands[4].name, "Open AI Steward");
  assert.equal(plugin.settingTabs.length, 1);
  assert.equal(plugin.views.has("dashboard-magic-os-organizer"), true);
  assert.equal(plugin.views.has("dashboard-magic-os-learning"), true);
  assert.equal(plugin.views.has("dashboard-magic-os-people-health"), true);
  assert.equal(plugin.views.has("dashboard-magic-os-ai-steward"), true);
  assert.equal(typeof plugin.services.mediaPreview.selectMediaPreview, "function");
  assert.equal(typeof plugin.services.recordQuery.buildRecordQueryIndex, "function");
  assert.equal(typeof plugin.services.recordRelations.buildRecordRelationIndex, "function");
  assert.equal(typeof plugin.services.aiProvider.buildOpenAIRequest, "function");
  assert.equal(typeof plugin.services.aiEntitlement.evaluateAccess, "function");
  assert.equal(typeof plugin.services.aiTransport.requestWithTimeout, "function");
  assert.equal(plugin.services.storageProfile().id, "portable");
});

test("open command activates the Organizer application view", async () => {
  appLanguage = "en-US";
  const app = createApp();
  const PluginClass = loadPlugin();
  const plugin = new PluginClass(app);
  plugin.initialData = { interfaceLanguage: "auto" };
  await plugin.onload();
  await plugin.commands[0].callback();
  assert.deepEqual(app.viewStates, [{ type: "dashboard-magic-os-organizer", active: true }]);
});

test("learning command activates the Learning Threads application view", async () => {
  appLanguage = "en-US";
  const app = createApp();
  const PluginClass = loadPlugin();
  const plugin = new PluginClass(app);
  plugin.initialData = { interfaceLanguage: "auto" };
  await plugin.onload();
  await plugin.commands[2].callback();
  assert.deepEqual(app.viewStates, [{ type: "dashboard-magic-os-learning", active: true }]);
});

test("people health command activates its privacy-first application view", async () => {
  appLanguage = "en-US";
  const app = createApp();
  const PluginClass = loadPlugin();
  const plugin = new PluginClass(app);
  plugin.initialData = { interfaceLanguage: "auto" };
  await plugin.onload();
  await plugin.commands[3].callback();
  assert.deepEqual(app.viewStates, [{ type: "dashboard-magic-os-people-health", active: true }]);
});

test("AI Steward command keeps the paid entrance visible", async () => {
  appLanguage = "en-US";
  const app = createApp();
  const PluginClass = loadPlugin();
  const plugin = new PluginClass(app);
  plugin.initialData = { interfaceLanguage: "auto" };
  await plugin.onload();
  await plugin.commands[4].callback();
  assert.deepEqual(app.viewStates, [{ type: "dashboard-magic-os-ai-steward", active: true }]);
  assert.deepEqual(plugin.aiStewardState(), {
    enabled: true,
    interactiveEnabled: false,
    providers: [],
    jobs: []
  });
});

test("locked AI Steward renders visible capability buttons that cannot be clicked", async () => {
  appLanguage = "en-US";
  const app = createApp();
  const PluginClass = loadPlugin();
  const plugin = new PluginClass(app);
  plugin.initialData = { interfaceLanguage: "auto" };
  await plugin.onload();
  const view = plugin.views.get("dashboard-magic-os-ai-steward")({ app });
  const content = new ElementMock();
  view.containerEl = { children: [new ElementMock(), content] };
  await view.onOpen();
  const featureButtons = content.all((element) => element.tag === "button" && element.options.cls === "mos-ai-feature");
  assert.equal(featureButtons.length > 0, true);
  featureButtons.forEach((button) => {
    assert.equal(Object.hasOwn(button.options.attr, "disabled"), true);
    assert.equal(button.options.attr["aria-disabled"], "true");
    assert.equal(button.listeners.has("click"), false);
  });
});

test("manual language persists and refreshes translated command state", async () => {
  appLanguage = "en-US";
  notices.length = 0;
  const app = createApp();
  const PluginClass = loadPlugin();
  const plugin = new PluginClass(app);
  plugin.initialData = { interfaceLanguage: "auto" };
  await plugin.onload();
  const locale = await plugin.setInterfaceLanguage("zh-CN");
  assert.equal(locale, "zh-CN");
  assert.deepEqual(plugin.savedData, {
    interfaceLanguage: "zh-CN",
    storagePreference: "auto",
    storageProfileId: "",
    storageSetupCompleted: false,
    storageSchemaVersion: 1
  });
  assert.equal(plugin.commands[0].name, "打开 Dashboard Magic OS");
  assert.equal(plugin.commands[2].name, "打开学习脉络");
  assert.equal(plugin.commands[3].name, "打开人物健康");
  assert.equal(plugin.commands[4].name, "打开 AI 管家");
  assert.deepEqual(app.events[0], ["dashboard-magic-os:locale-changed", "zh-CN"]);
  assert.equal(notices.at(-1), "界面语言已切换为简体中文");
});

test("settings tab renders auto, Chinese and English choices in the active locale", async () => {
  appLanguage = "en-US";
  renderedSettings.length = 0;
  const PluginClass = loadPlugin();
  const plugin = new PluginClass(createApp());
  plugin.initialData = { interfaceLanguage: "auto" };
  await plugin.onload();
  const headings = [];
  plugin.settingTabs[0].containerEl = {
    empty() {},
    createEl(tag, options) {
      headings.push([tag, options]);
      return {};
    }
  };
  plugin.settingTabs[0].display();
  assert.equal(headings[0][1].text, "Dashboard Magic OS settings");
  assert.equal(renderedSettings[0].name, "Interface language");
  assert.deepEqual(renderedSettings[0].options, [
    ["auto", "Follow Obsidian"],
    ["zh-CN", "简体中文"],
    ["en", "English"]
  ]);
  assert.equal(renderedSettings[1].name, "Storage layout");
  assert.equal(renderedSettings[1].buttonText, "Inspect and configure");
});

test("plugin detects storage without writes and initializes only after confirmation", async () => {
  appLanguage = "en-US";
  notices.length = 0;
  const app = createApp();
  const PluginClass = loadPlugin();
  const plugin = new PluginClass(app);
  plugin.initialData = {
    interfaceLanguage: "auto",
    storagePreference: "auto",
    storageSetupCompleted: false
  };
  await plugin.onload();
  assert.equal(plugin.storageState.detected, "empty");
  assert.equal(plugin.storageState.recommendedProfileId, "portable");
  assert.equal(app.paths.size, 0);
  assert.equal(app.layoutReadyCallbacks.length, 1);

  const result = await plugin.completeStorageSetup("portable");
  assert.equal(result.profile.id, "portable");
  assert.equal(result.created.length > 0, true);
  assert.equal(app.paths.has("MagicOS/Records/Assets"), true);
  assert.equal(plugin.savedData.storageProfileId, "portable");
  assert.equal(plugin.savedData.storageSetupCompleted, true);
  assert.deepEqual(app.events.at(-1), ["dashboard-magic-os:storage-ready", "portable"]);
  assert.match(notices.at(-1), /^Enabled Portable MagicOS layout;/);
});

test("existing Dashboard storage is detected but never migrated on load", async () => {
  appLanguage = "zh-CN";
  const app = createApp();
  ["Dashboard", "Dashboard/System", "Dashboard/Private/Modules/Assets"].forEach((path) => app.paths.add(path));
  const before = Array.from(app.paths).sort();
  const PluginClass = loadPlugin();
  const plugin = new PluginClass(app);
  plugin.initialData = {
    interfaceLanguage: "auto",
    storagePreference: "auto",
    storageSetupCompleted: false
  };
  await plugin.onload();
  assert.equal(plugin.storageState.detected, "legacy-dashboard");
  assert.equal(plugin.storageState.recommendedProfileId, "legacy-dashboard");
  assert.deepEqual(Array.from(app.paths).sort(), before);
});
