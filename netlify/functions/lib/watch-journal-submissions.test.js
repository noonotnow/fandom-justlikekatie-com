import assert from "node:assert/strict";
import test from "node:test";
import { createWatchJournalHandler } from "./watch-journal.js";

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

function environment({ rotateAnonymousActors = false } = {}) {
  const stores = new Map();
  let id = 0;
  let actor = 0;
  const getStore = name => {
    if (!stores.has(name)) stores.set(name, memoryStore());
    return stores.get(name);
  };
  const auth = {
    authenticateAdmin: async req => {
      if (req.headers.get("x-test-admin") !== "yes") {
        const error = new Error("Admin access is required.");
        error.status = 403;
        throw error;
      }
      return {
        user: {
          accountId: req.headers.get("x-test-account") === "operator-b" ? "operator-b" : "operator-a",
          email: "admin@example.com",
        },
      };
    },
    getPublicActor: async req => ({
      ownerId: rotateAnonymousActors
        ? `anon-rotating-${++actor}`
        : req.headers.get("cookie") === "veteran=beta" ? "anon-beta" : "anon-alpha",
      setCookie: null,
    }),
  };
  return {
    handler: createWatchJournalHandler({
      auth,
      getStore,
      now: () => new Date("2026-08-30T18:00:00.000Z"),
      randomId: () => `submission-id-${++id}`,
    }),
    getStore,
  };
}

