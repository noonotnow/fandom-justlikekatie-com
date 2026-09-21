import assert from "node:assert/strict";
import test from "node:test";
import {
  createFandomRenditionsHandler,
  fandomRenditionHandoffKey,
  fandomRenditionReceiptKey,
} from "./fandom-renditions.js";

const ORIGIN = "https://fandom.justlikekatie.com";
const ACTOR_PACKS = [{
  id: "liu-xueyi",
  vibes: [{ label_en: "Court Menace" }, { label_en: "Tender Trap" }],
}];

function memoryStore() {
  const values = new Map();
  return {
    values,
    async get(key) {
      return values.has(key) ? structuredClone(values.get(key)) : null;
    },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && values.has(key)) return { modified: false };
      values.set(key, structuredClone(value));
      return { modified: true };
    },
    async list({ prefix }) {
      return {
        blobs: [...values.keys()]
          .filter(key => key.startsWith(prefix))
          .map(key => ({ key })),
      };
    },
  };
}

function handoff(overrides = {}) {
  return {
    schemaVersion: "create.fandom-rendition-handoff.v1",
    sourceArtifactId: "artifact-1",
    sourceArtifactVersion: 2,
    seriesId: "series-1",
    renditionId: "rendition-1",
    renditionVersion: 3,
    destination: "fandom-website",
    editorial: {
      type: "review_essay",
      title: "Against the Current — First Read",
      thesis: "A committed argument.",
      editorialPromise: "A first-read interpretation.",
      renditionTitle: "Against the Current: First Read",
      content: "Authorized destination expression.",
    },
    domainHints: {
      drama: "Against the Current",
      actorIds: ["liu-xueyi"],
      vibePackKeys: ["liu-xueyi:0", "controlled-household-authority"],
      spoilerBoundary: "Episodes 1–6",
    },
    ...overrides,
  };
}

function receipt(overrides = {}) {
  return {
    schemaVersion: "create.fandom-rendition-receipt.v1",
    sourceArtifactId: "artifact-1",
    sourceArtifactVersion: 2,
    seriesId: "series-1",
    renditionId: "rendition-1",
    renditionVersion: 3,
    publicationReceipt: {
      url: "https://fandom.justlikekatie.com/vibing-now/against-the-current-first-read",
      publishedAt: "2026-09-15T12:00:00.000Z",
      publicationId: "vibing-now-against-the-current-first-read",
      contentHash: "a".repeat(64),
    },
    packVerdictProjections: [{
      actorId: "liu-xueyi",
      vibePackKey: "controlled-household-authority",
      verdict: "propose",
      evidence: "Repeated controlled household authority across the opening arc.",
    }],
    learningProjections: {},
    ...overrides,
  };
}

