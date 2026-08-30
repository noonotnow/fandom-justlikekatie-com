import assert from "node:assert/strict";
import test from "node:test";
import {
  createWatchJournalHandler,
  emptyWatchJournal,
} from "./watch-journal.js";

const ORIGIN = "https://fandom.example";

function memoryStore() {
  const records = new Map();
  let revision = 0;
  return {
    async get(key) {
      return structuredClone(records.get(key)?.data ?? null);
    },
    async getWithMetadata(key) {
      const record = records.get(key);
      return record ? { data: structuredClone(record.data), etag: record.etag } : null;
    },
    async setJSON(key, value, options = {}) {
      const current = records.get(key);
      if (options.onlyIfNew && current) return { modified: false };
      if (options.onlyIfMatch && options.onlyIfMatch !== current?.etag) return { modified: false };
      revision += 1;
      records.set(key, { data: structuredClone(value), etag: `etag-${revision}` });
      return { modified: true };
    },
    records,
  };
}

function makeHandler({
  accountId = "account-a",
  store = memoryStore(),
  authenticateAdmin,
} = {}) {
  let id = 0;
  const auth = {
    authenticateAdmin: authenticateAdmin || (async () => ({
      user: { accountId, email: "admin@example.com" },
    })),
  };
  const handler = createWatchJournalHandler({
    auth,
    getStore: () => store,
    now: () => new Date("2026-08-30T18:00:00.000Z"),
    randomId: () => `id-${accountId}-${++id}`,
  });
  return { handler, store };
}

