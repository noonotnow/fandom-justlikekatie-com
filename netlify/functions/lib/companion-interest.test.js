import test from "node:test";
import assert from "node:assert/strict";
import { createCompanionInterest } from "./companion-interest.js";

const url = "https://example.com/.netlify/functions/companion-interest";
const request = (body, origin = "https://example.com") => new Request(url, {
  method: "POST", headers: { origin, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

test("pilot interest requires separate consent and exact source path", async () => {
  const data = new Map();
  const handler = createCompanionInterest({
    env: { FANDOM_AUTH_ID_SECRET: "test-only" },
    now: () => new Date("2026-09-26T12:00:00Z"),
    getStore: () => ({
      setJSON: async (key, value) => data.set(key, value),
      delete: async key => data.delete(key),
      get: async key => data.get(key),
    }),
  });
  const input = { action: "subscribe", email: "Person@Example.com", path: "context", consent: true };
  assert.equal((await handler(request({ ...input, consent: false }))).status, 400);
  assert.equal((await handler(request({ ...input, path: "forged" }))).status, 400);
  assert.equal((await handler(request(input, "https://evil.example"))).status, 403);
  assert.equal(data.size, 0);
  assert.equal((await handler(request(input))).status, 200);
  const [key, item] = [...data.entries()].find(([key]) => key.startsWith("subscribers/"));
  assert.match(key, /^subscribers\/[a-f0-9]{64}$/);
  assert.equal(item.email, "person@example.com");
  assert.equal(item.path, "context");
  assert.equal(item.consentedAt, "2026-09-26T12:00:00.000Z");
  const removed = await handler(request({ action: "unsubscribe", email: input.email }));
  assert.equal(removed.status, 200);
  assert.equal(data.has(key), false);
  assert.deepEqual([...data.values()].filter(row => row.action).map(row => row.action), ["added", "removed"]);
});

test("pilot interest fails closed without storage configuration", async () => {
  const handler = createCompanionInterest({ getStore: () => { throw new Error("offline"); }, env: {} });
  assert.equal((await handler(request({ action: "subscribe", email: "a@b.com", path: "discover", consent: true }))).status, 503);
});