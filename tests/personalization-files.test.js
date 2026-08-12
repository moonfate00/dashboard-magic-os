"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { downloadTextFile, pickTextFile } = require("../src/config/personalization-files");
const { MAX_PERSONALIZATION_BYTES } = require("../src/config/personalization");

test("personalization download creates and revokes one local object URL", () => {
  const clicks = [];
  const revoked = [];
  class BlobMock {
    constructor(parts, options) { this.parts = parts; this.options = options; }
  }
  const environment = {
    Blob: BlobMock,
    URL: {
      createObjectURL(blob) {
        assert.deepEqual(blob.parts, ["{\"ok\":true}"]);
        return "blob:local";
      },
      revokeObjectURL(url) { revoked.push(url); }
    },
    document: {
      createElement(tag) {
        assert.equal(tag, "a");
        return { click() { clicks.push({ href: this.href, download: this.download, rel: this.rel }); } };
      }
    }
  };
  downloadTextFile("{\"ok\":true}", "preferences.json", environment);
  assert.deepEqual(clicks, [{ href: "blob:local", download: "preferences.json", rel: "noopener" }]);
  assert.deepEqual(revoked, ["blob:local"]);
});

test("personalization picker accepts one bounded JSON file", async () => {
  let input;
  const environment = {
    document: {
      createElement() {
        input = {
          files: [{ size: 12, async text() { return "{\"ok\":true}"; } }],
          handlers: {},
          addEventListener(type, handler) { this.handlers[type] = handler; },
          click() { this.handlers.change(); }
        };
        return input;
      }
    }
  };
  assert.equal(await pickTextFile(environment), "{\"ok\":true}");
  assert.equal(input.type, "file");
  assert.equal(input.multiple, false);
  assert.match(input.accept, /json/);
});

test("personalization picker rejects a file before reading when it exceeds the limit", async () => {
  let reads = 0;
  const environment = {
    document: {
      createElement() {
        return {
          files: [{ size: MAX_PERSONALIZATION_BYTES + 1, async text() { reads += 1; } }],
          handlers: {},
          addEventListener(type, handler) { this.handlers[type] = handler; },
          click() { this.handlers.change(); }
        };
      }
    }
  };
  await assert.rejects(pickTextFile(environment), (error) => error.code === "size");
  assert.equal(reads, 0);
});

test("personalization picker resolves cancellation without reading", async () => {
  const environment = {
    document: {
      createElement() {
        return {
          handlers: {},
          addEventListener(type, handler) { this.handlers[type] = handler; },
          click() { this.handlers.cancel(); }
        };
      }
    }
  };
  assert.equal(await pickTextFile(environment), null);
});
