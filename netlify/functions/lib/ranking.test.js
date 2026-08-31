import test from "node:test";
import assert from "node:assert/strict";
import { rankCandidates } from "./ranking.js";

test("ranking ties are deterministic for the same candidate pool", () => {
  const candidates = [
    { query: "刘宇宁 月光 C", count: 9, distinctSources: 5, provider: "test", results: [] },
    { query: "刘宇宁 月光 A", count: 9, distinctSources: 5, provider: "test", results: [] },
    { query: "刘宇宁 月光 B", count: 9, distinctSources: 5, provider: "test", results: [] },
  ];

  const first = rankCandidates(structuredClone(candidates)).map(item => item.query);
  const second = rankCandidates(structuredClone(candidates)).map(item => item.query);

  assert.deepEqual(first, [
    "刘宇宁 月光 A",
    "刘宇宁 月光 B",
    "刘宇宁 月光 C",
  ]);
  assert.deepEqual(second, first);
});
