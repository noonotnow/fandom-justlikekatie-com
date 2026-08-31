import test from "node:test";
import assert from "node:assert/strict";
import starOfDay from "./star-of-day.js";

function makeStore(entries = {}) {
  const values = new Map(Object.entries(entries));
  let listCalls = 0;
  let setCalls = 0;
  return {
    stats: () => ({ listCalls, setCalls }),
    async get(key, options) {
      const value = values.get(key);
      if (value === undefined) return null;
      return options?.type === "json" ? structuredClone(value) : value;
    },
    async list({ prefix } = {}) {
      listCalls += 1;
      return {
        blobs: [...values.keys()]
          .filter(key => !prefix || key.startsWith(prefix))
          .map(key => ({ key })),
      };
    },
    async setJSON(key, value) {
      setCalls += 1;
      values.set(key, structuredClone(value));
    },
    async delete(key) {
      values.delete(key);
    },
  };
}

function contextFor(store) {
  return { blobs: { getStore: () => store } };
}

function archivePayload(date, actorName = `Actor ${date}`) {
  return {
    version: "v5",
    date,
    actorName,
    actorShortNameEn: actorName,
    vibeEmoji: "✨",
    vibeLabel: "夜色",
    vibeLabelEn: "Night",
    vibeSubtitleEn: "A midnight assignment",
    rankedBatches: [{
      query: "archive query",
      results: [{ title: "Evidence", thumbnail: "https://images.test/evidence.jpg", link: "https://source.test", source: "Source" }],
      count: 1,
      distinctSources: 1,
      provider: "test",
    }],
  };
}

test("archive lists available payload dates with edition identity and excludes locks", async () => {
  const store = makeStore({
    "starOfDay:v5:2026-08-30": archivePayload("2026-08-30"),
    "starOfDay:v5:2026-08-29": archivePayload("2026-08-29"),
    "starOfDay:v5:2026-08-30:lock": { startedAt: Date.now() },
    "starOfDay:v4:2026-08-28": archivePayload("2026-08-28"),
  });

  const response = await starOfDay(
    { method: "GET", url: "https://example.test/star-of-day?archive=1" },
    contextFor(store),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.editions.map(edition => edition.date), [
    "2026-08-30",
    "2026-08-29",
  ]);
  assert.equal(body.editions[0].actorName, "Actor 2026-08-30");
});

test("historical date reads use the existing cache without starting a build", async () => {
  const archived = archivePayload("2026-08-29");
  const store = makeStore({ "starOfDay:v5:2026-08-29": archived });

  const response = await starOfDay(
    { method: "GET", url: "https://example.test/star-of-day?date=2026-08-29" },
    contextFor(store),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), archived);
  assert.deepEqual(store.stats(), { listCalls: 0, setCalls: 0 });
});

test("historical reads reject missing and future dates without touching cache locks", async () => {
  const store = makeStore();
  const missing = await starOfDay(
    { method: "GET", url: "https://example.test/star-of-day?date=2026-08-29" },
    contextFor(store),
  );
  const future = await starOfDay(
    { method: "GET", url: "https://example.test/star-of-day?date=2026-09-01" },
    contextFor(store),
  );

  assert.equal(missing.status, 404);
  assert.equal(future.status, 400);
  assert.deepEqual(store.stats(), { listCalls: 0, setCalls: 0 });
});