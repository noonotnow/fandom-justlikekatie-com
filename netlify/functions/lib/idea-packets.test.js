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

function memoryStore() {
  const records = new Map();
  return {
    records,
    async get(key) { return structuredClone(records.get(key) ?? null); },
    async setJSON(key, value) { records.set(key, structuredClone(value)); },
    async list() { return { blobs: [...records.keys()].map(key => ({ key })) }; },
  };
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

test("prevents exact duplicate media and supports reversible compilation", () => {
  const once = applyAction(packet(), { type: "add_media", media: media() });
  assert.throws(() => applyAction(once, { type: "add_media", media: media() }), /already/);
  const compiled = applyAction(once, { type: "set_state", state: "media_compiled" });
  assert.equal(compiled.state, "media_compiled");
  const resumed = applyAction(compiled, { type: "set_state", state: "collecting" });
  assert.equal(resumed.state, "collecting");
});

test("persists, lists, reorders, removes, and rejects stale writes", async () => {
  const store = memoryStore();
  const handler = createIdeaPacketsHandler({
    env: { PLAN_OPERATOR_TOKEN: TOKEN },
    getStore: () => store,
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
    getStore: () => store,
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
    getStore: () => memoryStore(),
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
    getStore: () => store,
  });
  const edit = notes => handler(request("PATCH", {
    id: "packet-1",
    expectedVersion: packet().version,
    action: { type: "update_context", notes },
  }));

  const responses = await Promise.all([edit("first"), edit("second")]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
});
