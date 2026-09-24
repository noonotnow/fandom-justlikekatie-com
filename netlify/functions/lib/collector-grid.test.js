import test from "node:test";
import assert from "node:assert/strict";
import { createCollectorGridHandler } from "./collector-grid.js";

const actorPacks = [{ id: "actor-1", name: "Actor", vibes: [{ label: "Vibe" }] }];
const approval = {
  eligible: true,
  runId: "run-1",
  verdict: "approved",
  vibeConfirmed: true,
  publishableConfirmed: true,
};

function stores() {
  const records = new Map();
  const names = [];
  const factory = name => {
    names.push(name);
    return {
      async get(key) { return records.get(`${name}:${key}`) || null; },
      async setJSON(key, value) { records.set(`${name}:${key}`, structuredClone(value)); },
    };
  };
  return { factory, names, records };
}
function request(method, body, query = "") {
  return new Request(`https://fandom.local/.netlify/functions/collector-grid${query}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}
function handlerFor(options = {}) {
  const storage = stores();
  const handler = createCollectorGridHandler({
    actorPacks,
    getPairEligibility: async () => approval,
    fetchImage: async () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" }),
    registerMedia: async ({ association }) => ({
      thumbnailUrl: `https://media.test/${association.itemId}`,
      deliveryUrl: `https://media.test/delivery/${association.itemId}`,
    }),
    getStore: name => name === "actor-audit"
      ? {
        get: async key => key.startsWith("heads/")
          ? { currentRunId: approval.runId }
          : key.startsWith("eligibility/")
            ? approval
            : null,
        list: async () => ({ blobs: [] }),
      }
      : storage.factory(name),
    auth: { authenticate: async () => ({ user: { accountId: "acct-1" } }) },
    billing: {
      initialize: async () => {},
      repository: () => ({ membershipForAccount: async () => ({ status: "active", product: "fandom_collector" }) }),
    },
    build: async (_date, _eligibility, options) => {
      options.selectedPair && assert.deepEqual(options.selectedPair, { actorId: "actor-1", vibeIdx: 0 });
      return {
        actorId: "actor-1",
        vibeIdx: 0,
        generatedAt: "2026-01-01T00:00:00.000Z",
        displayResults: Array.from({ length: 9 }, (_, i) => ({
          thumbnail: `https://img.test/${i}`,
          title: `Image ${i}`,
          source: "source",
          link: `https://source.test/${i}`,
          query: "approved query",
        })),
        curation: { mode: "compiled" },
      };
    },
    ...options,
  });
  return { handler, storage };
}

test("Collector grid requires authentication", async () => {
  const { handler } = handlerFor({
    auth: { authenticate: async () => { const error = new Error("Sign in is required."); error.status = 401; throw error; } },
  });
  assert.equal((await handler(request("POST", { actorId: "actor-1", vibeIdx: 0 }), {})).status, 401);
});

test("Collector grid rejects non-Collector memberships", async () => {
  const { handler } = handlerFor({
    billing: {
      initialize: async () => {},
      repository: () => ({ membershipForAccount: async () => ({ status: "active", product: "creator_os" }) }),
    },
  });
  assert.equal((await handler(request("POST", { actorId: "actor-1", vibeIdx: 0 }), {})).status, 403);
});

test("Collector grid fails closed for an ineligible pairing", async () => {
  const { handler } = handlerFor({
    getPairEligibility: async () => ({ eligible: false }),
  });
  assert.equal((await handler(request("POST", { actorId: "actor-1", vibeIdx: 0 }), {})).status, 403);
});

test("Collector grid accepts an approved override without ordinary confirmations", async () => {
  const { handler } = handlerFor({
    getPairEligibility: async () => ({
      eligible: true,
      runId: "override-run",
      verdict: "approved_override",
      vibeConfirmed: false,
      publishableConfirmed: false,
    }),
  });
  const response = await handler(request("POST", { actorId: "actor-1", vibeIdx: 0 }), {});
  assert.equal(response.status, 200);
});

test("Collector grid uses selected pair and writes only private run storage", async () => {
  const { handler, storage } = handlerFor();
  const response = await handler(request("POST", { actorId: "actor-1", vibeIdx: 0 }), {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.run.images.length, 9);
  assert.ok(storage.names.includes("collector-grid-runs"));
  assert.ok(!storage.names.includes("star-of-day"));
  const listed = await handler(request("GET", null, "?actorId=actor-1&vibeIdx=0"), {});
  assert.equal((await listed.json()).runs.length, 1);
});

test("Collector grid rejects unsafe image URLs and applies pair cooldown", async () => {
  let builds = 0;
  const { handler } = handlerFor({
    build: async () => {
      builds += 1;
      return {
        generatedAt: "2026-01-01T00:00:00.000Z",
        displayResults: Array.from({ length: 9 }, (_, i) => ({
          thumbnail: i === 0 ? "http://insecure.test/image" : `https://img.test/${i}`,
          link: `https://source.test/${i}`,
        })),
      };
    },
  });
  assert.equal((await handler(request("POST", { actorId: "actor-1", vibeIdx: 0 }), {})).status, 502);
  assert.equal((await handler(request("POST", { actorId: "actor-1", vibeIdx: 0 }), {})).status, 429);
  assert.equal(builds, 1);
});

test("Collector fallback runs are labeled fallback", async () => {
  const { handler } = handlerFor({
    build: async () => ({
      generatedAt: "2026-01-01T00:00:00.000Z",
      curation: { mode: "operator_rescue_backup" },
      displayResults: Array.from({ length: 9 }, (_, i) => ({
        thumbnail: `https://img.test/${i}`, link: `https://source.test/${i}`,
      })),
    }),
  });
  const body = await (await handler(request("POST", { actorId: "actor-1", vibeIdx: 0 }), {})).json();
  assert.equal(body.run.source, "fallback");
});

test("saved runs remain isolated by account", async () => {
  const storage = stores();
  let accountId = "acct-a";
  const { handler } = handlerFor({
    getStore: name => name === "actor-audit"
      ? { get: async () => approval, list: async () => ({ blobs: [] }) }
      : storage.factory(name),
    auth: { authenticate: async () => ({ user: { accountId } }) },
  });
  await handler(request("POST", { actorId: "actor-1", vibeIdx: 0 }), {});
  accountId = "acct-b";
  const response = await handler(request("GET", null, "?actorId=actor-1&vibeIdx=0"), {});
  assert.deepEqual((await response.json()).runs, []);
});

test("saved history remains readable after approval is revoked", async () => {
  let eligible = true;
  const { handler } = handlerFor({
    getPairEligibility: async () => eligible ? approval : { eligible: false },
  });
  await handler(request("POST", { actorId: "actor-1", vibeIdx: 0 }), {});
  eligible = false;
  const response = await handler(request("GET", null, "?actorId=actor-1&vibeIdx=0"), {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).runs.length, 1);
});

test("media registration must complete all nine cards before saving a run", async () => {
  let registered = 0;
  const { handler, storage } = handlerFor({
    registerMedia: async ({ association }) => {
      registered += 1;
      if (registered === 5) throw Object.assign(new Error("media unavailable"), { status: 502 });
      return { thumbnailUrl: `https://media.test/${association.itemId}` };
    },
  });
  assert.equal((await handler(request("POST", { actorId: "actor-1", vibeIdx: 0 }), {})).status, 502);
  assert.equal(registered, 5);
  assert.equal([...storage.records.keys()].some(key => key.includes("/runs/")), false);
});