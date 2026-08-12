"use strict";

const mediaPreview = require("./media-preview");
const recordQuery = require("./record-query");
const recordRelations = require("./record-relations");
const aiProvider = require("./ai-provider");

function createCoreServices(options = {}) {
  return Object.freeze({
    storageProfile: typeof options.storageProfile === "function" ? options.storageProfile : () => null,
    mediaPreview: Object.freeze({ ...mediaPreview }),
    recordQuery: Object.freeze({ ...recordQuery }),
    recordRelations: Object.freeze({ ...recordRelations }),
    aiProvider: Object.freeze({ ...aiProvider })
  });
}

module.exports = { createCoreServices };