function request(method = "GET", body, query = "", origin = ORIGIN) {
  return new Request(`${ORIGIN}/.netlify/functions/watch-journal${query}`, {
    method,
    headers: method === "GET" ? {} : {
      origin,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function entryInput(overrides = {}) {
  return {
    action: "file-entry",
    episodeStart: 1,
    episodeEnd: 4,
    emotionalCondition: "Alert and confused",
    trustedPeople: ["Person I trust"],
    distrustedPeople: ["Person I do not trust"],
    relationshipMonitored: "A relationship",
    recurringSuspects: ["An object"],
    currentTheory: "Something is happening.",
    predictions: ["This will matter later."],
    ...overrides,
  };
}

async function body(response) {
  return response.json();
}

test("watch journal requires an authenticated admin for every operation", async () => {
  const { handler } = makeHandler({
    authenticateAdmin: async () => {
      const error = new Error("Sign in is required.");
      error.status = 401;
      throw error;
    },
  });
  assert.equal((await handler(request("GET"))).status, 401);
  assert.equal((await handler(request("POST", entryInput()))).status, 401);

  const denied = makeHandler({
    authenticateAdmin: async () => {
      const error = new Error("Admin access is required.");
      error.status = 403;
      throw error;
    },
  });
  assert.equal((await denied.handler(request("GET"))).status, 403);
});

test("empty state contains only the supplied series label and no journal content", async () => {
  const { handler } = makeHandler();
  const response = await handler(request("GET"));
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), { journal: emptyWatchJournal() });
});

test("storage ownership comes from the authenticated account, never the browser body", async () => {
  const store = memoryStore();
  const accountA = makeHandler({ accountId: "account-a", store });
  const accountB = makeHandler({ accountId: "account-b", store });

  const filed = await accountA.handler(request("POST", entryInput({
    accountId: "account-b",
    seriesId: "different-series",
    watchedThroughEpisode: 999,
  })));
  assert.equal(filed.status, 200);
  const aJournal = (await body(await accountA.handler(request("GET")))).journal;
  const bJournal = (await body(await accountB.handler(request("GET")))).journal;

  assert.equal(aJournal.entries.length, 1);
  assert.equal(aJournal.entries[0].seriesId, "the-untamed");
  assert.equal(aJournal.entries[0].watchedThroughEpisode, 4);
  assert.equal(bJournal.entries.length, 0);
  assert.deepEqual([...store.records.keys()].sort(), ["accounts/account-a/the-untamed"]);
});

test("filing is append-only and preserves each point-in-time episode boundary", async () => {
  const { handler } = makeHandler();
  const first = (await body(await handler(request("POST", entryInput())))).journal;
  const original = structuredClone(first.entries[0]);
  const second = (await body(await handler(request("POST", entryInput({
    episodeStart: 5,
    episodeEnd: 7,
    emotionalCondition: "More suspicious",
    currentTheory: "A new theory.",
    predictions: [],
  }))))).journal;

  assert.equal(second.entries.length, 2);
  assert.deepEqual(second.entries[0], original);
  assert.equal(second.entries[0].watchedThroughEpisode, 4);
  assert.equal(second.entries[1].watchedThroughEpisode, 7);
  assert.equal(second.entries[1].recordedAt, "2026-08-30T18:00:00.000Z");
});

test("first-watch entries must advance contiguously from Episode 1", async () => {
  const { handler } = makeHandler();
  assert.equal((await handler(request("POST", entryInput({
    episodeStart: 2,
    episodeEnd: 4,
  })))).status, 400);

  await handler(request("POST", entryInput()));
  for (const range of [
    { episodeStart: 1, episodeEnd: 4 },
    { episodeStart: 3, episodeEnd: 5 },
    { episodeStart: 6, episodeEnd: 8 },
    { episodeStart: 50, episodeEnd: 55 },
  ]) {
    assert.equal((await handler(request("POST", entryInput(range)))).status, 400);
  }
  const journal = (await body(await handler(request("GET")))).journal;
  assert.equal(journal.entries.length, 1);
  assert.equal(journal.entries[0].watchedThroughEpisode, 4);

  const prediction = journal.predictions[0];
  const premature = await handler(request("POST", {
    action: "resolve-prediction",
    predictionId: prediction.id,
    resolutionEpisode: 50,
    verdict: "vindicated",
    postRevealReaction: "A gap must not unlock this.",
  }));
  assert.equal(premature.status, 400);

  const next = await handler(request("POST", entryInput({
    episodeStart: 5,
    episodeEnd: 8,
  })));
  assert.equal(next.status, 200);
});

test("prediction text and filed boundary remain immutable when a verdict is recorded", async () => {
  const { handler } = makeHandler();
  const filed = (await body(await handler(request("POST", entryInput())))).journal;
  const prediction = filed.predictions[0];
  await handler(request("POST", entryInput({
    episodeStart: 5,
    episodeEnd: 9,
    predictions: [],
  })));
  const resolvedResponse = await handler(request("POST", {
    action: "resolve-prediction",
    predictionId: prediction.id,
    originalText: "Browser tried to replace the prediction.",
    filedAfterEpisode: 1,
    resolutionEpisode: 9,
    verdict: "catastrophically-wrong",
    postRevealReaction: "I reject the evidence.",
  }));
  assert.equal(resolvedResponse.status, 200);
  const resolved = (await body(resolvedResponse)).journal.predictions[0];

  assert.equal(resolved.originalText, "This will matter later.");
  assert.equal(resolved.filedAfterEpisode, 4);
  assert.deepEqual(resolved.resolution, {
    resolutionEpisode: 9,
    verdict: "catastrophically-wrong",
    postRevealReaction: "I reject the evidence.",
    resolvedAt: "2026-08-30T18:00:00.000Z",
  });

  const invalid = await handler(request("POST", {
    action: "resolve-prediction",
    predictionId: prediction.id,
    resolutionEpisode: 3,
    verdict: "vindicated",
    postRevealReaction: "Too early.",
  }));
  assert.equal(invalid.status, 409);
  const stillResolved = (await body(await handler(request("GET")))).journal.predictions[0];
  assert.deepEqual(stillResolved.resolution, resolved.resolution);
});

test("a prediction resolution remains sealed until the reader reaches its resolution episode", async () => {
  const { handler } = makeHandler();
  const filed = (await body(await handler(request("POST", entryInput())))).journal;
  const prediction = filed.predictions[0];
  const premature = await handler(request("POST", {
    action: "resolve-prediction",
    predictionId: prediction.id,
    resolutionEpisode: 9,
    verdict: "vindicated",
    postRevealReaction: "This must not save yet.",
  }));
  assert.equal(premature.status, 400);
  await handler(request("POST", entryInput({
    episodeStart: 5,
    episodeEnd: 9,
    predictions: [],
  })));
  await handler(request("POST", {
    action: "resolve-prediction",
    predictionId: prediction.id,
    resolutionEpisode: 9,
    verdict: "vindicated",
    postRevealReaction: "The theory survived.",
  }));

  const throughEight = await body(await handler(request("GET", undefined, "?audience=reader&safeThroughEpisode=8")));
  assert.equal(throughEight.journal.predictions[0].resolution, null);
  const throughNine = await body(await handler(request("GET", undefined, "?audience=reader&safeThroughEpisode=9")));
  assert.equal(throughNine.journal.predictions[0].resolution.resolutionEpisode, 9);
});

test("prediction-linked evidence cannot reveal a still-hidden resolution", async () => {
  const { handler } = makeHandler();
  const filed = (await body(await handler(request("POST", entryInput())))).journal;
  const prediction = filed.predictions[0];
  await handler(request("POST", {
    action: "add-evidence",
    predictionId: prediction.id,
    unlockEpisode: 4,
    interpretation: "This evidence explains the eventual answer.",
  }));
  await handler(request("POST", entryInput({
    episodeStart: 5,
    episodeEnd: 9,
    predictions: [],
  })));
  await handler(request("POST", {
    action: "resolve-prediction",
    predictionId: prediction.id,
    resolutionEpisode: 9,
    verdict: "vindicated",
    postRevealReaction: "The theory survived.",
  }));

  const throughEight = await body(await handler(request("GET", undefined, "?audience=reader&safeThroughEpisode=8")));
  assert.equal(throughEight.journal.evidence.length, 0);
  const throughNine = await body(await handler(request("GET", undefined, "?audience=reader&safeThroughEpisode=9")));
  assert.equal(throughNine.journal.evidence.length, 1);

  const rejected = await handler(request("POST", {
    action: "add-evidence",
    predictionId: prediction.id,
    unlockEpisode: 8,
    interpretation: "Too early.",
  }));
  assert.equal(rejected.status, 400);
});

test("sealed evidence is returned only when both its unlock and related record are reader-safe", async () => {
  const { handler } = makeHandler();
  const first = (await body(await handler(request("POST", entryInput())))).journal;
  const entry = first.entries[0];
  const prediction = first.predictions[0];
  const sealed = await handler(request("POST", {
    action: "add-evidence",
    entryId: entry.id,
    predictionId: prediction.id,
    unlockEpisode: 8,
    interpretation: "Veteran-only context.",
  }));
  assert.equal(sealed.status, 200);
  await handler(request("POST", entryInput({
    episodeStart: 5,
    episodeEnd: 10,
    predictions: ["A later prediction."],
  })));
  const full = (await body(await handler(request("GET")))).journal;
  const futureEntry = full.entries[1];
  await handler(request("POST", {
    action: "add-evidence",
    entryId: futureEntry.id,
    unlockEpisode: 5,
    interpretation: "Linked to a future entry.",
  }));

  const throughFour = await body(await handler(request("GET", undefined, "?audience=reader&safeThroughEpisode=4")));
  assert.equal(throughFour.journal.entries.length, 1);
  assert.equal(throughFour.journal.evidence.length, 0);

  const throughEight = await body(await handler(request("GET", undefined, "?audience=reader&safeThroughEpisode=8")));
  assert.equal(throughEight.journal.entries.length, 1);
  assert.deepEqual(throughEight.journal.evidence.map(item => item.interpretation), ["Veteran-only context."]);

  const throughTen = await body(await handler(request("GET", undefined, "?audience=reader&safeThroughEpisode=10")));
  assert.equal(throughTen.journal.entries.length, 2);
  assert.equal(throughTen.journal.evidence.length, 2);
});

test("reader delivery fails closed for missing or malformed safe-through settings", async () => {
  const { handler } = makeHandler();
  for (const query of [
    "?audience=reader",
    "?audience=reader&safeThroughEpisode=",
    "?audience=reader&safeThroughEpisode=not-an-episode",
    "?audience=reader&safeThroughEpisode=0",
    "?audience=reader&safeThroughEpisode=4.5",
  ]) {
    assert.equal((await handler(request("GET", undefined, query))).status, 400, query);
  }
});

test("missing or malformed evidence unlocks are rejected or filtered rather than revealed", async () => {
  const { handler, store } = makeHandler();
  const journal = (await body(await handler(request("POST", entryInput())))).journal;
  assert.equal((await handler(request("POST", {
    action: "add-evidence",
    entryId: journal.entries[0].id,
    interpretation: "No unlock boundary.",
  }))).status, 400);

  const key = "accounts/account-a/the-untamed";
  const stored = structuredClone(store.records.get(key).data);
  stored.evidence.push({
    schemaVersion: 1,
    id: "corrupt-evidence",
    entryId: journal.entries[0].id,
    predictionId: null,
    interpretation: "This must never escape.",
    submittedAt: "2026-08-30T18:00:00.000Z",
  });
  store.records.set(key, { data: stored, etag: store.records.get(key).etag });

  const reader = await body(await handler(request("GET", undefined, "?audience=reader&safeThroughEpisode=999")));
  assert.equal(reader.journal.evidence.length, 0);
});