import assert from "node:assert/strict";
import test from "node:test";
import { createPublicPreflightPreviewHandler } from "../public-preflight-preview.js";
import { createPublicPreflightPreviewDirectoryHandler } from "../public-preflight-preview-directory.js";
import { createPublishPreflightPreviewHandler } from "../publish-preflight-preview.js";
import { createPreflightPreviewHealthHandler } from "../preflight-preview-health.js";
import { createPreflightPreviewCardHealthHandler } from "../preflight-preview-card-health.js";
import { preflightPreviewHealthKey } from "./preflight-preview-health.js";

const actorPacks = [{
  id: "actor-one",
  vibes: [{ label_en: "Approved vibe" }],
}];

test("public preview endpoint reads a materialized preview and never invokes publication", async () => {
  const calls = [];
  const handler = createPublicPreflightPreviewHandler({
    actorPacks,
    getStore: name => ({ name }),
    resolvePreview: async input => {
      calls.push(input);
      return { kind: "three-card-preview", cards: [{ position: 0 }, { position: 1 }, { position: 2 }] };
    },
  });
  const result = await handler({
    method: "GET",
    url: "https://example.test/.netlify/functions/public-preflight-preview?actorId=actor-one&vibeIdx=0",
  });
  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).cards.length, 3);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].actor.id, "actor-one");

  const invalid = await handler({
    method: "POST",
    url: "https://example.test/.netlify/functions/public-preflight-preview?actorId=actor-one&vibeIdx=0",
  });
  assert.equal(invalid.statusCode, 405);
  assert.equal(calls.length, 1);
});

test("public directory is a read-only projection", async () => {
  const calls = [];
  const handler = createPublicPreflightPreviewDirectoryHandler({
    actorPacks,
    getStore: name => ({ name }),
    buildDirectory: async input => ({
      kind: "vibe-atlas-preflight-preview-directory",
      previews: [],
      readStores: [input.store.name, input.eligibilityStore.name],
      actorId: input.actor.id,
      vibeCount: input.actor.vibes.length,
      track: calls.push(input.actor.id),
    }),
  });
  const missing = await handler({ method: "GET", url: "https://example.test/" });
  assert.equal(missing.statusCode, 400);
  assert.equal(calls.length, 0);
  const result = await handler({
    method: "GET",
    url: "https://example.test/?actorId=actor-one",
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body).previews, []);
  assert.equal(JSON.parse(result.body).actorId, "actor-one");
  assert.deepEqual(calls, ["actor-one"]);
});

test("materialization endpoint requires admin auth before it can publish", async () => {
  let publishCalls = 0;
  const handler = createPublishPreflightPreviewHandler({
    actorPacks,
    auth: { authenticateAdmin: async () => { throw Object.assign(new Error("Admin access is required."), { status: 403 }); } },
    publishPreview: async () => { publishCalls += 1; },
  });
  const response = await handler({
    method: "POST",
    url: "https://example.test/.netlify/functions/publish-preflight-preview",
    headers: new Headers({ origin: "https://example.test" }),
    json: async () => ({ actorId: "actor-one", vibeIdx: 0 }),
  }, {});
  assert.equal(response.statusCode, 403);
  assert.equal(publishCalls, 0);
});

test("admin publish action calls authenticateAdmin and forwards explicit editorial copy", async () => {
  let authenticated = false;
  let publishInput;
  const handler = createPublishPreflightPreviewHandler({
    actorPacks,
    getStore: name => ({ name }),
    auth: {
      authenticateAdmin: async () => { authenticated = true; },
    },
    publishPreview: async input => {
      publishInput = input;
      return {
        kind: "vibe-atlas-preflight-three-card-preview",
        copy: "An explicit editorial note describing the pairing's visual mood, lighting, and continuity in substantive terms.",
        cards: [0, 1, 2].map(position => ({
          position,
          title: `Card ${position}`,
          media: {
            thumbnailUrl: `https://media.example/thumbnail-${position}`,
            deliveryUrl: `https://media.example/delivery-${position}`,
          },
        })),
      };
    },
  });
  const response = await handler({
    method: "POST",
    url: "https://example.test/.netlify/functions/publish-preflight-preview",
    headers: new Headers({ origin: "https://example.test" }),
    json: async () => ({
      actorId: "actor-one",
      vibeIdx: 0,
      editorialCopy: "An explicit editorial note describing the pairing's visual mood, lighting, and continuity in substantive terms.",
    }),
  }, {});
  assert.equal(response.statusCode, 200);
  assert.equal(authenticated, true);
  assert.match(publishInput.editorialCopy, /^An explicit editorial note/);
  assert.equal(JSON.parse(response.body).preview.cards.length, 3);
});

test("admin publication reports a bounded failure stage without exposing upstream errors", async () => {
  const handler = createPublishPreflightPreviewHandler({
    actorPacks,
    getStore: name => ({ name }),
    auth: { authenticateAdmin: async () => {} },
    publishPreview: async () => {
      throw Object.assign(new Error("private source URL and credentials"), {
        status: 503,
        reasonCode: "source_image_unavailable",
        cardPosition: 2,
      });
    },
  });
  const response = await handler({
    method: "POST",
    url: "https://example.test/.netlify/functions/publish-preflight-preview",
    headers: new Headers({ origin: "https://example.test" }),
    json: async () => ({ actorId: "actor-one", vibeIdx: 0 }),
  }, {});
  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.body), {
    error: "Preview publication is unavailable.",
    reasonCode: "source_image_unavailable",
    cardPosition: 2,
  });
});