function request(method, body, headers = {}) {
  return new Request(`${ORIGIN}/api/fandom-renditions`, {
    method,
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function harness() {
  const store = memoryStore();
  const auth = {
    async authenticateAdmin() {
      return { user: { accountId: "operator-1" } };
    },
  };
  const handler = createFandomRenditionsHandler({
    env: {
      FANDOM_CREATE_INTEGRATION_TOKEN: "integration-secret",
      FANDOM_PUBLIC_ORIGIN: ORIGIN,
    },
    auth,
    actorPacks: ACTOR_PACKS,
    getStore: () => store,
    now: () => new Date("2026-09-15T10:00:00.000Z"),
  });
  return { handler, store };
}

test("stages an authorized CREATE handoff without inferring Pack Verdicts", async () => {
  const { handler, store } = harness();
  const response = await handler(request("POST", handoff(), {
    Origin: "",
    Authorization: "Bearer integration-secret",
  }), {});
  const body = await response.json();
  const stored = await store.get(fandomRenditionHandoffKey("rendition-1", 3));

  assert.equal(response.status, 201);
  assert.equal(body.rendition.status, "authorized");
  assert.deepEqual(body.rendition.targeting.vibePacks, [
    { vibePackKey: "liu-xueyi:0", status: "known" },
    { vibePackKey: "controlled-household-authority", status: "proposed" },
  ]);
  assert.equal(stored.handoff.domainHints.vibePackKeys.length, 2);
  assert.equal(stored.receipt, undefined);
  assert.equal(stored.packVerdictProjections, undefined);
});

test("replays the same handoff and rejects a conflicting immutable version", async () => {
  const { handler } = harness();
  const headers = { Origin: "", Authorization: "Bearer integration-secret" };
  const created = await handler(request("POST", handoff(), headers), {});
  const replayed = await handler(request("POST", handoff(), headers), {});
  const conflict = await handler(request("POST", handoff({
    editorial: { ...handoff().editorial, content: "Changed content." },
  }), headers), {});

  assert.equal(created.status, 201);
  assert.equal(replayed.status, 200);
  assert.equal(conflict.status, 409);
});

test("rejects wrong schemas, destinations, actors, and malformed Vibe keys", async () => {
  const invalid = [
    handoff({ schemaVersion: "wrong" }),
    handoff({ destination: "rednote" }),
    handoff({ domainHints: { ...handoff().domainHints, actorIds: ["unknown"] } }),
    handoff({ domainHints: { ...handoff().domainHints, vibePackKeys: ["Bad Key!"] } }),
  ];

  for (const body of invalid) {
    const { handler } = harness();
    const response = await handler(request("POST", body, {
      Origin: "",
      Authorization: "Bearer integration-secret",
    }), {});
    assert.equal(response.status, 400);
  }
});

test("requires integration or same-origin admin authorization for intake", async () => {
  const { handler, store } = harness();
  const crossOrigin = await handler(new Request(`${ORIGIN}/api/fandom-renditions`, {
    method: "POST",
    headers: {
      Origin: "https://example.com",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(handoff()),
  }), {});
  const admin = await handler(request("POST", handoff()), {});

  assert.equal(crossOrigin.status, 403);
  assert.equal(store.values.size, 1);
  assert.equal(admin.status, 201);
});

test("lists published Renditions with their stored receipt", async () => {
  const { handler } = harness();
  await handler(request("POST", handoff()), {});
  await handler(request("PUT", receipt()), {});

  const response = await handler(new Request(`${ORIGIN}/api/fandom-renditions`), {});
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.renditions.length, 1);
  assert.equal(body.renditions[0].status, "published");
  assert.deepEqual(body.renditions[0].receipt, receipt());
});

test("records and returns an immutable receipt with exact lineage", async () => {
  const { handler, store } = harness();
  await handler(request("POST", handoff()), {});
  const created = await handler(request("PUT", receipt()), {});
  const replayed = await handler(request("PUT", receipt()), {});
  const body = await created.json();
  const stored = await store.get(fandomRenditionReceiptKey("rendition-1", 3));

  assert.equal(created.status, 201);
  assert.equal(replayed.status, 200);
  assert.deepEqual(body.receipt, receipt());
  assert.deepEqual(stored.receipt, receipt());
});

test("rejects receipt lineage drift and conflicting receipts", async () => {
  const { handler } = harness();
  await handler(request("POST", handoff()), {});
  const lineageConflict = await handler(request("PUT", receipt({
    sourceArtifactVersion: 4,
  })), {});
  const created = await handler(request("PUT", receipt()), {});
  const receiptConflict = await handler(request("PUT", receipt({
    publicationReceipt: {
      ...receipt().publicationReceipt,
      url: "https://fandom.justlikekatie.com/a-different-page",
    },
  })), {});

  assert.equal(lineageConflict.status, 409);
  assert.equal(created.status, 201);
  assert.equal(receiptConflict.status, 409);
});

test("rejects publication receipts for a non-Fandom website origin", async () => {
  const { handler } = harness();
  await handler(request("POST", handoff()), {});
  const response = await handler(request("PUT", receipt({
    publicationReceipt: {
      ...receipt().publicationReceipt,
      url: "https://example.com/not-a-fandom-publication",
    },
  })), {});

  assert.equal(response.status, 400);
});

test("allows new packs only for explicit propose verdicts", async () => {
  const { handler } = harness();
  await handler(request("POST", handoff()), {});
  const invalidVerdict = await handler(request("PUT", receipt({
    packVerdictProjections: [{
      actorId: "liu-xueyi",
      vibePackKey: "controlled-household-authority",
      verdict: "confirm",
    }],
  })), {});
  const wrongActor = await handler(request("PUT", receipt({
    packVerdictProjections: [{
      actorId: "liu-xueyi",
      vibePackKey: "other-actor:0",
      verdict: "confirm",
    }],
  })), {});

  assert.equal(invalidVerdict.status, 400);
  assert.equal(wrongActor.status, 400);
});

test("requires an existing authorized handoff before recording a receipt", async () => {
  const { handler } = harness();
  const response = await handler(request("PUT", receipt()), {});
  assert.equal(response.status, 404);
});
