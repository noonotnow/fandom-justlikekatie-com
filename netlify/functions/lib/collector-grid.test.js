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

test("refresh searches again but never saves an unchanged nine-image board", async () => {
  let builds = 0;
  let copies = 0;
  const { handler, storage } = handlerFor({
    build: async (_date, _store, options) => {
      builds += 1;
      assert.equal(options.refreshCollectorSearch, builds > 1);
      if (builds > 1) assert.equal(options.excludedCollectorThumbnails.length, 9);
      return {
        displayResults: Array.from({ length: 9 }, (_, index) => ({
          thumbnail: `https://img.test/${builds === 3 && index === 0 ? "new" : index}`,
          link: "https://source.test/shared",
        })),
      };
    },
    fetchImage: async url => ({ bytes: new TextEncoder().encode(url), contentType: "image/jpeg" }),
    registerMedia: async ({ association }) => ({
      thumbnailUrl: `https://media.test/${++copies}/${association.itemId}`,
    }),
  });
  const post = () => handler(request("POST", { actorId: "actor-1", vibeIdx: 0 }), {});
  const first = await post();
  assert.equal(first.status, 200);
  const firstId = (await first.json()).run.id;
  const clearCooldown = () => {
    for (const key of storage.records.keys()) if (key.endsWith("/cooldown")) storage.records.delete(key);
  };
  clearCooldown();
  const repeated = await post();
  assert.equal(repeated.status, 409);
  assert.match((await repeated.json()).error, /No different safe nine-image board/);
  assert.equal(copies, 9);
  clearCooldown();
  assert.equal((await post()).status, 200);
  const { runs } = await (await handler(request("GET", null, "?actorId=actor-1&vibeIdx=0"), {})).json();
  assert.equal(runs.length, 2);
  assert.equal(runs[1].id, firstId);
  assert.equal(runs[0].images.length, 9);
  assert.equal(copies, 18);
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

test("a saved run records bounded pack, search, and curation provenance", async () => {
  const { handler, storage } = handlerFor({
    getPairEligibility: async () => ({
      ...approval, pairingFingerprint: "pair-version-1",
    }),
    searchQuery: async () => ({
      provider: "bing_images",
      providerFetchOrder: ["baidu", "brave", "google_images", "bing_images"],
      results: [{ title: "private provider result" }],
    }),
    registerMedia: async ({ association }) => ({
      assetId: `media-${association.itemId}`,
      thumbnailUrl: `https://media.test/${association.itemId}`,
    }),
    build: async (_date, _store, options) => {
      await options.search("approved query");
      return {
        generatedAt: "2026-01-01T00:00:00.000Z",
        rankedBatches: [{
          query: "approved query", provider: "bing_images",
          count: 9, distinctSources: 4, results: [{ title: "do not save batch results" }],
        }],
        curation: { mode: "compiled", version: 4, calibrationEvidenceCount: 2 },
        displayResults: Array.from({ length: 9 }, (_, index) => ({
          thumbnail: `https://img.test/${index}`,
          link: `https://source.test/${index}`,
          query: "approved query",
        })),
      };
    },
  });
  const response = await handler(request("POST", { actorId: "actor-1", vibeIdx: 0 }), {});
  assert.equal(response.status, 200);
  const { run } = await response.json();
  assert.equal(run.schemaVersion, 2);
  assert.equal(run.provenance.pack.pairingFingerprint, "pair-version-1");
  assert.equal(run.provenance.pack.approvalRunId, "run-1");
  assert.deepEqual(run.provenance.search.attemptedQueries[0], {
    query: "approved query", provider: "bing_images",
    providerFetchOrder: ["baidu", "brave", "google_images", "bing_images"],
    resultCount: 1,
  });
  assert.equal(run.provenance.search.rankedBatches[0].usableCount, 9);
  assert.equal(run.provenance.curation.version, 4);
  assert.equal(run.images[0].mediaAssetId, "media-card-1");
  assert.equal(JSON.stringify(run.provenance).includes("private provider result"), false);
  assert.equal(JSON.stringify(run.provenance).includes("do not save batch results"), false);
  assert.equal([...storage.records.keys()].some(key => key.includes("/runs/")), true);
});

test("a changed approval cannot be saved as the previous pack version", async () => {
  let reads = 0;
  const { handler, storage } = handlerFor({
    getPairEligibility: async () => ++reads === 1
      ? approval : { ...approval, runId: "superseding-run" },
  });
  const response = await handler(request("POST", { actorId: "actor-1", vibeIdx: 0 }), {});
  assert.equal(response.status, 409);
  assert.equal([...storage.records.keys()].some(key => key.includes("/runs/")), false);
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

test("Collector refresh uses up to five recent runs for exclusions and records bounded freshness telemetry", async () => {
  const storage = stores();
  const key = "collector-grid-runs:accounts/acct-1/pairs/actor-1/0/index";
  const runIds = ["run-1", "run-2", "run-3", "run-4", "run-5", "run-6"];
  storage.records.set(key, { ids: runIds });
  for (const [index, runId] of runIds.entries()) {
    storage.records.set(`collector-grid-runs:accounts/acct-1/runs/${runId}`, {
      id: runId,
      images: Array.from({ length: 9 }, (_, card) => ({
        sourceThumbnail: `https://images.test/${index}-${card}.jpg`,
        imageChecksum: `checksum-${index}-${card}`,
        thumbnail: `https://media.test/${index}-${card}.jpg`,
      })),
    });
  }
  const { handler } = handlerFor({
    getStore: name => name === "actor-audit"
      ? { get: async () => approval, list: async () => ({ blobs: [] }) }
      : storage.factory(name),
    build: async (_date, _store, options) => {
      assert.equal(options.refreshCollectorSearch, true);
      assert.equal(options.excludedCollectorThumbnails.length, 45);
      assert.equal(options.excludedCollectorChecksums.length, 45);
      return {
        generatedAt: "2026-01-01T00:00:00.000Z",
        rankedBatches: [{ query: "q1", provider: "bing_images", count: 12, distinctSources: 5 }],
        displayResults: Array.from({ length: 9 }, (_, i) => ({
          thumbnail: `https://img.test/new-${i}`,
          link: `https://source.test/new-${i}`,
          source: "source.test",
          query: "q1",
        })),
        collectorRefresh: {
          rawProviderCount: 5,
          postFilterCount: 80,
          pooledUniqueCount: 70,
          historyExcludedCount: 12,
          unseenCount: 22,
          analyzedCount: 60,
          selectedCount: 9,
          providerContributionCounts: {
            baidu: { rawCount: 20, normalizedCount: 15, acceptedCount: 12 },
          },
          firstPassQueries: ["q1"],
          secondPassQueries: ["q2"],
        },
        curation: { mode: "compiled", version: 9, calibrationEvidenceCount: 2 },
      };
    },
    fetchImage: async url => ({ bytes: new TextEncoder().encode(url), contentType: "image/jpeg" }),
  });
  const response = await handler(request("POST", { actorId: "actor-1", vibeIdx: 0 }), {});
  assert.equal(response.status, 200);
  const { run } = await response.json();
  assert.equal(run.provenance.search.freshness.rawProviderCount, 5);
  assert.equal(run.provenance.search.freshness.selectedCount, 9);
  assert.deepEqual(run.provenance.search.freshness.firstPassQueries, ["q1"]);
});

test("concurrent Collector refresh enforces owner lease during generation", async () => {
  const records = new Map();
  const etags = new Map();
  let etagSeq = 0;
  const nextEtag = () => `e${++etagSeq}`;
  const store = {
    async get(key) {
      if (key.endsWith("/cooldown")) return null;
      return records.get(key) || null;
    },
    async getWithMetadata(key) {
      if (key.endsWith("/cooldown")) return { data: null, etag: null };
      return { data: records.get(key) || null, etag: etags.get(key) || null };
    },
    async setJSON(key, value, condition = {}) {
      if (!key.endsWith("/cooldown")) {
        if (condition.onlyIfNew && records.has(key)) return { modified: false };
        if (condition.onlyIfMatch && etags.get(key) !== condition.onlyIfMatch) return { modified: false };
      }
      records.set(key, structuredClone(value));
      etags.set(key, nextEtag());
      return { modified: true };
    },
    async delete(key) {
      records.delete(key);
      etags.delete(key);
    },
  };
  let releaseBuild;
  const buildGate = new Promise(resolve => {
    releaseBuild = resolve;
  });
  const { handler } = handlerFor({
    getStore: name => name === "actor-audit"
      ? { get: async () => approval, list: async () => ({ blobs: [] }) }
      : store,
    build: async () => {
      await buildGate;
      return {
        displayResults: Array.from({ length: 9 }, (_, i) => ({
          thumbnail: `https://img.test/${i}`,
          link: `https://source.test/${i}`,
        })),
        curation: { mode: "compiled" },
      };
    },
  });
  const first = handler(request("POST", { actorId: "actor-1", vibeIdx: 0 }), {});
  await new Promise(resolve => setTimeout(resolve, 10));
  const second = await handler(request("POST", { actorId: "actor-1", vibeIdx: 0 }), {});
  assert.equal(second.status, 429);
  assert.match((await second.json()).error, /Another refresh is already generating/);
  releaseBuild();
  assert.equal((await first).status, 200);
});