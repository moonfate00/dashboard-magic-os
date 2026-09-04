"use strict";

const contracts = require("./contracts");
const { createCabinRegistry } = require("./cabin-registry");
const { createEventBus } = require("./event-bus");
const { runHealthAudit } = require("./health-audit");
const recordEnvelope = require("./record-envelope");
const objectWorkbench = require("./object-workbench");
const cabinPresentation = require("./cabin-presentation");
const { createCabinRuntime } = require("./runtime");

module.exports = {
  ...contracts,
  ...recordEnvelope,
  ...objectWorkbench,
  ...cabinPresentation,
  createCabinRegistry,
  createCabinRuntime,
  createEventBus,
  runHealthAudit
};
