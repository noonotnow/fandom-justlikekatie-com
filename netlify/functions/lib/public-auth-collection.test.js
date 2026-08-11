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
