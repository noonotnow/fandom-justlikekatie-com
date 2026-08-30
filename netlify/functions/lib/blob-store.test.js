import assert from "node:assert/strict";
import test from "node:test";
import { getBlobStore } from "./blob-store.js";

test("uses the store name with the V2 function context", () => {
  let input;
  const expected = {};
  const actual = getBlobStore("test-blob-store", {
    blobs: {
      getStore(value) {
        input = value;
        return expected;
      },
    },
  }, { consistency: "strong" });
  assert.equal(actual, expected);
  assert.equal(input, "test-blob-store");
});
