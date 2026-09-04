"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { social, socialScope } = require("../src/cabins");

test("every public social view declares the shared scope facet", () => {
  assert.deepEqual(social.views.map((view) => view.id), [
    "archive-hub",
    "directory",
    "relations",
    "interactions",
    "interaction-matrix",
    "items",
    "followups",
    "health-ledger",
    "privacy"
  ]);
  social.views.forEach((view) => assert.deepEqual(view.filters, ["scope"]));
});

test("scope filtering separates public learning material from private life records", () => {
  const records = [
    { path: "Social/People/Historical.md", frontmatter: { type: "person", scope: "public" } },
    { path: "Social/Events/History.md", frontmatter: { type: "social-event", privacy: "public" } },
    { path: "Social/People/Family.md", frontmatter: { type: "person", scope: "personal" } },
    { path: "Social/Health/Checkup.md", frontmatter: { type: "health-record", privacy: "private" } },
    { path: "Social/Items/Legacy.md", frontmatter: { type: "social-item" } }
  ];

  assert.deepEqual(socialScope.socialScopeCounts(records), { all: 5, public: 2, personal: 3 });
  assert.deepEqual(socialScope.filterSocialRecords(records, "public").map((record) => record.path), [
    "Social/People/Historical.md",
    "Social/Events/History.md"
  ]);
  assert.deepEqual(socialScope.filterSocialRecords(records, "personal").map((record) => record.path), [
    "Social/People/Family.md",
    "Social/Health/Checkup.md",
    "Social/Items/Legacy.md"
  ]);
});
