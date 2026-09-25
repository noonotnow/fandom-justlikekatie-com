import assert from "node:assert/strict";
import test from "node:test";
import { createPublicPreflightPreviewHandler } from "../public-preflight-preview.js";
import { createPublicPreflightPreviewDirectoryHandler } from "../public-preflight-preview-directory.js";
import { createPublishPreflightPreviewHandler } from "../publish-preflight-preview.js";

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