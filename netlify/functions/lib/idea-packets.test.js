import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, createIdeaPacketsHandler, validatePacket } from "./idea-packets.js";

const ORIGIN = "https://fandom.justlikekatie.com";
const TOKEN = "operator-token";

function packet(overrides = {}) {
  return {
    id: "packet-1",
    version: "2026-08-04T16:00:00.000Z",
    state: "collecting",
    createdAt: "2026-08-04T16:00:00.000Z",
    updatedAt: "2026-08-04T16:00:00.000Z",
    actor: { id: "actor-1", name: "Star", nameEn: "Star" },
    vibe: { label: "氛围", labelEn: "Vibe", emoji: "✨" },
    provenance: { sourceRoute: "/?admin=true", gridId: "grid-1", generatedAt: "2026-08-04T15:00:00Z", resultIds: [], batchKeys: [] },
    anchor: { imageUrls: ["https://example.com/anchor.jpg"], label: "Star · Vibe" },
    sourceCards: [{
      id: "card-1",
      order: 0,
      imageUrl: "https://example.com/anchor.jpg",
      sourceUrl: "https://example.com/source/card-1",
      title: "Anchor",
      capturedAt: "2026-08-04T15:00:00Z",
      resultId: "result-anchor",
      provenance: "{}",
    }],
    media: [],
    outputs: [{
      id: "grid-output",
      kind: "grid",
      sourceId: "grid-1",
      label: "Rendered grid PNG",
      included: true,
      addedAt: "2026-08-04T16:00:00.000Z",
    }],
    notes: "",
    workingAngle: "",
    captionSeeds: "",
    outputAngles: "",
    ...overrides,
  };
}

function media(id = "result-1") {
  return {
    id: `media-${id}`,
    imageUrl: `https://example.com/${id}.jpg`,
    sourceUrl: `https://example.com/source/${id}`,
    title: id,
    resultId: id,
    addedAt: "2026-08-04T16:01:00Z",
  };
}

function grid(id = "grid-2") {
  return {
    kind: "grid",
    schemaVersion: 1,
    rendererVersion: "vibe-atlas-v1",
    id,
    actorId: "actor-2",
    actor: "Second Star",
    actorEn: "Second Star",
    actorAccentColor: "#c9a96e",
    vibe: "第二氛围",
    vibeEn: "Second Vibe",
    vibeEmoji: "🌙",
    vibeSubtitle: "A complete saved aesthetic.",
    vibeSubtitleEn: "A complete saved aesthetic.",
    searchSpell: "second star editorial search",
    edition: { provider: "brave", misprint: false, legendary: true },
    capturedDate: "2026-08-05",
    generatedAt: "2026-08-05T15:00:00Z",
    savedAt: "2026-08-05T16:00:00Z",
    sourceRoute: "/collection",
    images: [{
      resultId: "grid-result-2",
      imageUrl: "/.netlify/functions/image-proxy?url=https%3A%2F%2Fimages.example%2Fgrid-2.jpg",
      sourceUrl: "https://publisher.example/grid-2",
      title: "Second grid result",
      gridPosition: 0,
    }],
  };
}

function memoryStore() {
  const records = new Map();
  return {
    records,
    async get(key) { return structuredClone(records.get(key) ?? null); },
    async setJSON(key, value) { records.set(key, structuredClone(value)); },
    async list() { return { blobs: [...records.keys()].map(key => ({ key })) }; },
  };
}

function storeRouter(packetStore) {
  const leaseStore = memoryStore();
  return name => name === "idea-packets" ? packetStore : leaseStore;
}

