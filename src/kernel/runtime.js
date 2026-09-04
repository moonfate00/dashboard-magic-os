"use strict";

const recordQueryDefault = require("../services/record-query");
const recordRelationsDefault = require("../services/record-relations");
const { createCabinRegistry } = require("./cabin-registry");
const { createEventBus } = require("./event-bus");
const { runHealthAudit } = require("./health-audit");
const { createRecordEnvelope, summarizeEnvelopes } = require("./record-envelope");
const { createObjectWorkbench } = require("./object-workbench");

function createCabinRuntime(options = {}) {
  const recordQuery = options.recordQuery || recordQueryDefault;
  const recordRelations = options.recordRelations || recordRelationsDefault;
  const registry = options.registry || createCabinRegistry(options.manifests);
  const events = options.events || createEventBus();

  function agentCatalog() {
    return Object.freeze(registry.list().map((cabin) => Object.freeze({
      id: cabin.id,
      objectTypes: Object.freeze(cabin.objectTypes.filter((item) => item.agentReadable).map((item) => item.id)),
      actions: Object.freeze(cabin.actions.filter((item) => item.agentCallable).map((item) => Object.freeze({
        id: item.id,
        authority: item.authority,
        transactionRequired: item.transactionRequired,
        objectTypes: item.objectTypes
      }))),
      capabilities: cabin.agentCapabilities
    })));
  }

  function snapshot(records = [], snapshotOptions = {}) {
    const input = Array.isArray(records) ? records.filter(Boolean) : [];
    const index = snapshotOptions.index || recordQuery.buildRecordQueryIndex(input, snapshotOptions.query || {});
    const relationIndex = recordRelations.buildRecordRelationIndex(index, snapshotOptions.relations || {});
    const byCabin = Object.fromEntries(registry.ids.map((id) => [id, []]));
    input.forEach((record) => {
      const requestedCabinId = typeof snapshotOptions.resolveCabinId === "function"
        ? snapshotOptions.resolveCabinId(record, registry)
        : "";
      const envelope = createRecordEnvelope(record, registry, { cabinId: requestedCabinId });
      if (envelope) byCabin[envelope.cabinId].push(envelope);
    });
    const cabins = Object.freeze(Object.fromEntries(registry.ids.map((id) => {
      const envelopes = Object.freeze(byCabin[id]);
      return [id, Object.freeze({
        manifest: registry.get(id),
        records: envelopes,
        counts: summarizeEnvelopes(envelopes, snapshotOptions.counts || {})
      })];
    })));
    const health = runHealthAudit({ registry, index, relationIndex });
    const snapshotState = { registry, index, relationIndex, cabins, health };
    const workbench = createObjectWorkbench(snapshotState);
    return Object.freeze({ ...snapshotState, workbench });
  }

  return Object.freeze({ registry, events, agentCatalog, snapshot });
}

module.exports = { createCabinRuntime };
