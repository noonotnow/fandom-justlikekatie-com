import test from "node:test";
import assert from "node:assert/strict";
import { createReleasedPackDirectoryHandler } from "../released-pack-directory.js";

const request = (method = "GET") => new Request(
  "https://example.test/.netlify/functions/released-pack-directory",
  { method },
);

test("public directory projects only verified preview fields, without private source depth", async () => {
  const handler = createReleasedPackDirectoryHandler({
    getStore: name => ({ name }),
    buildReleaseCatalog: async () => ({
      complete: true,
      indexingComplete: true,
      packs: [{
        actorId: "actor",
        actor: { id: "actor", nameEn: "Actor" },
        vibeIdx: 2,
        vibe: { labelEn: "Vibe" },
        canonical: "https://example.test/vibe-atlas/packs/actor/vibe-2/",
        preview: {
          copy: "A sufficiently detailed public editorial preview for this pairing.",
          cards: Array.from({ length: 9 }, (_, index) => ({
            position: index + 1,
            title: `Image ${index}`,
            thumbnailUrl: `https://example.test/${index}.jpg`,
            deliveryUrl: `https://example.test/${index}-full.jpg`,
            link: "https://private.example.test/source",
          })),
        },
        sourceDepth: { queries: ["private search"] },
      }],
    }),
  });
  const response = await handler(request(), {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.packs.length, 1);
  assert.equal(body.packs[0].preview.cards.length, 3);
  assert.equal(body.packs[0].actor.nameEn, "Actor");
  assert.doesNotMatch(JSON.stringify(body), /sourceDepth|private search|private\.example/);
});

test("public directory fails closed when publication inventory is incomplete", async () => {
  const handler = createReleasedPackDirectoryHandler({
    getStore: () => ({}),
    buildReleaseCatalog: async () => ({ complete: true, indexingComplete: false, packs: [] }),
  });
  const response = await handler(request(), {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "The public pack directory is temporarily unavailable." });
  assert.equal((await handler(request("POST"), {})).status, 405);
});