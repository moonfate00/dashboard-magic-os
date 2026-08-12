"use strict";

const {
  buildRecordQueryIndex,
  isHealthRecord,
  isPersonRecord,
  recordEntityId,
  recordFrontmatter,
  recordType
} = require("../../services/record-query");
const {
  buildRecordRelationIndex,
  relatedRecords
} = require("../../services/record-relations");

const HEALTH_TYPES = new Set(["checkup", "medication", "metric", "allergy", "procedure", "symptom", "medical"]);

function dateKey(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function healthRecordDate(record) {
  const frontmatter = recordFrontmatter(record);
  return [frontmatter.date, frontmatter.event_date, frontmatter.recorded_at, frontmatter.created, frontmatter.updated]
    .map(dateKey)
    .find(Boolean) || "";
}

function healthRecordType(record) {
  const frontmatter = recordFrontmatter(record);
  const raw = String(frontmatter.health_type || "").trim().toLowerCase().replace(/_/g, "-");
  if (HEALTH_TYPES.has(raw)) return raw;
  const tags = Array.isArray(record?.tags) ? record.tags.map(String).join(" ").toLowerCase() : "";
  if (/用药|medication/.test(tags)) return "medication";
  if (/过敏|allergy/.test(tags)) return "allergy";
  if (/指标|metric|vitals|weight/.test(tags)) return "metric";
  if (/手术|procedure/.test(tags)) return "procedure";
  if (/症状|symptom/.test(tags)) return "symptom";
  if (/体检|checkup/.test(tags)) return "checkup";
  return recordType(record) === "health-record" ? "medical" : "medical";
}

function healthRecordProjection(record) {
  const frontmatter = recordFrontmatter(record);
  return Object.freeze({
    id: recordEntityId(record) || String(record?.path || ""),
    file: record?.file || null,
    path: String(record?.path || ""),
    title: String(frontmatter.title || record?.title || record?.name || ""),
    date: healthRecordDate(record),
    type: healthRecordType(record)
  });
}

function personProjection(record, healthRecords) {
  const frontmatter = recordFrontmatter(record);
  const records = healthRecords.map(healthRecordProjection)
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  const typeCounts = records.reduce((counts, item) => {
    counts[item.type] = (counts[item.type] || 0) + 1;
    return counts;
  }, {});
  return Object.freeze({
    id: recordEntityId(record) || String(record?.path || ""),
    file: record?.file || null,
    path: String(record?.path || ""),
    name: String(frontmatter.name || frontmatter.title || record?.title || record?.name || ""),
    relationScope: String(frontmatter.relation_scope || ""),
    healthCount: records.length,
    latestDate: records[0]?.date || "",
    typeCounts: Object.freeze(typeCounts),
    healthRecords: Object.freeze(records)
  });
}

function buildPeopleHealthModel(records = []) {
  const recordIndex = buildRecordQueryIndex(records);
  const relationIndex = buildRecordRelationIndex(recordIndex, {
    fieldRules: [
      { field: "person", type: "person-health", sourcePredicate: isHealthRecord, targetPredicate: isPersonRecord },
      { field: "patient", type: "person-health", sourcePredicate: isHealthRecord, targetPredicate: isPersonRecord },
      { field: "related_person", type: "person-health", sourcePredicate: isHealthRecord, targetPredicate: isPersonRecord },
      { field: "health_person", type: "person-health", sourcePredicate: isHealthRecord, targetPredicate: isPersonRecord },
      { field: "subject", type: "person-health", sourcePredicate: isHealthRecord, targetPredicate: isPersonRecord }
    ]
  });
  const assignedPaths = new Set();
  const people = recordIndex.people.map((person) => {
    const health = relatedRecords(relationIndex, person, {
      direction: "incoming",
      types: ["person-health"],
      recordPredicate: isHealthRecord
    });
    health.forEach((record) => assignedPaths.add(record.path));
    return personProjection(person, health);
  }).sort((a, b) => b.healthCount - a.healthCount || b.latestDate.localeCompare(a.latestDate) || a.name.localeCompare(b.name));
  const unassigned = recordIndex.healthRecords
    .filter((record) => !assignedPaths.has(record.path))
    .map(healthRecordProjection)
    .sort((a, b) => b.date.localeCompare(a.date));
  return Object.freeze({
    people: Object.freeze(people),
    byId: new Map(people.map((person) => [person.id, person])),
    unassigned: Object.freeze(unassigned),
    totals: Object.freeze({
      people: people.length,
      healthRecords: recordIndex.healthRecords.length,
      linkedRecords: assignedPaths.size,
      unassignedRecords: unassigned.length
    })
  });
}

module.exports = {
  buildPeopleHealthModel,
  dateKey,
  healthRecordDate,
  healthRecordProjection,
  healthRecordType,
  personProjection
};
