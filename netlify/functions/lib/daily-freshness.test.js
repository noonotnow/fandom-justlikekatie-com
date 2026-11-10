import test from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_DEEP_PASS_QUERY_LIMIT,
  countUnseen,
  deepPassPlan,
  freshnessRankings,
  partitionByHistory,
  publishedHistoryIndex,
  runDeepPass,
  wasPublished,
} from "./daily-freshness.js";

const manifest = (date, cards) => ({ publicationDate: date, cards });

test("history index matches by thumbnail, candidate id, checksum, and source fingerprint", () => {
  const index = publishedHistoryIndex([
    manifest("2026-09-02", [
      { candidateId: "c1", sourceUrl: "https://img.test/1.jpg", media: { checksum: "sum-1" } },
      { candidateId: "c2", sourceUrl: "https://img.test/2.jpg", source: "weibo.com", link: "https://weibo.com/p/2" },
    ]),
  ]);
  assert.equal(wasPublished({ thumbnail: "https://img.test/1.jpg" }, index), true);
  assert.equal(wasPublished({ thumbnail: "https://other.test/x.jpg", candidateId: "c1" }, index), true);
  assert.equal(wasPublished({ thumbnail: "https://other.test/y.jpg", imageChecksum: "sum-1" }, index), true);
  assert.equal(wasPublished({ thumbnail: "https://img.test/9.jpg" }, index), false);
  assert.equal(wasPublished(null, index), false);
});

test("only the most recent editions count as published", () => {
  const history = Array.from({ length: 8 }, (_, edition) =>
    manifest(`2026-09-${String(10 - edition).padStart(2, "0")}`, [
      { candidateId: `e${edition}`, sourceUrl: `https://img.test/e${edition}.jpg` },
    ]));
  const index = publishedHistoryIndex(history, 3);
  assert.equal(index.editionCount, 3);
  assert.equal(wasPublished({ thumbnail: "https://img.test/e2.jpg" }, index), true);
  assert.equal(wasPublished({ thumbnail: "https://img.test/e5.jpg" }, index), false);
});

test("partitioning deduplicates and keeps provider order inside each side", () => {
  const index = publishedHistoryIndex([manifest("d", [{ sourceUrl: "https://img.test/old.jpg" }])]);
  const results = [
    { thumbnail: "https://img.test/a.jpg", source: "a" },
    { thumbnail: "https://img.test/old.jpg", source: "o" },
    { thumbnail: "https://img.test/a.jpg", source: "a" },
    { thumbnail: "https://img.test/b.jpg", source: "b" },
    { title: "no thumbnail" },
  ];
  const { unseen, published } = partitionByHistory(results, index);
  assert.deepEqual(unseen.map(item => item.source), ["a", "b"]);
  assert.deepEqual(published.map(item => item.source), ["o"]);
  assert.equal(countUnseen([{ results }, { results }], index), 2);
});

test("freshness rankings degrade from unseen-only to the original order", () => {
  const index = publishedHistoryIndex([manifest("d", [{ sourceUrl: "https://img.test/old.jpg" }])]);
  const ranked = [{ query: "q", results: [
    { thumbnail: "https://img.test/old.jpg" },
    { thumbnail: "https://img.test/new.jpg" },
  ] }];
  const [unseenOnly, unseenFirst, original] = freshnessRankings(ranked, index);
  assert.deepEqual(unseenOnly.ranked[0].results.map(r => r.thumbnail), ["https://img.test/new.jpg"]);
  assert.deepEqual(unseenFirst.ranked.map(batch => batch.results.map(r => r.thumbnail)),
    [["https://img.test/new.jpg"], ["https://img.test/old.jpg"]]);
  assert.equal(original.ranked, ranked);
  assert.deepEqual(unseenFirst.ranked.map(batch => batch.query), ["q", "q"]);
  assert.equal(unseenFirst.ranked[1].publishedHistoryBatch, true);
});

test("deep pass plan rotates pages, bounds queries, and adds recent-upload rungs", () => {
  const queries = Array.from({ length: 10 }, (_, index) => `q${index}`);
  const first = deepPassPlan(queries, { priorEditionCount: 1 });
  const second = deepPassPlan(queries, { priorEditionCount: 2 });
  assert.equal(first.page, 2);
  assert.equal(second.page, 1);
  const paged = first.searches.filter(item => !item.recency);
  const recent = first.searches.filter(item => item.recency);
  assert.equal(paged.length, DAILY_DEEP_PASS_QUERY_LIMIT);
  assert.ok(paged.every(item => item.page === 2));
  assert.deepEqual(recent.map(item => [item.query, item.page, item.recency]), [["q0", 0, "year"], ["q1", 0, "year"]]);
  assert.deepEqual(deepPassPlan(["a", "a", " ", "b"]).searches.filter(i => !i.recency).map(i => i.query), ["a", "b"]);
});

test("deep pass tags each batch with the window that produced it", async () => {
  const calls = [];
  const batches = await runDeepPass(deepPassPlan(["q"], { priorEditionCount: 0 }), {
    search: async (query, window) => { calls.push([query, window]); return { results: [] }; },
    evaluate: async (queries, search) => {
      await search(queries[0]);
      return [{ query: queries[0], results: [] }];
    },
  });
  assert.deepEqual(calls, [["q", { page: 1, recency: null }], ["q", { page: 0, recency: "year" }]]);
  assert.deepEqual(batches.map(batch => batch.searchWindow), [{ page: 1, recency: null }, { page: 0, recency: "year" }]);
});
