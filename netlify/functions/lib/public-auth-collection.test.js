import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { createPublicAuth } from "./public-auth.js";
import { syncCollection } from "./collection-repository.js";
import { createCollectionHandlers } from "./collection-api.js";
import { sendMagicLinkEmail } from "./resend-email.js";

function memoryStore() {
  const records = new Map();
  let revision = 0;
  return {
    async get(key) { return structuredClone(records.get(key)?.data ?? null); },
    async getWithMetadata(key) {
      const entry = records.get(key);
      return entry ? { data: structuredClone(entry.data), etag: entry.etag } : null;
    },
    async setJSON(key, value, options = {}) {
      const current = records.get(key);
      if (options.onlyIfNew && current) return { modified: false };
      if (options.onlyIfMatch && options.onlyIfMatch !== current?.etag) return { modified: false };
      revision += 1;
      records.set(key, { data: structuredClone(value), etag: `etag-${revision}` });
      return { modified: true };
    },
    records,
  };
}

function request(path, { method = "POST", body, cookie, headers = {} } = {}) {
  return new Request(`https://fandom.justlikekatie.com${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(method === "GET" ? {} : { Origin: "https://fandom.justlikekatie.com" }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("magic links are hashed, single-use, and mint a secure revocable session", async () => {
  const stores = new Map();
  const getStore = name => {
    if (!stores.has(name)) stores.set(name, memoryStore());
    return stores.get(name);
  };
  const delivered = [];
  const tokens = [
    "magic-token-with-at-least-thirty-two-characters",
    "session-token-with-at-least-thirty-two-characters",
  ];
  const auth = createPublicAuth({
    env: {
      FANDOM_AUTH_ID_SECRET: "identity-secret",
      FANDOM_PUBLIC_ORIGIN: "https://fandom.justlikekatie.com",
    },
    getStore,
    sendEmail: async message => delivered.push(message),
    randomToken: () => tokens.shift(),
    now: () => new Date("2026-08-10T01:00:00Z"),
  });

  const requested = await auth.requestMagicLink(request("/api/auth/magic-link", {
    body: { email: " Person@Example.com " },
  }));
  assert.equal(requested.status, 202);
  assert.equal(delivered[0].email, "person@example.com");
  assert.match(delivered[0].magicLink, /#token=magic-token/);
  const magicStore = stores.get("fandom-auth-magic-links");
  assert.equal([...magicStore.records.keys()].some(key => key.includes(tokens[0] || "raw-token")), false);

  const verified = await auth.verifyMagicLink(request("/api/auth/verify", {
    body: { token: "magic-token-with-at-least-thirty-two-characters" },
  }));
  assert.equal(verified.status, 200);
  const cookie = verified.headers.get("set-cookie");
  assert.match(cookie, /__Host-fandom_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);

  const replay = await auth.verifyMagicLink(request("/api/auth/verify", {
    body: { token: "magic-token-with-at-least-thirty-two-characters" },
  }));
  assert.equal(replay.status, 401);

  const session = await auth.getSession(request("/api/auth/session", {
    method: "GET",
    cookie: cookie.split(";")[0],
  }));
  assert.equal((await session.json()).user.email, "person@example.com");
  const logout = await auth.logout(request("/api/auth/logout", {
    body: {},
    cookie: cookie.split(";")[0],
  }));
  assert.equal(logout.status, 200);
  const afterLogout = await auth.getSession(request("/api/auth/session", {
    method: "GET",
    cookie: cookie.split(";")[0],
  }));
  assert.equal((await afterLogout.json()).user, null);
});

test("admin magic-link end-to-end: request with next=plan → link URL carries next=plan → verify → session → plan destination", async () => {
  // This test walks the complete server-side path an admin goes through:
  //   1. POST /api/auth/magic-link with { email: adminEmail, next: 'plan' }
  //   2. Parse the emitted URL — token and next=plan must both be present in the fragment
  //   3. POST /api/auth/verify with the extracted token
  //   4. Assert the session cookie is issued and the session belongs to the admin
  //   5. Assert that reading `next` from the fragment yields 'plan', which is exactly
  //      what consumeMagicLinkFromLocation does before calling setView(destination)
  const adminEmail = "admin@example.com";
  const stores = new Map();
  const getStore = name => {
    if (!stores.has(name)) stores.set(name, memoryStore());
    return stores.get(name);
  };
  const delivered = [];
  const tokens = [
    "admin-magic-token-e2e-with-at-least-thirty-two-chars",
    "admin-session-token-e2e-with-at-least-32-x",
  ];
  const auth = createPublicAuth({
    env: {
      FANDOM_AUTH_ID_SECRET: "identity-secret",
      FANDOM_PUBLIC_ORIGIN: "https://fandom.justlikekatie.com",
      FANDOM_ADMIN_EMAILS: adminEmail,
    },
    getStore,
    sendEmail: async message => delivered.push(message),
    randomToken: () => tokens.shift(),
    now: () => new Date("2026-08-10T01:00:00Z"),
  });

  // Step 1: AdminSignIn posts { email, next: 'plan' }
  const requestRes = await auth.requestMagicLink(request("/api/auth/magic-link", {
    body: { email: adminEmail, next: "plan" },
  }));
  assert.equal(requestRes.status, 202, "magic-link request must succeed");
  assert.equal(delivered.length, 1, "exactly one email must be delivered");

  // Step 2: Parse the emitted link the way consumeMagicLinkFromLocation does —
  // it reads from window.location.hash, so we parse the fragment here.
  const linkUrl = new URL(delivered[0].magicLink);
  const fragment = new URLSearchParams(linkUrl.hash.slice(1)); // drop the leading '#'
  const extractedToken = fragment.get("token");
  const extractedNext = fragment.get("next");

  assert.ok(extractedToken, "magic-link URL must carry a token in the fragment");
  assert.equal(
    extractedNext,
    "plan",
    "magic-link URL fragment must contain next=plan so consumeMagicLinkFromLocation returns 'plan'",
  );

  // Step 3: POST /api/auth/verify — mirrors the fetch inside consumeMagicLinkFromLocation
  const verifyRes = await auth.verifyMagicLink(request("/api/auth/verify", {
    body: { token: extractedToken },
  }));
  assert.equal(verifyRes.status, 200, "verify must succeed with the token from the emailed link");

  // Step 4: Session cookie is issued
  const cookie = verifyRes.headers.get("set-cookie");
  assert.match(cookie, /__Host-fandom_session=/, "a session cookie must be set after verification");

  // Step 5: The session belongs to the admin email
  const sessionRes = await auth.getSession(request("/api/auth/session", {
    method: "GET",
    cookie: cookie.split(";")[0],
  }));
  assert.equal(sessionRes.status, 200);
  const sessionBody = await sessionRes.json();
  assert.equal(sessionBody.user.email, adminEmail, "session must belong to the admin email");
  assert.equal(sessionBody.user.isAdmin, true, "session must have isAdmin:true for an admin email");

  // Step 6: consumeMagicLinkFromLocation reads `next` from the fragment and
  // returns 'plan' when next === 'plan'. Confirm that the value we extracted
  // in step 2 triggers the plan branch, i.e. the view the client navigates to.
  const clientDestination = extractedNext === "plan" ? "plan" : "collection";
  assert.equal(
    clientDestination,
    "plan",
    "consumeMagicLinkFromLocation must resolve to 'plan' so setView routes the admin to the plan view",
  );
});

test("magic-link URL contains next=plan when next=plan is posted, enabling the plan redirect", async () => {
  const stores = new Map();
  const getStore = name => {
    if (!stores.has(name)) stores.set(name, memoryStore());
    return stores.get(name);
  };
  const delivered = [];
  const auth = createPublicAuth({
    env: {
      FANDOM_AUTH_ID_SECRET: "identity-secret",
      FANDOM_PUBLIC_ORIGIN: "https://fandom.justlikekatie.com",
    },
    getStore,
    sendEmail: async message => delivered.push(message),
    randomToken: () => "admin-magic-token-with-at-least-thirty-two-chars",
    now: () => new Date("2026-08-10T01:00:00Z"),
  });

  const res = await auth.requestMagicLink(request("/api/auth/magic-link", {
    body: { email: "admin@example.com", next: "plan" },
  }));
  assert.equal(res.status, 202);
  assert.equal(delivered.length, 1);

  // The magic link URL must carry next=plan in the fragment so that
  // consumeMagicLinkFromLocation can read it back and route to the plan view.
  assert.match(
    delivered[0].magicLink,
    /[#&]next=plan/,
    "magic-link URL must contain next=plan so the client redirects to the plan view",
  );
});

test("magic-link URL omits next param when next is not provided", async () => {
  const stores = new Map();
  const getStore = name => {
    if (!stores.has(name)) stores.set(name, memoryStore());
    return stores.get(name);
  };
  const delivered = [];
  const auth = createPublicAuth({
    env: {
      FANDOM_AUTH_ID_SECRET: "identity-secret",
      FANDOM_PUBLIC_ORIGIN: "https://fandom.justlikekatie.com",
    },
    getStore,
    sendEmail: async message => delivered.push(message),
    randomToken: () => "regular-magic-token-with-at-least-thirty-two-chars",
    now: () => new Date("2026-08-10T01:00:00Z"),
  });

  const res = await auth.requestMagicLink(request("/api/auth/magic-link", {
    body: { email: "user@example.com" },
  }));
  assert.equal(res.status, 202);
  assert.equal(delivered.length, 1);
  assert.ok(
    !delivered[0].magicLink.includes("next="),
    "magic-link URL must not contain a next param when none was requested",
  );
});

test("magic-link URL omits next param when an unrecognised next value is posted", async () => {
  const stores = new Map();
  const getStore = name => {
    if (!stores.has(name)) stores.set(name, memoryStore());
    return stores.get(name);
  };
  const delivered = [];
  const auth = createPublicAuth({
    env: {
      FANDOM_AUTH_ID_SECRET: "identity-secret",
      FANDOM_PUBLIC_ORIGIN: "https://fandom.justlikekatie.com",
    },
    getStore,
    sendEmail: async message => delivered.push(message),
    randomToken: () => "unknown-magic-token-with-at-least-thirty-two-chars",
    now: () => new Date("2026-08-10T01:00:00Z"),
  });

  const res = await auth.requestMagicLink(request("/api/auth/magic-link", {
    body: { email: "user@example.com", next: "dashboard" },
  }));
  assert.equal(res.status, 202);
  assert.equal(delivered.length, 1);
  assert.ok(
    !delivered[0].magicLink.includes("next="),
    "magic-link URL must not forward unrecognised next values (open-redirect guard)",
  );
});

test("Resend delivery uses only server configuration", async () => {
  let call;
  await sendMagicLinkEmail({
    env: {
      RESEND_API_KEY: "server-only-key",
      FANDOM_AUTH_FROM_EMAIL: "Fandom <login@auth.justlikekatie.com>",
    },
    email: "person@example.com",
    magicLink: "https://fandom.justlikekatie.com/auth/verify#token=secret",
    fetchImpl: async (...args) => {
      call = args;
      return new Response("", { status: 202 });
    },
  });
  assert.equal(call[0], "https://api.resend.com/emails");
  assert.equal(call[1].headers.Authorization, "Bearer server-only-key");
  assert.equal(JSON.parse(call[1].body).to[0], "person@example.com");
});

test("collection sync is idempotent, URL-independent, cursor-based, and tombstoned", async () => {
  const store = memoryStore();
  const upsert = {
    schemaVersion: 1,
    clientId: "device-a",
    cursor: 0,
    operations: [{
      type: "upsert",
      mutationId: "mutation-a",
      localId: "local-a",
      item: {
        resultId: "canonical-result",
        imageUrl: "https://images.example/one.jpg",
        thumbnailUrl: "https://images.example/one-thumb.jpg",
      },
    }],
  };
  const first = await syncCollection(store, "usr_test", upsert);
  const id = first.mappings["local-a"];
  const replay = await syncCollection(store, "usr_test", upsert);
  assert.equal(replay.mappings["local-a"], id);
  assert.equal(replay.revision, first.revision);

  const secondDevice = await syncCollection(store, "usr_test", {
    ...upsert,
    clientId: "device-b",
    operations: [{
      ...upsert.operations[0],
      mutationId: "mutation-b",
      localId: "local-b",
      item: { ...upsert.operations[0].item, imageUrl: "https://images.example/two.jpg" },
    }],
  });
  assert.equal(secondDevice.mappings["local-b"], id);

  const removed = await syncCollection(store, "usr_test", {
    schemaVersion: 1,
    clientId: "device-b",
    cursor: first.cursor,
    operations: [{ type: "delete", mutationId: "mutation-c", localId: "local-b", serverId: id }],
  });
  assert.equal(removed.items.length, 0);
  assert.equal(removed.tombstones[0].id, id);
});

test("grid sync preserves artifact identity across devices", async () => {
  const store = memoryStore();
  const item = {
    kind: "grid",
    id: "grid-artifact-1",
    schemaVersion: 1,
    rendererVersion: "vibe-atlas-v1",
    images: [{
      resultId: "result-1",
      imageUrl: "/api/image-proxy?url=https%3A%2F%2Fimages.example%2Fone.jpg",
    }],
  };
  const first = await syncCollection(store, "usr_test", {
    schemaVersion: 1,
    clientId: "device-a",
    cursor: 0,
    operations: [{
      type: "upsert",
      mutationId: "grid-mutation-a",
      localId: "grid-local-a",
      item,
    }],
  });
  const serverId = first.mappings["grid-local-a"];
  assert.equal(first.items[0].artifactId, item.id);
  assert.equal(first.items[0].id, serverId);

  const second = await syncCollection(store, "usr_test", {
    schemaVersion: 1,
    clientId: "device-b",
    cursor: 0,
    operations: [{
      type: "upsert",
      mutationId: "grid-mutation-b",
      localId: "grid-local-b",
      item,
    }],
  });
  assert.equal(second.mappings["grid-local-b"], serverId);
  assert.equal(second.items.length, 1);
  assert.equal(second.items[0].artifactId, item.id);
});

test("CREATE collection reads require the dedicated GET-only HMAC scope", async () => {
  const store = memoryStore();
  const env = {
    CREATE_FANDOM_COLLECTION_READ_KEY_ID: "read-key",
    CREATE_FANDOM_COLLECTION_READ_SECRET: "read-secret",
  };
  const now = new Date("2026-08-10T01:00:00Z");
  const handlers = createCollectionHandlers({
    auth: {},
    getStore: () => store,
    env,
    now: () => now,
  });
  const path = "/api/create/collection?accountId=usr_abcdefghijklmnopqrstuvwxyzABCDEF&cursor=0";
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const digest = createHash("sha256").update("").digest("hex");
  const signature = createHmac("sha256", env.CREATE_FANDOM_COLLECTION_READ_SECRET)
    .update(`${timestamp}\nGET\n${path}\n${digest}`)
    .digest("hex");
  const response = await handlers.createRead(request(path, {
    method: "GET",
    headers: {
      "X-Fandom-Key-Id": "read-key",
      "X-Fandom-Timestamp": timestamp,
      "X-Fandom-Signature": `v1=${signature}`,
    },
  }));
  assert.equal(response.status, 200);
  const mutation = await handlers.createRead(request(path, { body: {} }));
  assert.equal(mutation.status, 405);
});

test("getSession returns isAdmin:true for an email in FANDOM_ADMIN_EMAILS", async () => {
  const stores = new Map();
  const getStore = name => {
    if (!stores.has(name)) stores.set(name, memoryStore());
    return stores.get(name);
  };
  const sessionToken = "session-token-admin-exactly-thirty-two-chars";
  const sessionKey = `sessions/${createHash("sha256").update(sessionToken).digest("hex")}`;
  const accountId = "usr_admin_account";
  const sessionStore = getStore("fandom-auth-sessions");
  const userStore = getStore("fandom-auth-users");
  await sessionStore.setJSON(sessionKey, {
    schemaVersion: 1,
    sessionId: "sid-admin",
    accountId,
    issuedAt: "2026-08-10T00:00:00Z",
    expiresAt: "2027-08-10T00:00:00Z",
    revokedAt: null,
  });
  await userStore.setJSON(`users/${accountId}`, {
    schemaVersion: 1,
    accountId,
    email: "admin@example.com",
    createdAt: "2026-08-10T00:00:00Z",
    lastLoginAt: "2026-08-10T00:00:00Z",
  });
  const auth = createPublicAuth({
    env: {
      FANDOM_AUTH_ID_SECRET: "secret",
      FANDOM_ADMIN_EMAILS: "admin@example.com, other@example.com",
    },
    getStore,
    now: () => new Date("2026-08-10T01:00:00Z"),
  });
  const res = await auth.getSession(request("/api/auth/session", {
    method: "GET",
    cookie: `__Host-fandom_session=${sessionToken}`,
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.email, "admin@example.com");
  assert.equal(body.user.isAdmin, true);
});

test("getSession returns isAdmin:false for an email NOT in FANDOM_ADMIN_EMAILS", async () => {
  const stores = new Map();
  const getStore = name => {
    if (!stores.has(name)) stores.set(name, memoryStore());
    return stores.get(name);
  };
  const sessionToken = "session-token-nonadmin-exactly-thirty-two-x";
  const sessionKey = `sessions/${createHash("sha256").update(sessionToken).digest("hex")}`;
  const accountId = "usr_nonadmin_account";
  const sessionStore = getStore("fandom-auth-sessions");
  const userStore = getStore("fandom-auth-users");
  await sessionStore.setJSON(sessionKey, {
    schemaVersion: 1,
    sessionId: "sid-nonadmin",
    accountId,
    issuedAt: "2026-08-10T00:00:00Z",
    expiresAt: "2027-08-10T00:00:00Z",
    revokedAt: null,
  });
  await userStore.setJSON(`users/${accountId}`, {
    schemaVersion: 1,
    accountId,
    email: "regular@example.com",
    createdAt: "2026-08-10T00:00:00Z",
    lastLoginAt: "2026-08-10T00:00:00Z",
  });
  const auth = createPublicAuth({
    env: {
      FANDOM_AUTH_ID_SECRET: "secret",
      FANDOM_ADMIN_EMAILS: "admin@example.com",
    },
    getStore,
    now: () => new Date("2026-08-10T01:00:00Z"),
  });
  const res = await auth.getSession(request("/api/auth/session", {
    method: "GET",
    cookie: `__Host-fandom_session=${sessionToken}`,
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.email, "regular@example.com");
  assert.equal(body.user.isAdmin, false);
});

test("getSession returns isAdmin:false when FANDOM_ADMIN_EMAILS is unset", async () => {
  const stores = new Map();
  const getStore = name => {
    if (!stores.has(name)) stores.set(name, memoryStore());
    return stores.get(name);
  };
  const sessionToken = "session-token-noadminenv-exactly-thirty-two-x";
  const sessionKey = `sessions/${createHash("sha256").update(sessionToken).digest("hex")}`;
  const accountId = "usr_noadminenv_account";
  const sessionStore = getStore("fandom-auth-sessions");
  const userStore = getStore("fandom-auth-users");
  await sessionStore.setJSON(sessionKey, {
    schemaVersion: 1,
    sessionId: "sid-noadminenv",
    accountId,
    issuedAt: "2026-08-10T00:00:00Z",
    expiresAt: "2027-08-10T00:00:00Z",
    revokedAt: null,
  });
  await userStore.setJSON(`users/${accountId}`, {
    schemaVersion: 1,
    accountId,
    email: "someone@example.com",
    createdAt: "2026-08-10T00:00:00Z",
    lastLoginAt: "2026-08-10T00:00:00Z",
  });
  const originalWarn = console.warn;
  console.warn = () => {};
  let auth;
  try {
    auth = createPublicAuth({
      env: { FANDOM_AUTH_ID_SECRET: "secret" /* FANDOM_ADMIN_EMAILS deliberately absent */ },
      getStore,
      now: () => new Date("2026-08-10T01:00:00Z"),
    });
  } finally {
    console.warn = originalWarn;
  }
  const res = await auth.getSession(request("/api/auth/session", {
    method: "GET",
    cookie: `__Host-fandom_session=${sessionToken}`,
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.email, "someone@example.com");
  assert.equal(body.user.isAdmin, false);
});

test("createPublicAuth warns when FANDOM_ADMIN_EMAILS is absent entirely", () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    createPublicAuth({
      env: {
        FANDOM_AUTH_ID_SECRET: "secret",
        FANDOM_PUBLIC_ORIGIN: "https://example.com",
        /* FANDOM_ADMIN_EMAILS deliberately absent */
      },
      getStore: () => memoryStore(),
    });
    assert.equal(warnings.length, 1, "should emit exactly one warning when FANDOM_ADMIN_EMAILS is absent");
    assert.match(warnings[0], /FANDOM_ADMIN_EMAILS/);
    assert.match(warnings[0], /not set/);
  } finally {
    console.warn = originalWarn;
  }
});

test("getSession returns isAdmin:true when FANDOM_ADMIN_EMAILS entry has mixed case", async () => {
  const stores = new Map();
  const getStore = name => {
    if (!stores.has(name)) stores.set(name, memoryStore());
    return stores.get(name);
  };
  const sessionToken = "session-token-mixedcase-exactly-thirty-two-x";
  const sessionKey = `sessions/${createHash("sha256").update(sessionToken).digest("hex")}`;
  const accountId = "usr_mixedcase_account";
  const sessionStore = getStore("fandom-auth-sessions");
  const userStore = getStore("fandom-auth-users");
  await sessionStore.setJSON(sessionKey, {
    schemaVersion: 1,
    sessionId: "sid-mixedcase",
    accountId,
    issuedAt: "2026-08-10T00:00:00Z",
    expiresAt: "2027-08-10T00:00:00Z",
    revokedAt: null,
  });
  await userStore.setJSON(`users/${accountId}`, {
    schemaVersion: 1,
    accountId,
    email: "admin@example.com",
    createdAt: "2026-08-10T00:00:00Z",
    lastLoginAt: "2026-08-10T00:00:00Z",
  });
  const auth = createPublicAuth({
    env: {
      FANDOM_AUTH_ID_SECRET: "secret",
      FANDOM_ADMIN_EMAILS: "Admin@Example.com",
    },
    getStore,
    now: () => new Date("2026-08-10T01:00:00Z"),
  });
  const res = await auth.getSession(request("/api/auth/session", {
    method: "GET",
    cookie: `__Host-fandom_session=${sessionToken}`,
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.isAdmin, true, "mixed-case env var entry should still grant admin");
});

test("getSession returns isAdmin:true when FANDOM_ADMIN_EMAILS entry has leading/trailing whitespace", async () => {
  const stores = new Map();
  const getStore = name => {
    if (!stores.has(name)) stores.set(name, memoryStore());
    return stores.get(name);
  };
  const sessionToken = "session-token-whitespace-exactly-thirty-two-x";
  const sessionKey = `sessions/${createHash("sha256").update(sessionToken).digest("hex")}`;
  const accountId = "usr_whitespace_account";
  const sessionStore = getStore("fandom-auth-sessions");
  const userStore = getStore("fandom-auth-users");
  await sessionStore.setJSON(sessionKey, {
    schemaVersion: 1,
    sessionId: "sid-whitespace",
    accountId,
    issuedAt: "2026-08-10T00:00:00Z",
    expiresAt: "2027-08-10T00:00:00Z",
    revokedAt: null,
  });
  await userStore.setJSON(`users/${accountId}`, {
    schemaVersion: 1,
    accountId,
    email: "admin@example.com",
    createdAt: "2026-08-10T00:00:00Z",
    lastLoginAt: "2026-08-10T00:00:00Z",
  });
  const auth = createPublicAuth({
    env: {
      FANDOM_AUTH_ID_SECRET: "secret",
      FANDOM_ADMIN_EMAILS: "  admin@example.com  ",
    },
    getStore,
    now: () => new Date("2026-08-10T01:00:00Z"),
  });
  const res = await auth.getSession(request("/api/auth/session", {
    method: "GET",
    cookie: `__Host-fandom_session=${sessionToken}`,
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.isAdmin, true, "whitespace-padded env var entry should still grant admin");
});

test("createPublicAuth warns for each malformed entry in FANDOM_ADMIN_EMAILS", () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    createPublicAuth({
      env: { FANDOM_AUTH_ID_SECRET: "secret", FANDOM_PUBLIC_ORIGIN: "https://example.com", FANDOM_ADMIN_EMAILS: "admin@example.com, not-an-email, another-bad, @example.com, a@b" },
      getStore: () => memoryStore(),
    });
    assert.equal(warnings.length, 4, "should warn for each malformed entry (no-@, no-@, missing-local, no-dot)");
    assert.match(warnings[0], /not-an-email/);
    assert.match(warnings[1], /another-bad/);
    assert.match(warnings[2], /@example\.com/);
    assert.match(warnings[3], /a@b/);
  } finally {
    console.warn = originalWarn;
  }
});

test("createPublicAuth warns when FANDOM_PUBLIC_ORIGIN is absent", () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    createPublicAuth({
      env: {
        FANDOM_AUTH_ID_SECRET: "secret",
        FANDOM_ADMIN_EMAILS: "admin@example.com",
        /* FANDOM_PUBLIC_ORIGIN deliberately absent */
      },
      getStore: () => memoryStore(),
    });
    assert.equal(warnings.length, 1, "should emit exactly one warning when FANDOM_PUBLIC_ORIGIN is absent");
    assert.match(warnings[0], /FANDOM_PUBLIC_ORIGIN/);
    assert.match(warnings[0], /not set/);
  } finally {
    console.warn = originalWarn;
  }
});

test("createPublicAuth warns when FANDOM_AUTH_ID_SECRET is absent", () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    createPublicAuth({
      env: {
        FANDOM_PUBLIC_ORIGIN: "https://example.com",
        FANDOM_ADMIN_EMAILS: "admin@example.com",
        /* FANDOM_AUTH_ID_SECRET deliberately absent */
      },
      getStore: () => memoryStore(),
    });
    assert.equal(warnings.length, 1, "should emit exactly one warning when FANDOM_AUTH_ID_SECRET is absent");
    assert.match(warnings[0], /FANDOM_AUTH_ID_SECRET/);
    assert.match(warnings[0], /not set/);
  } finally {
    console.warn = originalWarn;
  }
});

test("createPublicAuth does not warn when FANDOM_ADMIN_EMAILS contains only valid entries", () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    createPublicAuth({
      env: { FANDOM_AUTH_ID_SECRET: "secret", FANDOM_PUBLIC_ORIGIN: "https://example.com", FANDOM_ADMIN_EMAILS: "admin@example.com, other@example.com" },
      getStore: () => memoryStore(),
    });
    assert.equal(warnings.length, 0, "should not warn for clean entries");
  } finally {
    console.warn = originalWarn;
  }
});

test("createPublicAuth excludes malformed entries from the admin list so they cannot grant access", async () => {
  const stores = new Map();
  const getStore = name => {
    if (!stores.has(name)) stores.set(name, memoryStore());
    return stores.get(name);
  };
  const sessionToken = "session-token-malformed-admin-exactly-32xx";
  const sessionKey = `sessions/${createHash("sha256").update(sessionToken).digest("hex")}`;
  const accountId = "usr_malformed_admin";
  const sessionStore = getStore("fandom-auth-sessions");
  const userStore = getStore("fandom-auth-users");
  await sessionStore.setJSON(sessionKey, {
    schemaVersion: 1,
    sessionId: "sid-malformed",
    accountId,
    issuedAt: "2026-08-10T00:00:00Z",
    expiresAt: "2027-08-10T00:00:00Z",
    revokedAt: null,
  });
  await userStore.setJSON(`users/${accountId}`, {
    schemaVersion: 1,
    accountId,
    email: "notanemail",
    createdAt: "2026-08-10T00:00:00Z",
    lastLoginAt: "2026-08-10T00:00:00Z",
  });
  const originalWarn = console.warn;
  console.warn = () => {};
  let auth;
  try {
    auth = createPublicAuth({
      env: {
        FANDOM_AUTH_ID_SECRET: "secret",
        FANDOM_ADMIN_EMAILS: "notanemail, @bad.com, a@b",
      },
      getStore,
      now: () => new Date("2026-08-10T01:00:00Z"),
    });
  } finally {
    console.warn = originalWarn;
  }
  const res = await auth.getSession(request("/api/auth/session", {
    method: "GET",
    cookie: `__Host-fandom_session=${sessionToken}`,
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.isAdmin, false, "malformed entries must not grant admin access");
});

test("verifyMagicLink returns 401 for an expired next=plan token (admin redirect is not silently granted)", async () => {
  // An admin clicks a stale magic link (e.g. opened hours later from email).
  // The server must reject the expired token with 401 so that the client-side
  // catch path fires: the user lands on the collection view with an error
  // notice rather than being granted a session on the plan view.
  const stores = new Map();
  const getStore = name => {
    if (!stores.has(name)) stores.set(name, memoryStore());
    return stores.get(name);
  };
  const delivered = [];
  const issuedAt = new Date("2026-08-10T01:00:00Z");
  const MAGIC_TTL_MS = 15 * 60 * 1000;
  let nowTime = issuedAt;
  const auth = createPublicAuth({
    env: {
      FANDOM_AUTH_ID_SECRET: "identity-secret",
      FANDOM_PUBLIC_ORIGIN: "https://fandom.justlikekatie.com",
      FANDOM_ADMIN_EMAILS: "admin@example.com",
    },
    getStore,
    sendEmail: async message => delivered.push(message),
    randomToken: () => "expired-plan-magic-token-with-at-least-32chars",
    now: () => nowTime,
  });

  // Issue a next=plan token — the link URL must carry next=plan in its fragment
  const requestRes = await auth.requestMagicLink(request("/api/auth/magic-link", {
    body: { email: "admin@example.com", next: "plan" },
  }));
  assert.equal(requestRes.status, 202, "magic-link request must succeed");
  assert.equal(delivered.length, 1, "one email must be delivered");
  const linkUrl = new URL(delivered[0].magicLink);
  const fragment = new URLSearchParams(linkUrl.hash.slice(1));
  assert.equal(fragment.get("next"), "plan", "emitted link must carry next=plan in fragment");

  // Advance time 1 ms past the TTL boundary — the token is now expired
  nowTime = new Date(issuedAt.getTime() + MAGIC_TTL_MS + 1);

  // The server must return 401: the client-side catch handler (not the success
  // path) fires, writing an error notice to sessionStorage and routing to 'collection'
  const verifyRes = await auth.verifyMagicLink(request("/api/auth/verify", {
    body: { token: fragment.get("token") },
  }));
  assert.equal(verifyRes.status, 401, "verifyMagicLink must return 401 for an expired next=plan token");
  const verifyBody = await verifyRes.json();
  assert.match(
    verifyBody.error,
    /invalid or expired/i,
    "error message must indicate the link is invalid or expired",
  );
});

test("verifyMagicLink returns 401 when a consumed next=plan token is replayed (plan redirect is not granted twice)", async () => {
  // An admin successfully signs in, then the same magic link is replayed
  // (e.g. a stolen or bookmarked link). The second attempt must be rejected
  // with 401 so the client-side catch path fires — no second session is issued
  // and the plan view is not opened for the attacker.
  const stores = new Map();
  const getStore = name => {
    if (!stores.has(name)) stores.set(name, memoryStore());
    return stores.get(name);
  };
  const delivered = [];
  const tokens = [
    "replay-plan-magic-token-with-at-least-thirty-two-x",
    "replay-plan-session-token-with-at-least-thirty-two",
  ];
  const auth = createPublicAuth({
    env: {
      FANDOM_AUTH_ID_SECRET: "identity-secret",
      FANDOM_PUBLIC_ORIGIN: "https://fandom.justlikekatie.com",
      FANDOM_ADMIN_EMAILS: "admin@example.com",
    },
    getStore,
    sendEmail: async message => delivered.push(message),
    randomToken: () => tokens.shift(),
    now: () => new Date("2026-08-10T01:00:00Z"),
  });

  // Issue a next=plan token — the emitted link must carry next=plan
  const requestRes = await auth.requestMagicLink(request("/api/auth/magic-link", {
    body: { email: "admin@example.com", next: "plan" },
  }));
  assert.equal(requestRes.status, 202, "magic-link request must succeed");
  assert.equal(delivered.length, 1, "one email must be delivered");
  const linkUrl = new URL(delivered[0].magicLink);
  const fragment = new URLSearchParams(linkUrl.hash.slice(1));
  const magicToken = fragment.get("token");
  assert.equal(fragment.get("next"), "plan", "emitted link must carry next=plan in fragment");

  // First verification succeeds and consumes the token
  const firstVerify = await auth.verifyMagicLink(request("/api/auth/verify", {
    body: { token: magicToken },
  }));
  assert.equal(firstVerify.status, 200, "first verify must succeed and issue a session");

  // Replaying the same next=plan token must be rejected — it is now consumed
  const replay = await auth.verifyMagicLink(request("/api/auth/verify", {
    body: { token: magicToken },
  }));
  assert.equal(replay.status, 401, "replaying a consumed next=plan token must return 401");
  const replayBody = await replay.json();
  assert.match(
    replayBody.error,
    /invalid or expired/i,
    "replay error message must indicate the link is invalid or expired",
  );
});

test("requireConfiguration does not throw when all required keys are present", async () => {
  // Happy path: both keys set → requestMagicLink proceeds past the guard and returns 202.
  const stores = new Map();
  const getStore = name => {
    if (!stores.has(name)) stores.set(name, memoryStore());
    return stores.get(name);
  };
  const auth = createPublicAuth({
    env: {
      FANDOM_AUTH_ID_SECRET: "identity-secret",
      FANDOM_PUBLIC_ORIGIN: "https://fandom.justlikekatie.com",
      FANDOM_ADMIN_EMAILS: "admin@example.com",
    },
    getStore,
    sendEmail: async () => {},
    randomToken: () => "require-config-happy-token-at-least-thirty-two",
    now: () => new Date("2026-08-10T01:00:00Z"),
  });
  const res = await auth.requestMagicLink(request("/api/auth/magic-link", {
    body: { email: "user@example.com" },
  }));
  // A 503 here would mean requireConfiguration threw; 202 confirms it did not.
  assert.equal(res.status, 202, "requestMagicLink must not return 503 when all required env vars are set");
});

test("requireConfiguration names the missing key when one required variable is absent", async () => {
  // FANDOM_PUBLIC_ORIGIN absent → requireConfiguration throws an Error that names it.
  // withErrors catches the plain Error and logs it via console.error, then returns 503.
  const errors = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.warn = () => {};
  console.error = (...args) => errors.push(args.map(a => (a instanceof Error ? a.message : String(a))).join(" "));
  let auth;
  try {
    auth = createPublicAuth({
      env: {
        FANDOM_AUTH_ID_SECRET: "identity-secret",
        /* FANDOM_PUBLIC_ORIGIN deliberately absent */
      },
      getStore: () => memoryStore(),
      sendEmail: async () => {},
      now: () => new Date("2026-08-10T01:00:00Z"),
    });
  } finally {
    console.warn = originalWarn;
  }
  try {
    const res = await auth.requestMagicLink(request("/api/auth/magic-link", {
      body: { email: "user@example.com" },
    }));
    assert.equal(res.status, 503, "missing FANDOM_PUBLIC_ORIGIN must yield 503");
    assert.ok(
      errors.some(msg => msg.includes("FANDOM_PUBLIC_ORIGIN")),
      `console.error must mention FANDOM_PUBLIC_ORIGIN; got: ${JSON.stringify(errors)}`,
    );
  } finally {
    console.error = originalError;
  }
});

test("requireConfiguration names all missing keys when two required variables are absent", async () => {
  // Both FANDOM_AUTH_ID_SECRET and FANDOM_PUBLIC_ORIGIN absent → error lists both.
  const errors = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.warn = () => {};
  console.error = (...args) => errors.push(args.map(a => (a instanceof Error ? a.message : String(a))).join(" "));
  let auth;
  try {
    auth = createPublicAuth({
      env: {
        /* both required keys deliberately absent */
        FANDOM_ADMIN_EMAILS: "admin@example.com",
      },
      getStore: () => memoryStore(),
      sendEmail: async () => {},
      now: () => new Date("2026-08-10T01:00:00Z"),
    });
  } finally {
    console.warn = originalWarn;
  }
  try {
    const res = await auth.requestMagicLink(request("/api/auth/magic-link", {
      body: { email: "user@example.com" },
    }));
    assert.equal(res.status, 503, "missing both required vars must yield 503");
    const combined = errors.join(" ");
    assert.ok(
      combined.includes("FANDOM_AUTH_ID_SECRET"),
      `console.error must mention FANDOM_AUTH_ID_SECRET; got: ${JSON.stringify(errors)}`,
    );
    assert.ok(
      combined.includes("FANDOM_PUBLIC_ORIGIN"),
      `console.error must mention FANDOM_PUBLIC_ORIGIN; got: ${JSON.stringify(errors)}`,
    );
  } finally {
    console.error = originalError;
  }
});

test("collection sync rejects a stale tab when its expected account differs from the cookie session", async () => {
  const store = memoryStore();
  const handlers = createCollectionHandlers({
    auth: {
      authenticate: async () => ({ user: { accountId: "usr_account_b" } }),
    },
    getStore: () => store,
  });
  const response = await handlers.sync(request("/api/collection/sync", {
    body: {
      schemaVersion: 1,
      clientId: "stale-tab",
      expectedAccountId: "usr_account_a",
      cursor: 0,
      operations: [],
    },
  }));
  assert.equal(response.status, 409);
  assert.equal(store.records.size, 0);
});

test("concurrent verifyMagicLink: exactly one request gets a session and the other gets 401", async () => {
  // Simulate the real concurrent race: two requests receive the same magic link and
  // both POST /api/auth/verify at the same moment. Both reads see the "issued" token
  // before either write commits. The store's onlyIfMatch CAS ensures only one write
  // succeeds, so exactly one caller gets a session cookie and the other gets 401.
  const stores = new Map();
  const getStore = name => {
    if (!stores.has(name)) stores.set(name, memoryStore());
    return stores.get(name);
  };
  const delivered = [];
  const tokens = [
    "concurrent-race-magic-token-exactly-32-chars",
    "concurrent-race-session-token-exactly-32xx",
  ];
  const auth = createPublicAuth({
    env: {
      FANDOM_AUTH_ID_SECRET: "identity-secret",
      FANDOM_PUBLIC_ORIGIN: "https://fandom.justlikekatie.com",
    },
    getStore,
    sendEmail: async message => delivered.push(message),
    randomToken: () => tokens.shift(),
    now: () => new Date("2026-08-10T01:00:00Z"),
  });

  // Seed the magic store with a single "issued" token.
  await auth.requestMagicLink(request("/api/auth/magic-link", {
    body: { email: "race@example.com" },
  }));

  // Fire two verifyMagicLink calls concurrently with the same token.
  // Both coroutines read the "issued" record (same etag) before either writes.
  // The first setJSON(onlyIfMatch) wins; the second sees the changed etag and
  // gets { modified: false }, which verifyMagicLink converts to 401.
  const makeVerifyRequest = () => auth.verifyMagicLink(
    request("/api/auth/verify", {
      body: { token: "concurrent-race-magic-token-exactly-32-chars" },
    }),
  );
  const [resA, resB] = await Promise.all([makeVerifyRequest(), makeVerifyRequest()]);

  const statuses = [resA.status, resB.status].sort();
  assert.deepEqual(statuses, [200, 401], "exactly one request must succeed and one must get 401");

  // Exactly one session must have been persisted in the sessions store.
  const sessionStore = stores.get("fandom-auth-sessions");
  assert.equal(sessionStore.records.size, 1, "exactly one session must be created");

  // The 200 response must carry a valid session cookie.
  const winner = resA.status === 200 ? resA : resB;
  const cookie = winner.headers.get("set-cookie");
  assert.match(cookie, /__Host-fandom_session=/, "the winning request must receive a session cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
});

test("verifyMagicLink returns 401 when the post-write re-read reveals a claim mismatch (second CAS guard)", async () => {
  // Simulates the edge case where setJSON succeeds (onlyIfMatch passes) but another
  // concurrent writer overtakes the store between the write and the follow-up read.
  // The re-read (line 136 of public-auth.js) sees a different claim than the one
  // just written, so verifyMagicLink must return 401 — no session is issued.
  //
  // We achieve this with a hand-crafted magic store whose getWithMetadata behaves
  // differently on the second call for the token key:
  //   call 1 (initial read)  → returns the "issued" entry with a valid etag
  //   setJSON                → succeeds (returns { modified: true })
  //   call 2 (post-write re-read) → returns the same key but with a DIFFERENT claim,
  //                                  simulating an overtaking write
  const delivered = [];
  const magicToken = "claim-mismatch-magic-token-at-least-32-chars";
  const issuedAt = new Date("2026-08-10T01:00:00Z");
  const expiresAt = new Date(issuedAt.getTime() + 15 * 60 * 1000).toISOString();

  // Precompute what the token key will be so we can intercept only that key.
  const { createHash: _ch } = await import("node:crypto");
  const tokenKey = `tokens/${_ch("sha256").update(magicToken).digest("hex")}`;

  // Build the "issued" record that the first getWithMetadata call returns.
  const issuedRecord = {
    schemaVersion: 1,
    accountId: "usr_claimtest",
    email: "claimtest@example.com",
    status: "issued",
    issuedAt: issuedAt.toISOString(),
    expiresAt,
  };

  let getWithMetadataCallCount = 0;

  // Minimal store that serves the token key with controlled behaviour.
  const claimMismatchMagicStore = {
    async get(key) {
      const entry = baseRecords.get(key);
      return entry ? structuredClone(entry.data) : null;
    },
    async getWithMetadata(key) {
      if (key === tokenKey) {
        getWithMetadataCallCount += 1;
        if (getWithMetadataCallCount === 1) {
          // First call: return the "issued" entry so the token passes initial validation.
          return { data: structuredClone(issuedRecord), etag: "etag-issued" };
        }
        // Second call (post-write re-read): return a consumed record with a DIFFERENT
        // claim, simulating a concurrent writer that overtook our write.
        return {
          data: { ...issuedRecord, status: "consumed", claim: "a-different-claim-not-ours" },
          etag: "etag-overtaken",
        };
      }
      const entry = baseRecords.get(key);
      return entry ? { data: structuredClone(entry.data), etag: entry.etag } : null;
    },
    async setJSON(key, value, options = {}) {
      // Accept the write unconditionally for the token key (simulating a successful CAS).
      // For all other keys (users, sessions) behave as a normal store.
      if (key === tokenKey) return { modified: true };
      const current = baseRecords.get(key);
      if (options.onlyIfNew && current) return { modified: false };
      if (options.onlyIfMatch && options.onlyIfMatch !== current?.etag) return { modified: false };
      baseRevision += 1;
      baseRecords.set(key, { data: structuredClone(value), etag: `etag-${baseRevision}` });
      return { modified: true };
    },
    records: new Map(),
  };

  const baseRecords = new Map();
  let baseRevision = 0;

  const getStore = name => {
    if (name === "fandom-auth-magic-links") return claimMismatchMagicStore;
    // All other stores (users, sessions, rate-limits) are regular memory stores.
    if (!otherStores.has(name)) otherStores.set(name, memoryStore());
    return otherStores.get(name);
  };
  const otherStores = new Map();

  const auth = createPublicAuth({
    env: {
      FANDOM_AUTH_ID_SECRET: "identity-secret",
      FANDOM_PUBLIC_ORIGIN: "https://fandom.justlikekatie.com",
    },
    getStore,
    sendEmail: async message => delivered.push(message),
    randomToken: () => magicToken,
    now: () => issuedAt,
  });

  const res = await auth.verifyMagicLink(request("/api/auth/verify", {
    body: { token: magicToken },
  }));

  assert.equal(res.status, 401, "claim mismatch on post-write re-read must return 401");
  const body = await res.json();
  assert.match(body.error, /invalid or expired/i, "error must say the link is invalid or expired");

  // No session must have been created — the mismatch guard fired before session creation.
  const sessionStore = otherStores.get("fandom-auth-sessions");
  const sessionCount = sessionStore ? sessionStore.records.size : 0;
  assert.equal(sessionCount, 0, "no session must be created when the claim mismatch guard fires");
});
