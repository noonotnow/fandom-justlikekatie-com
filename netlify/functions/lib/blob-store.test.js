import assert from "node:assert/strict";
import test from "node:test";
import { getBlobStore } from "./blob-store.js";

test("passes strong-consistency store options through the V2 function context", () => {
  let input;
  const expected = {};
  const actual = getBlobStore("idea-packets", {
    blobs: {
      getStore(value) {
        input = value;
        return expected;
      },
    },
  }, { consistency: "strong" });
  assert.equal(actual, expected);
  assert.deepEqual(input, { name: "idea-packets", consistency: "strong" });
});
