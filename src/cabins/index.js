"use strict";

const command = require("./command/manifest");
const assets = require("./assets/manifest");
const social = require("./social/manifest");
const navigation = require("./navigation/manifest");
const memory = require("./memory/manifest");

const DEFAULT_CABIN_MANIFESTS = Object.freeze([command, assets, social, navigation, memory]);

module.exports = {
  DEFAULT_CABIN_MANIFESTS,
  assets,
  command,
  memory,
  navigation,
  social
};
