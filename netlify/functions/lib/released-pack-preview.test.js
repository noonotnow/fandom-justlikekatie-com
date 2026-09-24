import assert from "node:assert/strict";
import test from "node:test";
import { createReleasedPackPreviewHandler } from "./released-pack-preview.js";
import releasedPackPreview from "../released-pack-preview.js";
import { manifestStore, publicManifest } from "../public-test-fixture.js";

test("deployed preview entrypoint uses the Web Request/Response contract", async () => {
  assert.equal(typeof releasedPackPreview, "function");
  const result = await releasedPackPreview(
    new Request("https://fandom.justlikekatie.com/.netlify/functions/released-pack-preview"),
    {},
  );
  assert.equal(result.status, 400);
  assert.deepEqual(await result.json(), {
    error: "Valid actorId and vibeIdx are required.",
  });
});

function releasedPackPreviewCards(manifest) {
  return manifest.cards.map(card => ({
    position: card.position,
    title: card.title,
    source: card.source,
    thumbnailUrl: card.media.thumbnailUrl,
    deliveryUrl: card.media.deliveryUrl,
    link: card.link,
  }));
}

test("released pack preview exposes a compact public teaser without private fields", async () => {
  const manifest = publicManifest();
  const handler = createReleasedPackPreviewHandler({
    getStore: () => manifestStore([manifest]),
    buildReleaseCatalog: async () => ({
      complete: true,
      packs: [{
        actorId: "liu-xueyi",
        vibeIdx: 2,
        canonical: "https://fandom.justlikekatie.com/vibe-atlas/packs/liu-xueyi/polished-danger-2/",
        actor: { id: "liu-xueyi", name: "刘学义", nameEn: "Liu Xueyi" },
        vibe: {
          key: "liu-xueyi:2",
          label: "斯文败类",
          labelEn: "Polished Danger",
          subtitle: "眼镜一戴，危险变得很有礼貌",
          subtitleEn: "Put the glasses on. The danger got extremely polite.",
          emoji: "🤓",
        },
        preview: {
          copy: "A public editorial teaser that stays useful without exposing private retrieval data.",
          cards: releasedPackPreviewCards(manifest),
        },
        runId: "PRIVATE-RUN",
      }],
    }),
  });
  const result = await handler(new Request("https://fandom.justlikekatie.com/.netlify/functions/released-pack-preview?actorId=liu-xueyi&vibeIdx=2"), {});
  const body = await result.json();
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
  assert.equal(body.pack.preview.cards.length, 3);
  assert.equal(body.pack.vibe.labelEn, "Polished Danger");
  assert.equal(body.pack.vibe.label, "斯文败类");
  assert.equal(body.pack.vibe.subtitle, "眼镜一戴，危险变得很有礼貌");
  assert.doesNotMatch(JSON.stringify(body), /PRIVATE-RUN|query|prompt|diagnostic|account/i);
});

test("released pack preview validates required pair inputs", async () => {
  const handler = createReleasedPackPreviewHandler({
    getStore: () => manifestStore([publicManifest()]),
    buildReleaseCatalog: async () => ({ complete: true, packs: [] }),
  });
  const result = await handler(new Request("https://fandom.justlikekatie.com/.netlify/functions/released-pack-preview?actorId=liu-xueyi&vibeIdx=oops"), {});
  assert.equal(result.status, 400);
  assert.equal(result.headers.get("cache-control"), "no-store");
});
