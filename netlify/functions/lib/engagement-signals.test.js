import test from "node:test";
import assert from "node:assert/strict";
import {
  ENGAGEMENT_BOARD_BONUS_CAP,
  audienceEngagementBonus,
  candidateEngagement,
  dailyCardSavePrefix,
  dailyExportIndexPrefix,
  editionInteractionWeights,
  engagementProfileFromEditions,
  readPairEngagementProfile,
} from "./engagement-signals.js";

function memoryStore(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async list({ prefix = "" } = {}) {
      return { blobs: [...values.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    },
  };
}

function manifest(date, sources, query = "q-base") {
  return {
    publicationDate: date,
    actor: { id: "liu" },
    cards: sources.map((source, position) => ({
      position,
      candidateId: `${date}-${position}`,
      source,
      query: position === 4 ? "q-hero" : query,
      sourceUrl: `https://img.test/${date}-${position}.jpg`,
      media: { thumbnailUrl: `https://media.test/${date}-${position}.webp` },
    })),
  };
}

const sources = ["weibo.com", "douban.com", "sohu.com", "163.com", "weibo.com", "qq.com", "sina.com", "ifeng.com", "toutiao.com"];

test("saves net out unsaves and exports add half weight per matched card", async () => {
  const date = "2026-09-01";
  const store = memoryStore({
    [`${dailyCardSavePrefix(date)}1`]: { editionDate: date, position: 0, saved: true },
    [`${dailyCardSavePrefix(date)}2`]: { editionDate: date, position: 0, saved: true },
    [`${dailyCardSavePrefix(date)}3`]: { editionDate: date, position: 0, saved: false },
    [`${dailyCardSavePrefix(date)}4`]: { editionDate: date, position: 2, saved: false },
    [`${dailyCardSavePrefix(date)}5`]: { editionDate: date, position: 12, saved: true },
    [`${dailyExportIndexPrefix(date)}1`]: { actorId: "liu", imageIds: [`https://media.test/${date}-4.webp`, `${date}-4`] },
    [`${dailyExportIndexPrefix(date)}2`]: { actorId: "someone-else", imageIds: [`${date}-1`] },
  });
  const weights = await editionInteractionWeights(store, manifest(date, sources));
  assert.deepEqual(weights, [1, 0, 0, 0, 0.5, 0, 0, 0, 0]);
});

test("a source readers keep saving across editions becomes a positive signal", () => {
  const editions = ["2026-09-01", "2026-09-05", "2026-09-09"].map(date => ({
    manifest: manifest(date, sources),
    // Readers save the two weibo.com cards (positions 0 and 4) every time.
    weights: [3, 0, 0, 0, 3, 0, 0, 0, 0],
  }));
  const profile = engagementProfileFromEditions(editions);
  assert.equal(profile.evidenceEditionCount, 3);
  assert.deepEqual(profile.positiveSources, ["weibo.com"]);
  assert.ok(profile.negativeSources.includes("douban.com"));
  assert.deepEqual(profile.positiveQueries, ["q-hero"]);
  assert.match(profile.fingerprint, /^[a-f0-9]{16}$/);
});

test("one enthusiastic edition is not enough to learn from", () => {
  const profile = engagementProfileFromEditions([
    { manifest: manifest("2026-09-01", sources), weights: [9, 0, 0, 0, 9, 0, 0, 0, 0] },
  ]);
  assert.equal(profile, null);
  assert.equal(engagementProfileFromEditions([{ manifest: manifest("d", sources), weights: new Array(9).fill(0) }]), null);
});

test("reading a profile fails soft and needs history", async () => {
  assert.equal(await readPairEngagementProfile(memoryStore(), []), null);
  assert.equal(await readPairEngagementProfile({
    get: async () => null,
    list: async () => { throw new Error("blob outage"); },
  }, [manifest("2026-09-01", sources)]), null);
});

test("candidate and board signals stay small and symmetric", () => {
  const profile = {
    positiveSources: ["weibo.com"], negativeSources: ["sohu.com"],
    positiveQueries: ["q-hero"], negativeQueries: [],
  };
  assert.deepEqual(candidateEngagement({ source: "Weibo.com", batchKey: "q-hero" }, profile).positive,
    ["source:weibo.com", "query:q-hero"]);
  assert.equal(candidateEngagement({ source: "weibo.com", batchKey: "q-hero" }, profile).score, 1);
  assert.equal(candidateEngagement({ source: "sohu.com" }, profile).score, -0.5);
  assert.equal(candidateEngagement({ source: "weibo.com" }, null).score, 0);
  const allPositive = Array.from({ length: 9 }, () => ({ engagement: { score: 1 } }));
  const allNegative = Array.from({ length: 9 }, () => ({ engagement: { score: -1 } }));
  assert.equal(audienceEngagementBonus(allPositive), ENGAGEMENT_BOARD_BONUS_CAP);
  assert.equal(audienceEngagementBonus(allNegative), -ENGAGEMENT_BOARD_BONUS_CAP);
  assert.equal(audienceEngagementBonus([{ engagement: { score: 0 } }]), 0);
});
