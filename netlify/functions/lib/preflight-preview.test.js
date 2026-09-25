import assert from "node:assert/strict";
import test from "node:test";
import {
  preflightPreviewDirectory,
  preflightPreviewKey,
  publishPreflightPreview,
  resolvePublicPreflightPreview,
} from "./preflight-preview.js";

const actor = {
  id: "actor-one",
  name: "Actor One",
  shortName_en: "Actor One",
  vibes: [{
    label_en: "Boyfriend Lighting",
    label: "暖光",
    emoji: "✨",
    supportingCopy_en: "A substantive editorial note describing the pairing's warm light, candid styling, and quietly intimate portrait mood.",
  }],
};
const candidates = Array.from({ length: 9 }, (_, position) => ({
  candidateId: `approved-${position}`,
  thumbnail: `https://images.example/approved-${position}.jpg`,
  title: position === 1
    ? "Approved result with unsafe https://search.example/?q=private title"
    : `Approved result ${position}`,
  source: `source-${position}`,
  rawSearchUrl: `https://search.example/?q=private-${position}`,
}));
const approval = {
  eligible: true,
  verdict: "approved_override",
  runId: "preflight-run",
  publicationBoard: { candidates },
};
const auditRunKey = "runs/actor-one/0/preflight-run";

function media(position, association) {
  return {
    schemaVersion: 1,
    assetId: `00000000-0000-4000-8000-${String(position + 1).padStart(12, "0")}`,
    deliveryUrl: `https://media.example/delivery-${position}`,
    thumbnailUrl: `https://media.example/thumbnail-${position}`,
    mimeType: "image/jpeg",
    sizeBytes: 100,
    checksum: `${position}`.padStart(64, "0"),
    dimensions: { width: 100, height: 100 },
    association,
  };
}

function setup() {
  const data = new Map();
  const readOptions = [];
  const writeOptions = [];
  const store = {
    get: async (key, options) => {
      readOptions.push({ key, options });
      return data.get(key) || null;
    },
    setJSON: async (key, value, options) => {
      writeOptions.push({ key, options });
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, value);
      return { modified: true };
    },
  };
  const eligibilityStore = {
    get: async (key, options) => {
      readOptions.push({ key, options });
      return key === auditRunKey
        ? { runId: "preflight-run", strongestEvent: { candidates } }
        : null;
    },
  };
  return { data, store, eligibilityStore, readOptions, writeOptions };
}

test("operator publication freezes only three approved candidates behind MEDIA", async () => {
  const state = setup();
  const materialized = [];
  let fetched = 0;
  const receipt = await publishPreflightPreview({
    ...state,
    actor,
    vibeIdx: 0,
    eligibilityReader: async () => approval,
    imageFetcher: async url => {
      fetched += 1;
      assert.match(url, /^https:\/\/images\.example\/approved-[0-2]\.jpg$/);
      return { bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" };
    },
    mediaRegistrar: async input => {
      materialized.push(input);
      return media(materialized.length - 1, input.association);
    },
    now: () => "2026-05-01T00:00:00.000Z",
  });
  assert.equal(receipt.cards.length, 3);
  assert.equal(fetched, 3);
  assert.equal(materialized.length, 3);
  assert.equal(state.writeOptions[0].options.onlyIfNew, true);
  assert.equal(state.readOptions.filter(item => item.options?.consistency === "strong").length >= 4, true);
  assert.equal(JSON.stringify(receipt).includes("rawSearchUrl"), false);
  assert.equal(JSON.stringify(receipt).includes("search.example"), false);
});

test("public read rechecks current release approval and exposes exactly three safe cards", async () => {
  const state = setup();
  const receipt = await publishPreflightPreview({
    ...state,
    actor,
    vibeIdx: 0,
    eligibilityReader: async () => approval,
    imageFetcher: async () => ({ bytes: new Uint8Array([1]), contentType: "image/jpeg" }),
    mediaRegistrar: async input => media(Number(input.association.itemId.slice(-1)), input.association),
  });
  const preview = await resolvePublicPreflightPreview({
    ...state,
    actor,
    vibeIdx: 0,
    eligibilityReader: async () => approval,
  });
  assert.equal(preview.cards.length, 3);
  assert.equal(preview.vibeIdx, 0);
  assert.equal(preview.cards[0].title, "Approved result 0");
  assert.equal(preview.cards[1].title, "");
  assert.match(preview.vibe.copy, /substantive editorial note/);
  assert.equal("path" in preview, false);
  assert.equal("canonical" in preview, false);
  assert.equal("actorPath" in preview, false);
  assert.equal(JSON.stringify(preview).includes("source-"), false);
  assert.equal(JSON.stringify(preview).includes("images.example"), false);
  assert.equal(JSON.stringify(preview).includes("preflight-run"), false);
  assert.equal(receipt.cards.length, 3);

  assert.equal(await resolvePublicPreflightPreview({
    ...state, actor, vibeIdx: 0,
    eligibilityReader: async () => ({ ...approval, runId: "superseding-run" }),
  }), null);
  assert.equal(await resolvePublicPreflightPreview({
    ...state, actor, vibeIdx: 0,
    eligibilityReader: async () => ({ ...approval, verdict: "needs_query_work" }),
  }), null);
});

test("unapproved or malformed board cannot cause materialization", async () => {
  const state = setup();
  let attempts = 0;
  const result = await publishPreflightPreview({
    ...state,
    actor,
    vibeIdx: 0,
    eligibilityReader: async () => ({ ...approval, verdict: "needs_query_work" }),
    imageFetcher: async () => { attempts += 1; },
  });
  assert.equal(result, null);
  assert.equal(attempts, 0);
  assert.equal(state.writeOptions.length, 0);
});

test("publishing requires substantive built-in copy or an explicit safe editorial copy", async () => {
  const state = setup();
  const noCopyActor = {
    ...actor,
    vibes: [{ label_en: "No copy", emoji: "✨" }],
  };
  let attempts = 0;
  assert.equal(await publishPreflightPreview({
    ...state,
    actor: noCopyActor,
    vibeIdx: 0,
    eligibilityReader: async () => approval,
    imageFetcher: async () => { attempts += 1; },
  }), null);
  assert.equal(attempts, 0);

  const copy = "This explicit editorial note describes the intended mood, lighting, and visual continuity without relying on external article context.";
  const result = await publishPreflightPreview({
    ...state,
    actor: noCopyActor,
    vibeIdx: 0,
    editorialCopy: copy,
    eligibilityReader: async () => approval,
    imageFetcher: async () => ({ bytes: new Uint8Array([1]), contentType: "image/jpeg" }),
    mediaRegistrar: async input => media(Number(input.association.itemId.slice(-1)), input.association),
  });
  assert.equal(result.copy, copy);
  assert.equal(result.cards.length, 3);
});

test("directory includes only currently approved pairings with validated receipts", async () => {
  const state = setup();
  await publishPreflightPreview({
    ...state,
    actor,
    vibeIdx: 0,
    eligibilityReader: async () => approval,
    imageFetcher: async () => ({ bytes: new Uint8Array([1]), contentType: "image/jpeg" }),
    mediaRegistrar: async input => media(Number(input.association.itemId.slice(-1)), input.association),
  });
  const result = await preflightPreviewDirectory({
    ...state,
    actor,
    eligibilityReader: async () => approval,
  });
  assert.equal(result.previews.length, 1);
  assert.equal(result.previews[0].cards.length, 3);
  assert.equal(result.previews[0].vibe.idx, 0);
  assert.equal(preflightPreviewKey(actor.id, 0, approval.runId).includes("preflight-run"), true);
});