function request(method = "GET", body, query = "", options = {}) {
  const headers = new Headers(options.headers);
  if (method !== "GET") {
    headers.set("origin", options.origin || ORIGIN);
    headers.set("content-type", "application/json");
  }
  if (options.admin) headers.set("x-test-admin", "yes");
  if (options.account) headers.set("x-test-account", options.account);
  if (options.actor === "beta") headers.set("cookie", "veteran=beta");
  if (options.ip) headers.set("x-nf-client-connection-ip", options.ip);
  return new Request(`${ORIGIN}/.netlify/functions/watch-journal${query}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function entryInput(overrides = {}) {
  return {
    action: "file-entry",
    episodeStart: 1,
    episodeEnd: 4,
    emotionalCondition: "Suspicious",
    trustedPeople: [],
    distrustedPeople: [],
    relationshipMonitored: "One relationship",
    recurringSuspects: [],
    currentTheory: "A first-watch theory.",
    predictions: ["This is prediction text that public targets must not expose."],
    ...overrides,
  };
}

async function json(response) {
  return response.json();
}

async function fileFirstEntry(handler) {
  const response = await handler(request("POST", entryInput(), "", { admin: true }));
  assert.equal(response.status, 200);
  const result = await json(response);
  const publicLink = await json(await handler(request("GET", undefined, "?audience=public-link", { admin: true })));
  return { ...result, publicJournalId: publicLink.publicJournalId };
}

test("anonymous veteran ownership is server-derived and submissions stay outside the private journal store", async () => {
  const { handler, getStore } = environment();
  const { journal, publicJournalId } = await fileFirstEntry(handler);
  const entryId = journal.entries[0].id;

  const targetsResponse = await handler(request("GET", undefined, `?audience=targets&journal=${publicJournalId}`));
  assert.equal(targetsResponse.status, 200);
  const targetsText = await targetsResponse.text();
  assert.doesNotMatch(targetsText, /prediction text|theory/i);

  const submitted = await handler(request("POST", {
    action: "submit-veteran",
    journalId: publicJournalId,
    ownerId: "anon-beta",
    entryId,
    unlockEpisode: 4,
    interpretation: "Alpha browser's sealed interpretation.",
    consent: true,
  }));
  assert.equal(submitted.status, 201);

  const alpha = await json(await handler(request("GET", undefined, `?audience=submissions&journal=${publicJournalId}`)));
  const beta = await json(await handler(request("GET", undefined, `?audience=submissions&journal=${publicJournalId}`, { actor: "beta" })));
  assert.equal(alpha.submissions.length, 1);
  assert.equal(beta.submissions.length, 0);

  const journalStore = getStore("fandom-watch-journals");
  const submissionStore = getStore("fandom-watch-journal-submissions");
  assert.deepEqual([...journalStore.records.keys()], ["accounts/operator-a/the-untamed"]);
  assert.ok(submissionStore.records.has(`journals/${publicJournalId}/submissions`));
  assert.doesNotMatch(JSON.stringify(journalStore.records), /Alpha browser/);
});

test("moderation is admin-only and pending text cannot appear before its unlock episode", async () => {
  const { handler } = environment();
  const { journal, publicJournalId } = await fileFirstEntry(handler);
  const secret = "Do not reveal this before Episode 8.";
  const submissionResponse = await handler(request("POST", {
    action: "submit-veteran",
    journalId: publicJournalId,
    entryId: journal.entries[0].id,
    unlockEpisode: 8,
    interpretation: secret,
    consent: true,
  }));
  const submission = (await json(submissionResponse)).submission;

  assert.equal((await handler(request("GET", undefined, "?audience=moderation"))).status, 403);
  assert.equal((await handler(request("POST", {
    action: "moderate-veteran-submission",
    submissionId: submission.id,
    decision: "approve",
  }))).status, 403);

  const earlyQueue = await handler(request("GET", undefined, "?audience=moderation", { admin: true }));
  const earlyText = await earlyQueue.text();
  assert.doesNotMatch(earlyText, new RegExp(secret));
  const privateJournal = await json(await handler(request("GET", undefined, "", { admin: true })));
  assert.equal(privateJournal.journal.evidence.length, 0);
  assert.doesNotMatch(JSON.stringify(privateJournal), new RegExp(secret));

  await handler(request("POST", entryInput({
    episodeStart: 5,
    episodeEnd: 8,
    predictions: [],
  }), "", { admin: true }));
  const eligible = await json(await handler(request("GET", undefined, "?audience=moderation", { admin: true })));
  assert.equal(eligible.submissions.length, 1);
  assert.equal(eligible.submissions[0].interpretation, secret);

  const approved = await handler(request("POST", {
    action: "moderate-veteran-submission",
    submissionId: submission.id,
    decision: "approve",
  }, "", { admin: true }));
  assert.equal(approved.status, 200);
  assert.equal((await handler(request("POST", {
    action: "publish",
    approvedThroughEpisode: 8,
  }, "", { admin: true }))).status, 200);

  const throughSeven = await json(await handler(request("GET", undefined, "?audience=reader&safeThroughEpisode=7", { admin: true })));
  const throughEight = await json(await handler(request("GET", undefined, "?audience=reader&safeThroughEpisode=8", { admin: true })));
  assert.equal(throughSeven.journal.evidence.length, 0);
  assert.equal(throughEight.journal.evidence[0].interpretation, secret);
});

test("malformed unlocks, oversized text, unknown relations, and cross-origin posts are rejected", async () => {
  const { handler } = environment();
  const { journal, publicJournalId } = await fileFirstEntry(handler);
  const entryId = journal.entries[0].id;
  const base = {
    action: "submit-veteran",
    journalId: publicJournalId,
    entryId,
    interpretation: "A bounded interpretation.",
    consent: true,
  };
  for (const unlockEpisode of [undefined, 0, 3, 4.5, "not-an-episode", 1000]) {
    const response = await handler(request("POST", { ...base, unlockEpisode }));
    assert.equal(response.status, 400, `unlock ${String(unlockEpisode)}`);
  }
  assert.equal((await handler(request("POST", {
    ...base,
    unlockEpisode: 4,
    interpretation: "x".repeat(5001),
  }))).status, 400);
  assert.equal((await handler(request("POST", {
    ...base,
    entryId: "unknown",
    unlockEpisode: 4,
  }))).status, 404);
  assert.equal((await handler(request("POST", {
    ...base,
    unlockEpisode: 4,
  }, "", { origin: "https://attacker.example" }))).status, 403);
});

test("public veteran submissions are rate-limited per anonymous owner and source", async () => {
  const { handler, getStore } = environment();
  const { journal, publicJournalId } = await fileFirstEntry(handler);
  for (let index = 0; index < 5; index += 1) {
    const response = await handler(request("POST", {
      action: "submit-veteran",
      journalId: publicJournalId,
      entryId: journal.entries[0].id,
      unlockEpisode: 4,
      interpretation: `Interpretation ${index + 1}`,
      consent: true,
    }, "", { ip: "203.0.113.10" }));
    assert.equal(response.status, 201);
  }
  const limited = await handler(request("POST", {
    action: "submit-veteran",
    journalId: publicJournalId,
    entryId: journal.entries[0].id,
    unlockEpisode: 4,
    interpretation: "One too many.",
    consent: true,
  }, "", { ip: "203.0.113.10" }));
  assert.equal(limited.status, 429);
  const archive = getStore("fandom-watch-journal-submissions").records.get(`journals/${publicJournalId}/submissions`).data;
  assert.equal(archive.length, 5);
});

test("discarding anonymous cookies cannot bypass the source rate limit", async () => {
  const { handler } = environment({ rotateAnonymousActors: true });
  const { journal, publicJournalId } = await fileFirstEntry(handler);
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await handler(request("POST", {
      action: "submit-veteran",
      journalId: publicJournalId,
      entryId: journal.entries[0].id,
      unlockEpisode: 4,
      interpretation: `Fresh anonymous identity ${index + 1}`,
      consent: true,
    }, "", { ip: "203.0.113.11" }))).status, 201);
  }
  assert.equal((await handler(request("POST", {
    action: "submit-veteran",
    journalId: publicJournalId,
    entryId: journal.entries[0].id,
    unlockEpisode: 4,
    interpretation: "Cookie reset bypass attempt.",
    consent: true,
  }, "", { ip: "203.0.113.11" }))).status, 429);
});

test("public targets and moderation queues remain isolated between operators", async () => {
  const { handler } = environment();
  const operatorA = await fileFirstEntry(handler);
  const operatorBResponse = await handler(request("POST", entryInput({
    episodeEnd: 2,
    predictions: [],
  }), "", { admin: true, account: "operator-b" }));
  const operatorB = await json(operatorBResponse);
  const operatorBLink = await json(await handler(request(
    "GET",
    undefined,
    "?audience=public-link",
    { admin: true, account: "operator-b" },
  )));
  assert.notEqual(operatorA.publicJournalId, operatorBLink.publicJournalId);

  const targetsA = await json(await handler(request("GET", undefined, `?audience=targets&journal=${operatorA.publicJournalId}`)));
  const targetsB = await json(await handler(request("GET", undefined, `?audience=targets&journal=${operatorBLink.publicJournalId}`)));
  assert.equal(targetsA.targets.entries[0].episodeEnd, 4);
  assert.equal(targetsB.targets.entries[0].episodeEnd, 2);

  await handler(request("POST", {
    action: "submit-veteran",
    journalId: operatorA.publicJournalId,
    entryId: operatorA.journal.entries[0].id,
    unlockEpisode: 4,
    interpretation: "Only operator A may review this.",
    consent: true,
  }));
  const queueA = await json(await handler(request("GET", undefined, "?audience=moderation", { admin: true })));
  const queueB = await json(await handler(request(
    "GET",
    undefined,
    "?audience=moderation",
    { admin: true, account: "operator-b" },
  )));
  assert.equal(queueA.submissions.length, 1);
  assert.equal(queueB.submissions.length, 0);
  assert.equal(operatorB.journal.entries.length, 1);
});

test("retrying approval repairs evidence after a partial cross-store failure", async () => {
  const { handler, getStore } = environment();
  const { journal, publicJournalId } = await fileFirstEntry(handler);
  const submitted = await json(await handler(request("POST", {
    action: "submit-veteran",
    journalId: publicJournalId,
    entryId: journal.entries[0].id,
    unlockEpisode: 4,
    interpretation: "Approval should be recoverable.",
    consent: true,
  })));
  const journalStore = getStore("fandom-watch-journals");
  const setJSON = journalStore.setJSON.bind(journalStore);
  let failEvidenceOnce = true;
  journalStore.setJSON = async (key, value, options) => {
    if (failEvidenceOnce && key === "accounts/operator-a/the-untamed" && value.evidence?.length > 0) {
      failEvidenceOnce = false;
      throw new Error("Simulated journal write failure.");
    }
    return setJSON(key, value, options);
  };

  const decision = {
    action: "moderate-veteran-submission",
    submissionId: submitted.submission.id,
    decision: "approve",
  };
  assert.equal((await handler(request("POST", decision, "", { admin: true }))).status, 500);
  assert.equal((await handler(request("POST", decision, "", { admin: true }))).status, 200);
  assert.equal((await handler(request("POST", {
    action: "publish",
    approvedThroughEpisode: 4,
  }, "", { admin: true }))).status, 200);
  const reader = await json(await handler(request(
    "GET",
    undefined,
    "?audience=reader&safeThroughEpisode=4",
    { admin: true },
  )));
  assert.equal(reader.journal.evidence.length, 1);
  assert.equal(reader.journal.evidence[0].interpretation, "Approval should be recoverable.");
});

test("moderators can correct only unlock metadata and prediction evidence remains cross-gated", async () => {
  const { handler } = environment();
  const { journal: first, publicJournalId } = await fileFirstEntry(handler);
  const prediction = first.predictions[0];
  await handler(request("POST", entryInput({
    episodeStart: 5,
    episodeEnd: 10,
    predictions: [],
  }), "", { admin: true }));
  const submitted = await json(await handler(request("POST", {
    action: "submit-veteran",
    journalId: publicJournalId,
    predictionId: prediction.id,
    unlockEpisode: 8,
    interpretation: "Original veteran interpretation.",
    consent: true,
  })));

  const corrected = await handler(request("POST", {
    action: "moderate-veteran-submission",
    submissionId: submitted.submission.id,
    decision: "correct-unlock",
    unlockEpisode: 8,
    interpretation: "Attempted moderator rewrite.",
    status: "approved",
  }, "", { admin: true }));
  assert.equal(corrected.status, 200);
  const mine = await json(await handler(request("GET", undefined, `?audience=submissions&journal=${publicJournalId}`)));
  assert.equal(mine.submissions[0].interpretation, "Original veteran interpretation.");
  assert.equal(mine.submissions[0].status, "pending");

  await handler(request("POST", {
    action: "moderate-veteran-submission",
    submissionId: submitted.submission.id,
    decision: "approve",
  }, "", { admin: true }));
  await handler(request("POST", {
    action: "resolve-prediction",
    predictionId: prediction.id,
    resolutionEpisode: 9,
    verdict: "vindicated",
    postRevealReaction: "Resolved after the submitted unlock.",
  }, "", { admin: true }));
  await handler(request("POST", {
    action: "publish",
    approvedThroughEpisode: 10,
  }, "", { admin: true }));

  const throughEight = await json(await handler(request("GET", undefined, "?audience=reader&safeThroughEpisode=8", { admin: true })));
  const throughNine = await json(await handler(request("GET", undefined, "?audience=reader&safeThroughEpisode=9", { admin: true })));
  assert.equal(throughEight.journal.evidence.length, 0);
  assert.equal(throughNine.journal.evidence.length, 1);
});