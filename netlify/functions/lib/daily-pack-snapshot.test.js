import assert from "node:assert/strict";
import test from "node:test";
import { publicManifest } from "../public-test-fixture.js";
import { resolveDailyPackSnapshot, safeDailySnapshot } from "./daily-pack-snapshot.js";
import { gridManifestKey } from "./publication-manifest.js";

const date = "2026-09-25";
const actorId = "liu-yuning";
const vibeIdx = 2;
const packs = [{
  id: actorId,
  name: "刘宇宁",
  shortName_en: "Liu Yuning",
  vibes: [{}, {}, { label_en: "Boyfriend Lighting", subtitle_en: "Warm light" }],
}];
const approval = { eligible: true, runId: "approved-run", verdict: "approved_override" };
const manifest = {
  ...publicManifest({ date, actorId, completeEditorial: false }),
  vibe: {
    ...publicManifest({ date, actorId, completeEditorial: false }).vibe,
    idx: vibeIdx,
    key: `${actorId}:${vibeIdx}`,
  },
};

test("a MEDIA-backed first grid can be a safe daily teaser without indexable editorial copy", async () => {
  let writes = 0;
  const result = await resolveDailyPackSnapshot({
    store: { get: async key => key === gridManifestKey(date) ? manifest : null },
    eligibilityStore: {},
    date, actorId, vibeIdx, today: "2026-09-26", packs,
    eligibilityReader: async () => approval,
    materialize: async () => { writes += 1; },
  });
  assert.equal(result.kind, "vibe-atlas-daily-pack-snapshot");
  assert.equal(result.cards.length, 9);
  assert.equal(writes, 0);
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
  assert.equal(safeDailySnapshot({ ...manifest, cards: [] }), null);
});

test("an unpublished first cached board materializes exactly that grid and rechecks approval", async () => {
  const candidates = Array.from({ length: 9 }, (_, position) => ({
    title: `Result ${position}`,
    thumbnail: `https://images.example/${position}.jpg`,
    candidateId: `candidate-${position}`,
  }));
  let call;
  const result = await resolveDailyPackSnapshot({
    store: {
      get: async key => key === `starOfDay:v11:${date}` ? {
        version: "v11", date, actorId, vibeIdx, displayResults: candidates,
      } : null,
    },
    eligibilityStore: {},
    date, actorId, vibeIdx, today: "2026-09-26", packs,
    eligibilityReader: async () => approval,
    materialize: async input => {
      call = input;
      await input.validateBeforeCommit();
      return { manifest };
    },
  });
  assert.equal(result.cards.length, 9);
  assert.deepEqual(call.board.candidates.map(item => item.thumbnail), candidates.map(item => item.thumbnail));
  assert.equal(call.provenance.sourceType, "daily_cache_snapshot");
  assert.equal(call.vibe.idx, 2);
});

test("no unapproved, stale, or unrelated cached grid becomes a teaser", async () => {
  let materializations = 0;
  const store = {
    get: async key => key === `starOfDay:v11:${date}` ? {
      version: "v11", date, actorId: "other-actor", vibeIdx,
      displayResults: Array.from({ length: 9 }, (_, i) => ({
        thumbnail: `https://images.example/${i}.jpg`, candidateId: `candidate-${i}`,
      })),
    } : null,
  };
  const options = {
    store, eligibilityStore: {}, date, actorId, vibeIdx, today: "2026-09-26", packs,
    materialize: async () => { materializations += 1; },
  };
  assert.equal(await resolveDailyPackSnapshot({
    ...options, eligibilityReader: async () => ({ ...approval, verdict: "pending" }),
  }), null);
  assert.equal(await resolveDailyPackSnapshot({
    ...options, eligibilityReader: async () => approval,
  }), null);
  assert.equal(materializations, 0);
});

test("a failed media registration is not retried for every visitor", async () => {
  const data = new Map([[
    `starOfDay:v11:${date}`,
    {
      version: "v11", date, actorId, vibeIdx,
      displayResults: Array.from({ length: 9 }, (_, i) => ({
        thumbnail: `https://images.example/${i}.jpg`, candidateId: `candidate-${i}`,
      })),
    },
  ]]);
  const store = {
    get: async key => data.get(key) || null,
    setJSON: async (key, value) => { data.set(key, value); },
  };
  let attempts = 0;
  const options = {
    store, eligibilityStore: {}, date, actorId, vibeIdx, today: "2026-09-26", packs,
    eligibilityReader: async () => approval,
    materialize: async () => { attempts += 1; throw new Error("MEDIA unavailable"); },
  };
  await assert.rejects(resolveDailyPackSnapshot(options), /MEDIA unavailable/);
  await assert.rejects(resolveDailyPackSnapshot(options), /temporarily unavailable/);
  assert.equal(attempts, 1);
});