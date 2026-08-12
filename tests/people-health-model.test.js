"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildPeopleHealthModel,
  healthRecordProjection,
  healthRecordType
} = require("../src/apps/people-health/model");

function record(id, type, title, frontmatter = {}, tags = []) {
  return {
    file: { path: `MagicOS/Records/Social/${id}.md` },
    path: `MagicOS/Records/Social/${id}.md`,
    title,
    name: title,
    type,
    module: "social",
    tags,
    frontmatter: {
      entity_id: id,
      type,
      module: "social",
      title,
      ...frontmatter
    }
  };
}

const person = record("person-a", "person", "Sample Person", {
  name: "Sample Person",
  relation_scope: "family",
  phone: "000-PRIVATE",
  email: "private@example.invalid",
  address: "Private address",
  notes: "Private person notes"
}, ["#type/person"]);
const checkup = record("health-a", "health-record", "Routine check", {
  person: "person-a",
  health_type: "checkup",
  date: "2026-08-10",
  diagnosis: "Synthetic private diagnosis",
  result: "Synthetic private result",
  summary: "Synthetic private summary",
  body: "Synthetic private body"
}, ["#health/checkup"]);
const medication = record("health-b", "health_record", "Medication log", {
  patient: { entity_id: "person-a" },
  date: "2026/08/09",
  medication: "Synthetic private medicine",
  dosage: "Synthetic private dosage"
}, ["#健康/用药"]);
const unassigned = record("health-c", "health-record", "Unassigned metric", {
  health_person: "missing-person",
  health_type: "metric",
  date: "20260808",
  measurement: "Synthetic private measurement"
});

test("people and health records resolve through stable relation fields", () => {
  const model = buildPeopleHealthModel([person, checkup, medication, unassigned]);
  assert.equal(model.people.length, 1);
  const projectedPerson = model.byId.get("person-a");
  assert.equal(projectedPerson.healthCount, 2);
  assert.deepEqual(projectedPerson.healthRecords.map((record) => record.id), ["health-a", "health-b"]);
  assert.deepEqual(projectedPerson.typeCounts, { checkup: 1, medication: 1 });
  assert.equal(model.unassigned.length, 1);
  assert.deepEqual(model.totals, { people: 1, healthRecords: 3, linkedRecords: 2, unassignedRecords: 1 });
});

test("public application model excludes health details and contact data", () => {
  const model = buildPeopleHealthModel([person, checkup, medication, unassigned]);
  const serialized = JSON.stringify({ people: model.people, unassigned: model.unassigned });
  [
    "000-PRIVATE",
    "private@example.invalid",
    "Private address",
    "Private person notes",
    "Synthetic private diagnosis",
    "Synthetic private result",
    "Synthetic private summary",
    "Synthetic private body",
    "Synthetic private medicine",
    "Synthetic private dosage",
    "Synthetic private measurement"
  ].forEach((secret) => assert.equal(serialized.includes(secret), false, `leaked ${secret}`));
});

test("health projection exposes only navigation-safe metadata", () => {
  const projection = healthRecordProjection(checkup);
  assert.deepEqual(Object.keys(projection).sort(), ["date", "file", "id", "path", "title", "type"]);
  assert.equal(projection.type, "checkup");
  assert.equal(projection.date, "2026-08-10");
  assert.equal("frontmatter" in projection, false);
  assert.equal(healthRecordType(medication), "medication");
});

test("system health checks remain outside the personal health model", () => {
  const systemHealth = {
    path: "MagicOS/System/health-check.md",
    title: "System health",
    type: "dashboard-health-report",
    module: "memory",
    tags: [],
    frontmatter: { entity_id: "system-health", type: "dashboard_health_report", module: "memory" }
  };
  const model = buildPeopleHealthModel([person, systemHealth]);
  assert.equal(model.totals.healthRecords, 0);
});
