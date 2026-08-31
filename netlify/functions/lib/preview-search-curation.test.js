import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeProviderResults } from "../preview-search.js";

function item(id, overrides = {}) {
  return {
    title: "刘宇宁 月光大片",
    thumbnail: `https://images.test/${id}.jpg`,
    link: `https://editorial.test/story/${id}`,
    source: "editorial.test",
    ...overrides,
  };
}

test("same-source same-title frames remain available for event classification", () => {
  const sanitized = sanitizeProviderResults(
    [item("one"), item("two"), item("three")],
    "刘宇宁",
  );

  assert.equal(sanitized.length, 3);
});

test("existing textual actor contradictions still fail the universal gate", () => {
  const sanitized = sanitizeProviderResults(
    [
      item("correct"),
      item("wrong", { title: "张凌赫 月光大片" }),
    ],
    "刘宇宁",
  );

  assert.deepEqual(sanitized.map(result => result.thumbnail), [item("correct").thumbnail]);
});
