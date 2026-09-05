"use strict";

const mediaPreview = require("./media-preview");
const recordQuery = require("./record-query");
const globalSearch = require("./global-search");
const recordRelations = require("./record-relations");
const aiProvider = require("./ai-provider");
const aiEntitlement = require("./ai-entitlement");
const aiJobState = require("./ai-job-state");
const aiTransport = require("./ai-transport");
const aiUsage = require("./ai-usage");
const aiRuntimeAdapter = require("./ai-runtime-adapter");
const aiExecutionPipeline = require("./ai-execution-pipeline");
const aiChangePlan = require("./ai-change-plan");
const aiChangeJournal = require("./ai-change-journal");
const objectCommand = require("./object-command");
const aiProviderSandbox = require("./ai-provider-sandbox");
const folderMounts = require("../storage/folder-mounts");
const cabinKernel = require("../kernel");
const commandModel = require("../apps/command/model");
const intake = require("../intake");

function createCoreServices(options = {}) {
  const cabinRuntime = cabinKernel.createCabinRuntime({
    manifests: options.cabinManifests,
    recordQuery,
    recordRelations
  });
  const intakeRuntime = intake.createIntakeRuntime({ adapters: options.intakeAdapters });
  return Object.freeze({
    storageProfile: typeof options.storageProfile === "function" ? options.storageProfile : () => null,
    mediaPreview: Object.freeze({ ...mediaPreview }),
    globalSearch: Object.freeze({ ...globalSearch }),
    recordQuery: Object.freeze({ ...recordQuery }),
    recordRelations: Object.freeze({ ...recordRelations }),
    objectWorkbench: Object.freeze({
      assessObjectTransition: cabinKernel.assessObjectTransition,
      buildObjectInspectorModel: cabinKernel.buildObjectInspectorModel,
      createObjectOperationPlan: cabinKernel.createObjectOperationPlan,
      createWorkspaceCheckpoint: cabinKernel.createWorkspaceCheckpoint,
      discoverUnprofiledObjects: cabinKernel.discoverUnprofiledObjects
    }),
    aiProvider: Object.freeze({ ...aiProvider }),
    aiEntitlement: Object.freeze({ ...aiEntitlement }),
    aiJobState: Object.freeze({ ...aiJobState }),
    aiTransport: Object.freeze({ ...aiTransport }),
    aiUsage: Object.freeze({ ...aiUsage }),
    aiRuntimeAdapter: Object.freeze({ ...aiRuntimeAdapter }),
    aiExecutionPipeline: Object.freeze({ ...aiExecutionPipeline }),
    aiChangePlan: Object.freeze({ ...aiChangePlan }),
    aiChangeJournal: Object.freeze({ ...aiChangeJournal }),
    objectCommand: Object.freeze({ ...objectCommand }),
    aiProviderSandbox: Object.freeze({ ...aiProviderSandbox }),
    folderMounts: Object.freeze({ ...folderMounts }),
    commandModel: Object.freeze({ ...commandModel }),
    intake: Object.freeze({ ...intake }),
    cabinKernel: Object.freeze({ ...cabinKernel }),
    cabinRuntime,
    intakeRuntime
  });
}

module.exports = { createCoreServices };
