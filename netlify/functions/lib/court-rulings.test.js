import assert from "node:assert/strict";
import test from "node:test";
import { createCourtRulingsHandler } from "./court-rulings.js";

function memoryStore() {
  const data = new Map();
  let version = 0;
  return {
    async get(key) {
      return data.has(key) ? structuredClone(data.get(key)) : null;
    },
    async getWithMetadata(key) {
      if (!data.has(key)) return null;
      return { data: structuredClone(data.get(key)), etag: `"${version}"` };
    },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && data.has(key)) return { modified: false };
      if (options.onlyIfMatch && options.onlyIfMatch !== `"${version}"`) return { modified: false };
      data.set(key, structuredClone(value));
      version += 1;
      return { modified: true };
    },
  };
}

function makeHandler({ store = memoryStore(), authenticateAdmin } = {}) {
  const auth = {
    authenticateAdmin: authenticateAdmin || (async () => ({ user: { accountId: "usr_test", email: "a@b.c" } })),
  };
  return { handler: createCourtRulingsHandler({ auth, getStore: () => store }), store };
}

const ORIGIN = "https://fandom.example";

function request(method, body) {
  return new Request(`${ORIGIN}/.netlify/functions/court-rulings`, {
    method,
    headers: method === "GET" ? {} : { origin: ORIGIN, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("GET returns an empty list before any rulings exist", async () => {
  const { handler } = makeHandler();
  const res = await handler(request("GET"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { rulings: [] });
});

test("POST adds a ruling and GET returns it without auth", async () => {
  const { handler } = makeHandler();
  const added = await handler(request("POST", { ruling: "  Case #1: guilty. 🦝  " }));
  assert.equal(added.status, 200);
  assert.deepEqual(await added.json(), { rulings: ["Case #1: guilty. 🦝"] });
  const listed = await handler(request("GET"));
  assert.deepEqual(await listed.json(), { rulings: ["Case #1: guilty. 🦝"] });
});

test("POST requires an authenticated session", async () => {
  const { handler } = makeHandler({
    authenticateAdmin: async () => {
      const error = new Error("Sign in is required.");
      error.status = 401;
      throw error;
    },
  });
  const res = await handler(request("POST", { ruling: "Case #2" }));
  assert.equal(res.status, 401);
});

test("POST and DELETE reject signed-in non-admin sessions with 403", async () => {
  const { handler } = makeHandler({
    authenticateAdmin: async () => {
      const error = new Error("Admin access is required.");
      error.status = 403;
      throw error;
    },
  });
  assert.equal((await handler(request("POST", { ruling: "Case #X" }))).status, 403);
  assert.equal((await handler(request("DELETE", { index: 0 }))).status, 403);
  // GET stays public even when mutations are forbidden.
  const listed = await handler(request("GET"));
  assert.equal(listed.status, 200);
});

test("POST rejects cross-origin requests", async () => {
  const { handler } = makeHandler();
  const res = await handler(new Request(`${ORIGIN}/.netlify/functions/court-rulings`, {
    method: "POST",
    headers: { origin: "https://evil.example" },
    body: JSON.stringify({ ruling: "Case #3" }),
  }));
  assert.equal(res.status, 403);
});

test("POST rejects empty rulings and duplicates are idempotent", async () => {
  const { handler } = makeHandler();
  assert.equal((await handler(request("POST", { ruling: "   " }))).status, 400);
  await handler(request("POST", { ruling: "Case #4" }));
  const res = await handler(request("POST", { ruling: "Case #4" }));
  assert.deepEqual(await res.json(), { rulings: ["Case #4"] });
});

test("DELETE removes by index when the text matches", async () => {
  const { handler } = makeHandler();
  await handler(request("POST", { ruling: "Case #5" }));
  await handler(request("POST", { ruling: "Case #6" }));
  const res = await handler(request("DELETE", { index: 0, ruling: "Case #5" }));
  assert.deepEqual(await res.json(), { rulings: ["Case #6"] });
});

test("DELETE returns 409 when the record changed underneath the editor", async () => {
  const { handler } = makeHandler();
  await handler(request("POST", { ruling: "Case #7" }));
  const stale = await handler(request("DELETE", { index: 0, ruling: "Case #999" }));
  assert.equal(stale.status, 409);
  const missing = await handler(request("DELETE", { index: 5 }));
  assert.equal(missing.status, 409);
});

test("unsupported methods return 405", async () => {
  const { handler } = makeHandler();
  const res = await handler(request("PUT", {}));
  assert.equal(res.status, 405);
});

test("real auth allowlist: non-admin session gets 403, admin session can add", async () => {
  const { createPublicAuth } = await import("./public-auth.js");
  const stores = new Map();
  const getStore = name => {
    if (!stores.has(name)) stores.set(name, memoryStore());
    return stores.get(name);
  };
  async function mintSession(email, token) {
    const auth = createPublicAuth({
      env: {
        FANDOM_AUTH_ID_SECRET: "identity-secret",
        FANDOM_PUBLIC_ORIGIN: ORIGIN,
        FANDOM_ADMIN_EMAILS: "admin@example.com",
      },
      getStore,
      sendEmail: async () => {},
      randomToken: () => token,
      now: () => new Date("2026-08-16T01:00:00Z"),
    });
    await auth.requestMagicLink(new Request(`${ORIGIN}/api/auth/magic-link`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }));
    const verified = await auth.verifyMagicLink(new Request(`${ORIGIN}/api/auth/verify`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }));
    return { auth, cookie: verified.headers.get("set-cookie").split(";")[0] };
  }

  const nonAdmin = await mintSession("visitor@example.com", "magic-token-non-admin-at-least-thirty-two-chars");
  const nonAdminHandler = createCourtRulingsHandler({ auth: nonAdmin.auth, getStore });
  const denied = await nonAdminHandler(new Request(`${ORIGIN}/.netlify/functions/court-rulings`, {
    method: "POST",
    headers: { origin: ORIGIN, cookie: nonAdmin.cookie, "content-type": "application/json" },
    body: JSON.stringify({ ruling: "Case #NA" }),
  }));
  assert.equal(denied.status, 403);

  const admin = await mintSession("admin@example.com", "magic-token-for-admin-at-least-thirty-two-chars");
  const adminHandler = createCourtRulingsHandler({ auth: admin.auth, getStore });
  const allowed = await adminHandler(new Request(`${ORIGIN}/.netlify/functions/court-rulings`, {
    method: "POST",
    headers: { origin: ORIGIN, cookie: admin.cookie, "content-type": "application/json" },
    body: JSON.stringify({ ruling: "Case #Admin" }),
  }));
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), { rulings: ["Case #Admin"] });
});
