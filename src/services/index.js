"use strict";

const mediaPreview = require("./media-preview");
const recordQuery = require("./record-query");
const recordRelations = require("./record-relations");
const aiProvider = require("./ai-provider");
const aiEntitlement = require("./ai-entitlement");
const aiJobState = require("./ai-job-state");
const aiTransport = require("./ai-transport");
const aiUsage = require("./ai-usage");
const aiRuntimeAdapter = require("./ai-runtime-adapter");
const aiExecutionPipeline = require("./ai-execution-pipeline");
const aiChangePlan = require("./ai-change-plan");

function createCoreServices(options = {}) {
  return Object.freeze({
    storageProfile: typeof options.storageProfile === "function" ? options.storageProfile : () => null,
    mediaPreview: Object.freeze({ ...mediaPreview }),
    recordQuery: Object.freeze({ ...recordQuery }),
    recordRelations: Object.freeze({ ...recordRelations }),
    aiProvider: Object.freeze({ ...aiProvider }),
    aiEntitlement: Object.freeze({ ...aiEntitlement }),
    aiJobState: Object.freeze({ ...aiJobState }),
    aiTransport: Object.freeze({ ...aiTransport }),
    aiUsage: Object.freeze({ ...aiUsage }),
    aiRuntimeAdapter: Object.freeze({ ...aiRuntimeAdapter }),
    aiExecutionPipeline: Object.freeze({ ...aiExecutionPipeline }),
    aiChangePlan: Object.freeze({ ...aiChangePlan })
  });
}

module.exports = { createCoreServices };
