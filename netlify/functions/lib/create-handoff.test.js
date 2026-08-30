import assert from "node:assert/strict";
import test from "node:test";
import { createCreateHandoffHandler } from "./create-handoff.js";

const ORIGIN = "https://fandom.justlikekatie.com";

function legacyRequest() {
  return new Request(`${ORIGIN}/api/create-handoff`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      Authorization: "Bearer operator-token",
    },
    body: JSON.stringify({
      packetId: "historical-packet",
      expectedVersion: "archived",
      outputs: [],
    }),
  });
}

test("rejects retired packet envelopes before opening a Blob store", async () => {
  let storeCalls = 0;
  const handler = createCreateHandoffHandler({
    env: { PLAN_OPERATOR_TOKEN: "operator-token" },
    getStore() {
      storeCalls += 1;
      throw new Error("retired packet storage must not be opened");
    },
  });

  const response = await handler(legacyRequest());
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Legacy Idea Packet.*no longer supported/i);
  assert.equal(storeCalls, 0);
});

test("preserves method and same-origin guards", async () => {
  const handler = createCreateHandoffHandler({
    env: { PLAN_OPERATOR_TOKEN: "operator-token" },
    getStore: () => { throw new Error("store must not be opened"); },
  });
  const getResponse = await handler(new Request(`${ORIGIN}/api/create-handoff`));
  assert.equal(getResponse.status, 405);

  const crossOrigin = new Request(`${ORIGIN}/api/create-handoff`, {
    method: "POST",
    headers: {
      Origin: "https://other.example",
      "Content-Type": "application/json",
      Authorization: "Bearer operator-token",
    },
    body: JSON.stringify({}),
  });
  assert.equal((await handler(crossOrigin)).status, 403);
});