test("private pack health retains only the bounded failed card and later success", async () => {
  const saved = new Map();
  const store = {
    setJSON: async (key, value) => saved.set(key, value),
    get: async key => saved.get(key) || null,
  };
  const getStore = () => store;
  const auth = { authenticateAdmin: async () => {} };
  const failure = createPublishPreflightPreviewHandler({
    actorPacks, getStore, auth,
    publishPreview: async () => {
      throw Object.assign(new Error("private approved image address"), {
        status: 503, reasonCode: "source_image_unavailable", cardPosition: 2,
      });
    },
  });
  const request = {
    method: "POST",
    url: "https://example.test/.netlify/functions/publish-preflight-preview",
    headers: new Headers({ origin: "https://example.test" }),
    json: async () => ({ actorId: "actor-one", vibeIdx: 0 }),
  };
  assert.equal((await failure(request, {})).statusCode, 503);
  const health = createPreflightPreviewHealthHandler({ actorPacks, getStore, auth });
  const healthRequest = { method: "GET",
    url: "https://example.test/.netlify/functions/preflight-preview-health?actorId=actor-one" };
  const first = JSON.parse((await health(healthRequest, {})).body);
  assert.equal(first.actorId, "actor-one");
  assert.equal(first.attempts[0].status, "failed");
  assert.equal(first.attempts[0].cardPosition, 2);
  assert.equal(first.attempts[0].reasonCode, "source_image_unavailable");
  assert.equal(JSON.stringify(first).includes("private approved image address"), false);
  assert.equal(saved.has(preflightPreviewHealthKey("actor-one", 0)), true);

  const success = createPublishPreflightPreviewHandler({
    actorPacks, getStore, auth,
    publishPreview: async () => ({
      kind: "vibe-atlas-preflight-three-card-preview",
      vibeIdx: 0,
      cards: [],
      publishedAt: "2026-09-30",
    }),
  });
  assert.equal((await success(request, {})).statusCode, 200);
  const second = JSON.parse((await health(healthRequest, {})).body);
  assert.equal(second.attempts[0].status, "published");
  assert.equal(second.attempts[0].reasonCode, undefined);
});

test("operator-only card check bounds position and reports a single approved image without source details", async () => {
  const calls = [];
  const handler = createPreflightPreviewCardHealthHandler({
    actorPacks, auth: { authenticateAdmin: async () => {} },
    getStore: () => ({ name: "eligibility" }),
    inspectCard: async input => {
      calls.push(input);
      return { status: "unavailable", runId: "approved-run", boardHash: "digest" };
    },
  });
  const url = "https://example.test/.netlify/functions/preflight-preview-card-health?actorId=actor-one&vibeIdx=0&position=1";
  const result = await handler({ method: "GET", url }, {});
  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body), {
    actorId: "actor-one", vibeIdx: 0, position: 1,
    status: "unavailable", runId: "approved-run", boardHash: "digest",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].position, 1);
  assert.equal((await handler({ method: "GET", url: url.replace("position=1", "position=9") }, {})).statusCode, 400);
  assert.equal(calls.length, 1);
  const denied = createPreflightPreviewCardHealthHandler({
    actorPacks,
    auth: { authenticateAdmin: async () => { throw Object.assign(new Error("denied"), { status: 403 }); } },
  });
  assert.equal((await denied({ method: "GET", url }, {})).statusCode, 403);
});

test("draft card checks use only an authenticated retained candidate, not a submitted source URL", async () => {
  const handler = createPreflightPreviewCardHealthHandler({
    actorPacks,
    auth: { authenticateAdmin: async () => {} },
    getStore: () => ({}),
    inspectCandidate: async input => {
      assert.equal(input.runId, "current-run");
      assert.equal(input.candidateId, "candidate-2");
      assert.equal(input.position, undefined);
      return { status: "unavailable" };
    },
  });
  const url = "https://example.test/.netlify/functions/preflight-preview-card-health?actorId=actor-one&vibeIdx=0&runId=current-run&candidateId=candidate-2";
  const response = await handler({ method: "GET", url }, {});
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    actorId: "actor-one", vibeIdx: 0, runId: "current-run",
    candidateId: "candidate-2", status: "unavailable",
  });
  assert.equal((await handler({ method: "GET", url: url + "&sourceUrl=https://private.example" }, {})).statusCode, 200);
});

test("admin publication reports storage failure without upstream detail or a card number", async () => {
  const handler = createPublishPreflightPreviewHandler({
    actorPacks,
    getStore: name => ({ name }),
    auth: { authenticateAdmin: async () => {} },
    publishPreview: async () => {
      throw Object.assign(new Error("private storage URL"), {
        status: 503,
        reasonCode: "receipt_storage_unavailable",
      });
    },
  });
  const response = await handler({
    method: "POST",
    url: "https://example.test/.netlify/functions/publish-preflight-preview",
    headers: new Headers({ origin: "https://example.test" }),
    json: async () => ({ actorId: "actor-one", vibeIdx: 0 }),
  }, {});
  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.body), {
    error: "Preview publication is unavailable.",
    reasonCode: "receipt_storage_unavailable",
  });
});