function request(method, body, token = TOKEN) {
  return new Request(`${ORIGIN}/api/idea-packets`, {
    method,
    headers: {
      Origin: ORIGIN,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test("validates required provenance and compilation invariants", () => {
  assert.throws(() => validatePacket(packet({ provenance: {} })), /provenance/);
  assert.throws(
    () => validatePacket(packet({
      state: "media_compiled",
      outputs: [{ ...packet().outputs[0], included: false }],
    })),
    /at least one output/,
  );
  assert.equal(validatePacket(packet()).id, "packet-1");
});

test("validates the AI visual provenance and Rednote copy stored with Middle-earth outputs", () => {
  const output = {
    id: "meme-output",
    kind: "meme",
    sourceId: "card-1",
    label: "MemeForge object",
    included: true,
    addedAt: "2026-08-19T14:00:00.000Z",
    textFingerprint: "fingerprint",
  };
  const middleEarth = packet({
    workspace: "middle-earth",
    content: "meme",
    anchor: { imageUrls: ["https://example.com/anchor.jpg"], label: "Samwise visual" },
    grids: [],
    outputs: [output],
    middleEarthContent: {
      [output.id]: {
        kind: "meme",
        title: "The real ring-bearer",
        text: "Some people carry the plan. Sam carried the people.",
        secondaryText: "Quiet competence, Shire edition.",
        tone: "Tender",
        layout: "Editorial caption",
        character: "Samwise",
        aiGeneration: {
          provider: "xai",
          generatedAt: "2026-08-19T13:55:00.000Z",
          model: "grok-test",
        },
        rednoteCopy: {
          title: "Sam carried more than the quest",
          caption: "The quietest person in the fellowship was doing the heaviest lifting.",
          tags: ["#MiddleEarth", "#Samwise", "#Fandom"],
          character: "Samwise",
          generatedAt: "2026-08-19T13:58:00.000Z",
          provider: "xai",
          model: "grok-test",
        },
      },
    },
  });
  assert.equal(
    validatePacket(middleEarth).middleEarthContent[output.id].rednoteCopy.tags[1],
    "#Samwise",
  );
  const invalid = structuredClone(middleEarth);
  invalid.middleEarthContent[output.id].rednoteCopy.tags = ["#OnlyOne"];
  assert.throws(() => validatePacket(invalid), /invalid Rednote copy/);
});

test("prevents exact duplicate media and supports reversible compilation", () => {
  const once = applyAction(packet(), { type: "add_media", media: media() });
  assert.throws(() => applyAction(once, { type: "add_media", media: media() }), /already/);
  const compiled = applyAction(once, { type: "set_state", state: "media_compiled" });
  assert.equal(compiled.state, "media_compiled");
  const resumed = applyAction(compiled, { type: "set_state", state: "collecting" });
  assert.equal(resumed.state, "collecting");
});

test("adds a complete saved grid as one packet output without flattening it into curated media", () => {
  const updated = applyAction(packet(), { type: "add_grid", grid: grid() });
  assert.equal(updated.grids.length, 2);
  assert.equal(updated.media.length, 0);
  assert.equal(updated.outputs.at(-1).sourceId, "grid-2");
  assert.equal(updated.outputs.at(-1).kind, "grid");
  assert.equal(updated.grids.at(-1).searchSpell, "second star editorial search");
  assert.throws(() => applyAction(updated, { type: "add_grid", grid: grid() }), /already/);
});

test("retains a failed handoff pointer as stale history across packet mutation", () => {
  const current = packet({
    handoffAttempt: {
      schemaVersion: 1,
      packetVersion: "packet-version-1",
      artifactKey: "packet-1/artifact",
    },
  });
  const changed = applyAction(current, {
    type: "update_context",
    captionSeeds: "Superseding content",
  });
  assert.deepEqual(changed.handoffAttempt, current.handoffAttempt);
  assert.equal(changed.captionSeeds, "Superseding content");
  assert.notEqual(changed.version, current.version);
});

test("persists, lists, reorders, removes, and rejects stale writes", async () => {
  const store = memoryStore();
  const handler = createIdeaPacketsHandler({
    env: { PLAN_OPERATOR_TOKEN: TOKEN },
    getStore: storeRouter(store),
  });

  const created = await handler(request("POST", { packet: packet() }));
  assert.equal(created.status, 201);
  let current = (await created.json()).packet;
  for (const id of ["one", "two"]) {
    const response = await handler(request("PATCH", {
      id: current.id,
      expectedVersion: current.version,
      action: { type: "add_media", media: media(id) },
    }));
    assert.equal(response.status, 200);
    current = (await response.json()).packet;
  }

  const stale = await handler(request("PATCH", {
    id: current.id,
    expectedVersion: "stale",
    action: { type: "remove_media", mediaId: current.media[0].id },
  }));
  assert.equal(stale.status, 409);

  const moved = await handler(request("PATCH", {
    id: current.id,
    expectedVersion: current.version,
    action: { type: "move_media", mediaId: current.media[1].id, direction: -1 },
  }));
  current = (await moved.json()).packet;
  assert.equal(current.media[0].resultId, "two");

  const listed = await handler(request("GET"));
  assert.equal((await listed.json()).packets.length, 1);
});

test("upgrades legacy curated media into matching source-card provenance", async () => {
  const store = memoryStore();
  const legacy = packet({ media: [media("legacy-result")] });
  delete legacy.sourceCards;
  delete legacy.outputs;
  await store.setJSON(legacy.id, legacy);
  const handler = createIdeaPacketsHandler({
    env: { PLAN_OPERATOR_TOKEN: TOKEN },
    getStore: storeRouter(store),
  });
  const response = await handler(request("GET"));
  const upgraded = (await response.json()).packets[0];
  const output = upgraded.outputs.find(candidate => candidate.kind === "individual");
  const sourceCard = upgraded.sourceCards.find(card => card.id === output.sourceId);
  assert.equal(sourceCard.sourceUrl, "https://example.com/source/legacy-result");
  assert.equal(sourceCard.resultId, "legacy-result");
});

test("requires same-origin operator authorization", async () => {
  const handler = createIdeaPacketsHandler({
    env: { PLAN_OPERATOR_TOKEN: TOKEN },
    getStore: storeRouter(memoryStore()),
  });
  assert.equal((await handler(request("GET", undefined, ""))).status, 401);
  const crossOrigin = new Request(`${ORIGIN}/api/idea-packets`, {
    method: "POST",
    headers: { Origin: "https://attacker.example", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ packet: packet() }),
  });
  assert.equal((await handler(crossOrigin)).status, 403);
});

test("serializes concurrent edits and rejects the stale writer", async () => {
  const store = memoryStore();
  await store.setJSON("packet-1", packet());
  const handler = createIdeaPacketsHandler({
    env: { PLAN_OPERATOR_TOKEN: TOKEN },
    getStore: storeRouter(store),
  });
  const edit = notes => handler(request("PATCH", {
    id: "packet-1",
    expectedVersion: packet().version,
    action: { type: "update_context", notes },
  }));

  const responses = await Promise.all([edit("first"), edit("second")]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
});

test("uses Blob ETag CAS so a cross-instance edit cannot be overwritten", async () => {
  const records = new Map([["packet-1", packet()]]);
  const store = {
    records,
    async getWithMetadata(key) {
      return { data: structuredClone(records.get(key)), etag: "etag-before-edit" };
    },
    async setJSON(key, _value, options) {
      assert.equal(options.onlyIfMatch, "etag-before-edit");
      records.set(key, packet({
        notes: "Concurrent instance edit",
        version: "concurrent-version",
      }));
      return { modified: false };
    },
  };
  const handler = createIdeaPacketsHandler({
    env: { PLAN_OPERATOR_TOKEN: TOKEN },
    getStore: storeRouter(store),
  });
  const response = await handler(request("PATCH", {
    id: "packet-1",
    expectedVersion: packet().version,
    action: { type: "update_context", notes: "Stale edit" },
  }));
  assert.equal(response.status, 409);
  assert.equal(store.records.get("packet-1").notes, "Concurrent instance edit");
});

test("rejects packet mutation while a handoff owns the durable lease", async () => {
  const store = memoryStore();
  const leaseStore = memoryStore();
  await store.setJSON("packet-1", packet());
  await leaseStore.setJSON("locks/packet-1", {
    owner: "handoff-instance",
    acquiredAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    state: "active",
  });
  const handler = createIdeaPacketsHandler({
    env: { PLAN_OPERATOR_TOKEN: TOKEN },
    getStore: name => name === "idea-packets" ? store : leaseStore,
  });
  const response = await handler(request("PATCH", {
    id: "packet-1",
    expectedVersion: packet().version,
    action: { type: "update_context", notes: "Must not apply" },
  }));
  assert.equal(response.status, 409);
  assert.equal(store.records.get("packet-1").notes, "");
});

test("coordinates packet creation through the durable handoff lease", async () => {
  const store = memoryStore();
  const leaseStore = memoryStore();
  await leaseStore.setJSON("locks/packet-2", {
    owner: "handoff-instance",
    acquiredAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    state: "active",
  });
  const handler = createIdeaPacketsHandler({
    env: { PLAN_OPERATOR_TOKEN: TOKEN },
    getStore: name => name === "idea-packets" ? store : leaseStore,
  });

  const response = await handler(request("POST", { packet: packet({ id: "packet-2" }) }));
  assert.equal(response.status, 409);
  assert.equal(store.records.has("packet-2"), false);
});

test("keeps reads available but freezes mutations with deprecation metadata", async () => {
  const store = memoryStore();
  await store.setJSON("packet-1", packet());
  const handler = createIdeaPacketsHandler({
    env: {
      PLAN_OPERATOR_TOKEN: TOKEN,
      FANDOM_IDEA_PACKETS_MODE: "read-only",
    },
    getStore: storeRouter(store),
  });

  const listed = await handler(request("GET"));
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get("deprecation"), "true");
  assert.match(listed.headers.get("link"), /create\.justlikekatie\.com/);

  const created = await handler(request("POST", { packet: packet({ id: "packet-2" }) }));
  assert.equal(created.status, 423);
  assert.equal((await created.json()).code, "FANDOM_IDEA_PACKETS_READ_ONLY");
  assert.equal(store.records.has("packet-2"), false);

  const mutated = await handler(request("PATCH", {
    id: "packet-1",
    expectedVersion: packet().version,
    action: { type: "update_context", notes: "Must not apply" },
  }));
  assert.equal(mutated.status, 423);
  assert.equal(store.records.get("packet-1").notes, "");
});

test("fails packet mutations closed when cutover mode is invalid", async () => {
  for (const value of ["", "  ", "invalid"]) {
    const store = memoryStore();
    const handler = createIdeaPacketsHandler({
      env: {
        PLAN_OPERATOR_TOKEN: TOKEN,
        FANDOM_IDEA_PACKETS_MODE: value,
      },
      getStore: storeRouter(store),
    });
    const response = await handler(request("POST", { packet: packet() }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "FANDOM_IDEA_PACKETS_MODE_INVALID");
    assert.equal(store.records.size, 0);
  }
});
