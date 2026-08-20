import test from "node:test";
import assert from "node:assert/strict";
import { createMiddleEarthAIHandler } from "./middle-earth-ai.js";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const ORIGIN = "https://fandom.example";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

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

// Always-conflict store: every setJSON CAS attempt fails (modified: false).
// Used to test fail-closed rate-limiter behaviour.
function alwaysConflictStore() {
  return {
    async get() { return null; },
    async getWithMetadata() { return null; },
    async setJSON() { return { modified: false }; },
  };
}

function makeAdminAuth(accountId = "usr_admin_01") {
  return {
    authenticateAdmin: async () => ({ user: { accountId, email: "admin@example.com" } }),
  };
}

function makeAuth(status, message) {
  return {
    authenticateAdmin: async () => {
      const err = new Error(message);
      err.status = status;
      throw err;
    },
  };
}

// A connector-client test double that captures calls and returns scripted responses.
// Matches the ReplitConnectors interface: proxy(connectorName, path, options) -> Response-like
function makeConnector({
  discoveryModels = [{ id: "grok-2-test" }],
  chatResponse = null,
  chatStatus = 200,
  discoveryStatus = 200,
  discoveryThrow = false,
  chatThrow = false,
} = {}) {
  const calls = [];

  return {
    calls,
    proxy: async (connectorName, path, options) => {
      calls.push({ connectorName, path, options: structuredClone(options) });

      // Model discovery endpoints
      if (path === "/v1/language-models" || path === "/v1/models") {
        if (discoveryThrow) throw new Error("discovery network error");
        return {
          ok: discoveryStatus >= 200 && discoveryStatus < 300,
          status: discoveryStatus,
          json: async () => ({ models: discoveryModels }),
        };
      }

      // Chat completions
      if (path === "/v1/chat/completions") {
        if (chatThrow) throw new Error("chat network error — must not be exposed");
        return {
          ok: chatStatus >= 200 && chatStatus < 300,
          status: chatStatus,
          json: async () => {
            if (chatStatus >= 400) return {};
            return {
              choices: [{
                message: {
                  content: typeof chatResponse === "string"
                    ? chatResponse
                    : JSON.stringify(chatResponse),
                },
              }],
            };
          },
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    },
  };
}

const VALID_VISUAL_RESPONSE = {
  title: "Into the Shadow",
  primaryText: "Not all those who wander are lost.",
  secondaryText: "From the depths of Mirkwood",
  layout: "Classic top / bottom",
  rationale: "Top layout suits a dramatic hero shot.",
};

const VALID_REDNOTE_RESPONSE = {
  title: "Legolas Greenleaf",
  caption: "Eyes sharp, aim true. The woodland prince never misses.",
  tags: ["#legolas", "#lotr", "#tolkien", "#elvish", "#middleearth"],
};

// Minimal valid visual body
const VISUAL_BODY = {
  mode: "visual",
  character: "Gandalf",
  tone: "Deadpan",
  layout: "Classic top / bottom",
};

// Minimal valid rednote body
const REDNOTE_BODY = {
  mode: "rednote",
  character: "Legolas",
  tone: "Dramatic",
  layout: "Classic top / bottom",
  visual: {
    title: "Into the Shadow",
    primaryText: "Not all those who wander are lost.",
    layout: "Classic top / bottom",
  },
};

function makeHandler({
  auth = makeAdminAuth(),
  store = memoryStore(),
  connector = makeConnector({ chatResponse: VALID_VISUAL_RESPONSE }),
  now = () => Date.now(),
  logger = { log() {} },
} = {}) {
  return createMiddleEarthAIHandler({
    auth,
    getStore: () => store,
    makeConnectorClient: () => connector,
    now,
    logger,
  });
}

function makeRequest(body, { method = "POST", origin = ORIGIN, headers = {} } = {}) {
  return new Request(`${ORIGIN}/.netlify/functions/middle-earth-ai`, {
    method,
    headers: { origin, "content-type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Method validation
// ---------------------------------------------------------------------------

test("rejects GET with 405", async () => {
  const handler = makeHandler();
  const req = new Request(`${ORIGIN}/.netlify/functions/middle-earth-ai`, { method: "GET" });
  const res = await handler(req, {});
  assert.equal(res.status, 405);
  assert.ok((await res.json()).error);
});

test("rejects PUT, DELETE, PATCH with 405", async () => {
  for (const method of ["PUT", "DELETE", "PATCH"]) {
    const handler = makeHandler();
    const req = new Request(`${ORIGIN}/.netlify/functions/middle-earth-ai`, { method });
    assert.equal((await handler(req, {})).status, 405, `expected 405 for ${method}`);
  }
});

// ---------------------------------------------------------------------------
// Same-origin enforcement
// ---------------------------------------------------------------------------

test("rejects cross-origin POST with 403", async () => {
  const handler = makeHandler();
  const req = new Request(`${ORIGIN}/.netlify/functions/middle-earth-ai`, {
    method: "POST",
    headers: { origin: "https://evil.example", "content-type": "application/json" },
    body: JSON.stringify(VISUAL_BODY),
  });
  const res = await handler(req, {});
  assert.equal(res.status, 403);
});

test("rejects missing origin header with 403", async () => {
  const handler = makeHandler();
  const req = new Request(`${ORIGIN}/.netlify/functions/middle-earth-ai`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(VISUAL_BODY),
  });
  assert.equal((await handler(req, {})).status, 403);
});

// ---------------------------------------------------------------------------
// Auth enforcement
// ---------------------------------------------------------------------------

test("returns 401 when not signed in", async () => {
  const handler = makeHandler({ auth: makeAuth(401, "Sign in is required.") });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  assert.equal(res.status, 401);
  assert.ok((await res.json()).error);
});

test("returns 403 when signed in but not admin", async () => {
  const handler = makeHandler({ auth: makeAuth(403, "Admin access is required.") });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  assert.equal(res.status, 403);
  assert.ok((await res.json()).error);
});

test("does not expose unexpected authentication failure details", async () => {
  const sensitiveMessage = "session store failed with credential=private-value";
  const handler = makeHandler({
    auth: {
      authenticateAdmin: async () => {
        throw new Error(sensitiveMessage);
      },
    },
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await handler(makeRequest(VISUAL_BODY), {});
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, "Authentication service is temporarily unavailable.");
    assert.ok(!JSON.stringify(body).includes(sensitiveMessage));
  } finally {
    console.error = originalError;
  }
});

// ---------------------------------------------------------------------------
// Request body validation
// ---------------------------------------------------------------------------

test("returns 415 for non-JSON content-type", async () => {
  const handler = makeHandler();
  const req = new Request(`${ORIGIN}/.netlify/functions/middle-earth-ai`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "text/plain" },
    body: "hello",
  });
  assert.equal((await handler(req, {})).status, 415);
});

test("returns 400 for malformed JSON body", async () => {
  const handler = makeHandler();
  const req = new Request(`${ORIGIN}/.netlify/functions/middle-earth-ai`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: "{ not json }",
  });
  assert.equal((await handler(req, {})).status, 400);
});

test("returns 413 when body exceeds 16KB", async () => {
  const handler = makeHandler();
  const bigString = "x".repeat(16 * 1024 + 1);
  const req = new Request(`${ORIGIN}/.netlify/functions/middle-earth-ai`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ ...VISUAL_BODY, guidance: bigString }),
  });
  assert.equal((await handler(req, {})).status, 413);
});

test("returns 400 for invalid mode", async () => {
  const handler = makeHandler();
  const res = await handler(makeRequest({ ...VISUAL_BODY, mode: "invalid" }), {});
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /mode/i);
});

test("returns 400 when the JSON body is not an object", async () => {
  const handler = makeHandler();
  assert.equal((await handler(makeRequest(null), {})).status, 400);
  assert.equal((await handler(makeRequest([]), {})).status, 400);
});

test("returns 400 when character is missing", async () => {
  const handler = makeHandler();
  const { character: _c, ...noChar } = VISUAL_BODY;
  const res = await handler(makeRequest(noChar), {});
  assert.equal(res.status, 400);
});

test("returns 400 when character is empty string", async () => {
  const handler = makeHandler();
  const res = await handler(makeRequest({ ...VISUAL_BODY, character: "   " }), {});
  assert.equal(res.status, 400);
});

test("returns 400 when character exceeds 80 chars", async () => {
  const handler = makeHandler();
  const res = await handler(makeRequest({ ...VISUAL_BODY, character: "a".repeat(81) }), {});
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /at most 80/);
});

test("returns 400 when tone is missing", async () => {
  const handler = makeHandler();
  const { tone: _t, ...noTone } = VISUAL_BODY;
  const res = await handler(makeRequest(noTone), {});
  assert.equal(res.status, 400);
});

test("returns 400 when layout is missing", async () => {
  const handler = makeHandler();
  const { layout: _l, ...noLayout } = VISUAL_BODY;
  const res = await handler(makeRequest(noLayout), {});
  assert.equal(res.status, 400);
});

test("rejects overlong optional prompt fields instead of truncating them", async () => {
  const handler = makeHandler();
  const guidance = await handler(makeRequest({ ...VISUAL_BODY, guidance: "x".repeat(501) }), {});
  assert.equal(guidance.status, 400);
  assert.match((await guidance.json()).error, /guidance must be at most 500/);

  const publisher = await handler(makeRequest({
    ...VISUAL_BODY,
    source: {
      title: "A source",
      sourceUrl: "https://publisher.example/item",
      publisher: "x".repeat(201),
    },
  }), {});
  assert.equal(publisher.status, 400);
  assert.match((await publisher.json()).error, /source\.publisher/);
});

test("rejects non-HTTPS source context URLs", async () => {
  const handler = makeHandler();
  const res = await handler(makeRequest({
    ...VISUAL_BODY,
    source: { title: "Unsafe source", sourceUrl: "http://publisher.example/item" },
  }), {});
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /HTTPS URL/);
});

test("rednote returns 400 when visual is missing", async () => {
  const handler = makeHandler({ connector: makeConnector({ chatResponse: VALID_REDNOTE_RESPONSE }) });
  const { visual: _v, ...noVisual } = REDNOTE_BODY;
  const res = await handler(makeRequest(noVisual), {});
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /visual/i);
});

test("rednote returns 400 when visual.title is missing", async () => {
  const handler = makeHandler({ connector: makeConnector({ chatResponse: VALID_REDNOTE_RESPONSE }) });
  const res = await handler(makeRequest({
    ...REDNOTE_BODY,
    visual: { primaryText: "some text", layout: "Classic top / bottom" },
  }), {});
  assert.equal(res.status, 400);
});

test("rednote returns 400 when visual.primaryText is missing", async () => {
  const handler = makeHandler({ connector: makeConnector({ chatResponse: VALID_REDNOTE_RESPONSE }) });
  const res = await handler(makeRequest({
    ...REDNOTE_BODY,
    visual: { title: "A title", layout: "Classic top / bottom" },
  }), {});
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// Connector-compatible paths and call shape
// ---------------------------------------------------------------------------

test("model discovery calls connector.proxy('xai', '/v1/language-models')", async () => {
  const connector = makeConnector({ chatResponse: VALID_VISUAL_RESPONSE });
  const handler = makeHandler({ connector });
  await handler(makeRequest(VISUAL_BODY), {});
  const discoveryCalls = connector.calls.filter(c =>
    c.connectorName === "xai" && (c.path === "/v1/language-models" || c.path === "/v1/models")
  );
  assert.ok(discoveryCalls.length > 0, "expected at least one discovery call to connector");
  assert.equal(discoveryCalls[0].connectorName, "xai");
});

test("chat completion calls connector.proxy('xai', '/v1/chat/completions') with POST", async () => {
  const connector = makeConnector({ chatResponse: VALID_VISUAL_RESPONSE });
  const handler = makeHandler({ connector });
  await handler(makeRequest(VISUAL_BODY), {});
  const chatCall = connector.calls.find(c =>
    c.connectorName === "xai" && c.path === "/v1/chat/completions"
  );
  assert.ok(chatCall, "expected a chat completion call to connector");
  assert.equal(chatCall.options.method, "POST");
});

test("chat completion request body includes the model discovered at runtime", async () => {
  const connector = makeConnector({
    discoveryModels: [{ id: "grok-3-vision" }],
    chatResponse: VALID_VISUAL_RESPONSE,
  });
  const handler = makeHandler({ connector });
  await handler(makeRequest(VISUAL_BODY), {});
  const chatCall = connector.calls.find(c => c.path === "/v1/chat/completions");
  const requestBody = JSON.parse(chatCall.options.body);
  assert.equal(requestBody.model, "grok-3-vision");
});

test("chat completion request uses json_schema response_format, not json_object", async () => {
  const connector = makeConnector({ chatResponse: VALID_VISUAL_RESPONSE });
  const handler = makeHandler({ connector });
  await handler(makeRequest(VISUAL_BODY), {});
  const chatCall = connector.calls.find(c => c.path === "/v1/chat/completions");
  const requestBody = JSON.parse(chatCall.options.body);
  assert.equal(requestBody.response_format?.type, "json_schema");
  assert.ok(requestBody.response_format?.json_schema, "json_schema field must be present");
  assert.ok(requestBody.response_format.json_schema.strict, "strict must be true");
});

test("visual mode chat request uses visual_object schema with required fields", async () => {
  const connector = makeConnector({ chatResponse: VALID_VISUAL_RESPONSE });
  const handler = makeHandler({ connector });
  await handler(makeRequest(VISUAL_BODY), {});
  const chatCall = connector.calls.find(c => c.path === "/v1/chat/completions");
  const schema = JSON.parse(chatCall.options.body).response_format.json_schema;
  assert.equal(schema.name, "visual_object");
  const required = schema.schema.required;
  assert.ok(required.includes("title"));
  assert.ok(required.includes("primaryText"));
  assert.ok(required.includes("layout"));
  assert.ok(required.includes("rationale"));
  assert.equal(schema.schema.additionalProperties, false);
});

test("rednote mode chat request uses rednote_copy schema with required fields", async () => {
  const connector = makeConnector({ chatResponse: VALID_REDNOTE_RESPONSE });
  const handler = makeHandler({ connector });
  await handler(makeRequest(REDNOTE_BODY), {});
  const chatCall = connector.calls.find(c => c.path === "/v1/chat/completions");
  const schema = JSON.parse(chatCall.options.body).response_format.json_schema;
  assert.equal(schema.name, "rednote_copy");
  assert.ok(schema.schema.required.includes("title"));
  assert.ok(schema.schema.required.includes("caption"));
  assert.ok(schema.schema.required.includes("tags"));
  assert.equal(schema.schema.additionalProperties, false);
});

test("no Authorization header is added to any connector call", async () => {
  const connector = makeConnector({ chatResponse: VALID_VISUAL_RESPONSE });
  const handler = makeHandler({ connector });
  await handler(makeRequest(VISUAL_BODY), {});
  for (const call of connector.calls) {
    const headers = call.options?.headers ?? {};
    const headerKeys = Object.keys(headers).map(k => k.toLowerCase());
    assert.ok(!headerKeys.includes("authorization"), `found Authorization in ${call.path}`);
    assert.ok(!headerKeys.includes("x-api-key"), `found x-api-key in ${call.path}`);
  }
});

// ---------------------------------------------------------------------------
// Client request shape — all bounded fields reach the prompt
// ---------------------------------------------------------------------------

test("visual prompt includes character, tone, layout, guidance", async () => {
  let capturedPrompt = null;
  const connector = {
    calls: [],
    proxy: async (name, path, opts) => {
      if (path === "/v1/language-models") {
        return { ok: true, status: 200, json: async () => ({ models: [{ id: "grok-2-test" }] }) };
      }
      if (path === "/v1/chat/completions") {
        capturedPrompt = JSON.parse(opts.body).messages[0].content;
        return { ok: true, status: 200, json: async () => ({
          choices: [{ message: { content: JSON.stringify(VALID_VISUAL_RESPONSE) } }],
        })};
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
  };
  const handler = makeHandler({ connector });
  await handler(makeRequest({
    ...VISUAL_BODY,
    character: "Éowyn of Rohan",
    tone: "Tender",
    layout: "Editorial caption",
    guidance: "The quiet strength before battle",
  }), {});
  assert.ok(capturedPrompt.includes("Éowyn of Rohan"), "prompt must include character");
  assert.ok(capturedPrompt.includes("Tender"), "prompt must include tone");
  assert.ok(capturedPrompt.includes("Editorial caption"), "prompt must include layout");
  assert.ok(capturedPrompt.includes("The quiet strength before battle"), "prompt must include guidance");
});

test("visual prompt includes source title, url, publisher, and query", async () => {
  let capturedPrompt = null;
  const connector = {
    calls: [],
    proxy: async (name, path, opts) => {
      if (path === "/v1/language-models") {
        return { ok: true, status: 200, json: async () => ({ models: [{ id: "grok-2-test" }] }) };
      }
      if (path === "/v1/chat/completions") {
        capturedPrompt = JSON.parse(opts.body).messages[0].content;
        return { ok: true, status: 200, json: async () => ({
          choices: [{ message: { content: JSON.stringify(VALID_VISUAL_RESPONSE) } }],
        })};
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
  };
  const handler = makeHandler({ connector });
  await handler(makeRequest({
    ...VISUAL_BODY,
    source: {
      title: "Tolkien Gateway: Gandalf",
      sourceUrl: "https://tolkiengateway.net/wiki/Gandalf",
      publisher: "Tolkien Gateway",
      query: "Gandalf the Grey",
    },
  }), {});
  assert.ok(capturedPrompt.includes("Tolkien Gateway: Gandalf"), "prompt must include source title");
  assert.ok(capturedPrompt.includes("https://tolkiengateway.net/wiki/Gandalf"), "prompt must include source URL");
  assert.ok(capturedPrompt.includes("Tolkien Gateway"), "prompt must include publisher");
  assert.ok(capturedPrompt.includes("Gandalf the Grey"), "prompt must include query");
});

test("visual prompt explicitly instructs to avoid fabricated facts and copyrighted quotations", async () => {
  let capturedPrompt = null;
  const connector = {
    calls: [],
    proxy: async (name, path, opts) => {
      if (path === "/v1/language-models") {
        return { ok: true, status: 200, json: async () => ({ models: [{ id: "grok-2-test" }] }) };
      }
      if (path === "/v1/chat/completions") {
        capturedPrompt = JSON.parse(opts.body).messages[0].content;
        return { ok: true, status: 200, json: async () => ({
          choices: [{ message: { content: JSON.stringify(VALID_VISUAL_RESPONSE) } }],
        })};
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
  };
  const handler = makeHandler({ connector });
  await handler(makeRequest(VISUAL_BODY), {});
  assert.ok(capturedPrompt.toLowerCase().includes("fabricat"), "prompt must mention fabricated facts");
  assert.ok(
    capturedPrompt.toLowerCase().includes("copyright") || capturedPrompt.toLowerCase().includes("quotat"),
    "prompt must mention copyrighted passages"
  );
});

// ---------------------------------------------------------------------------
// Refinement prompt — rednote with currentCopy
// ---------------------------------------------------------------------------

test("rednote prompt includes final visual copy (title, primaryText, layout)", async () => {
  let capturedPrompt = null;
  const connector = {
    calls: [],
    proxy: async (name, path, opts) => {
      if (path === "/v1/language-models") {
        return { ok: true, status: 200, json: async () => ({ models: [{ id: "grok-2-test" }] }) };
      }
      if (path === "/v1/chat/completions") {
        capturedPrompt = JSON.parse(opts.body).messages[0].content;
        return { ok: true, status: 200, json: async () => ({
          choices: [{ message: { content: JSON.stringify(VALID_REDNOTE_RESPONSE) } }],
        })};
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
  };
  const handler = makeHandler({ connector });
  await handler(makeRequest({
    ...REDNOTE_BODY,
    visual: {
      title: "The Shield-Maiden Stands",
      primaryText: "I am no man.",
      secondaryText: "Beneath the Pelennor sky",
      layout: "Tiny confession",
    },
  }), {});
  assert.ok(capturedPrompt.includes("The Shield-Maiden Stands"), "prompt must include visual title");
  assert.ok(capturedPrompt.includes("I am no man."), "prompt must include visual primaryText");
  assert.ok(capturedPrompt.includes("Beneath the Pelennor sky"), "prompt must include visual secondaryText");
  assert.ok(capturedPrompt.includes("Tiny confession"), "prompt must include visual layout");
});

test("rednote prompt includes currentCopy for refinement when provided", async () => {
  let capturedPrompt = null;
  const connector = {
    calls: [],
    proxy: async (name, path, opts) => {
      if (path === "/v1/language-models") {
        return { ok: true, status: 200, json: async () => ({ models: [{ id: "grok-2-test" }] }) };
      }
      if (path === "/v1/chat/completions") {
        capturedPrompt = JSON.parse(opts.body).messages[0].content;
        return { ok: true, status: 200, json: async () => ({
          choices: [{ message: { content: JSON.stringify(VALID_REDNOTE_RESPONSE) } }],
        })};
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
  };
  const handler = makeHandler({ connector });
  await handler(makeRequest({
    ...REDNOTE_BODY,
    currentCopy: {
      title: "Old draft title",
      caption: "Old draft caption text here",
      tags: ["#oldtag1", "#oldtag2", "#oldtag3"],
    },
  }), {});
  assert.ok(capturedPrompt.includes("Old draft title"), "prompt must include current title for refinement");
  assert.ok(capturedPrompt.includes("Old draft caption text here"), "prompt must include current caption");
  assert.ok(capturedPrompt.includes("#oldtag1"), "prompt must include current tags");
  // Must indicate refinement context
  assert.ok(
    capturedPrompt.toLowerCase().includes("refin") || capturedPrompt.toLowerCase().includes("existing"),
    "prompt must signal refinement intent"
  );
});

test("rednote prompt without currentCopy does not include refinement section", async () => {
  let capturedPrompt = null;
  const connector = {
    calls: [],
    proxy: async (name, path, opts) => {
      if (path === "/v1/language-models") {
        return { ok: true, status: 200, json: async () => ({ models: [{ id: "grok-2-test" }] }) };
      }
      if (path === "/v1/chat/completions") {
        capturedPrompt = JSON.parse(opts.body).messages[0].content;
        return { ok: true, status: 200, json: async () => ({
          choices: [{ message: { content: JSON.stringify(VALID_REDNOTE_RESPONSE) } }],
        })};
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
  };
  const handler = makeHandler({ connector });
  await handler(makeRequest(REDNOTE_BODY), {});
  assert.ok(!capturedPrompt.includes("Old draft"), "prompt must not invent refinement content");
});

// ---------------------------------------------------------------------------
// Runtime model discovery
// ---------------------------------------------------------------------------

test("prefers grok-2 variant when multiple models returned", async () => {
  const connector = makeConnector({
    discoveryModels: [{ id: "grok-beta" }, { id: "grok-2-1212" }, { id: "some-other-model" }],
    chatResponse: VALID_VISUAL_RESPONSE,
  });
  const handler = makeHandler({ connector });
  await handler(makeRequest(VISUAL_BODY), {});
  const chatCall = connector.calls.find(c => c.path === "/v1/chat/completions");
  const requestBody = JSON.parse(chatCall.options.body);
  assert.match(requestBody.model, /grok-2/i);
});

test("falls back to /v1/models when /v1/language-models returns non-ok", async () => {
  const calls = [];
  const connector = {
    calls,
    proxy: async (name, path, opts) => {
      calls.push({ connectorName: name, path, options: opts });
      if (path === "/v1/language-models") {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      if (path === "/v1/models") {
        return { ok: true, status: 200, json: async () => ({ data: [{ id: "grok-2-latest" }] }) };
      }
      if (path === "/v1/chat/completions") {
        return { ok: true, status: 200, json: async () => ({
          choices: [{ message: { content: JSON.stringify(VALID_VISUAL_RESPONSE) } }],
        })};
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
  };
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  assert.equal(res.status, 200);
  const chatCall = calls.find(c => c.path === "/v1/chat/completions");
  const requestBody = JSON.parse(chatCall.options.body);
  assert.equal(requestBody.model, "grok-2-latest");
});

test("returns 503 when both discovery endpoints fail to return any model — does NOT hardcode grok-2-latest", async () => {
  const connector = makeConnector({
    discoveryThrow: true,
  });
  // Also override /v1/models to also throw
  const originalProxy = connector.proxy.bind(connector);
  connector.proxy = async (name, path, opts) => {
    if (path === "/v1/models") throw new Error("also fails");
    return originalProxy(name, path, opts);
  };
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  assert.equal(res.status, 503, "must return 503 when no model can be discovered");
  const body = await res.json();
  assert.ok(body.error);
  // Must NOT have made a chat completion call
  assert.equal(connector.calls.filter(c => c.path === "/v1/chat/completions").length, 0);
});

test("returns 503 when discovery returns empty model list", async () => {
  const connector = makeConnector({ discoveryModels: [] });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  assert.equal(res.status, 503);
});

// ---------------------------------------------------------------------------
// Exact response shape
// ---------------------------------------------------------------------------

test("visual mode: response is { mode: 'visual', result: { title, primaryText, secondaryText, layout, rationale, model } }", async () => {
  const connector = makeConnector({ chatResponse: VALID_VISUAL_RESPONSE });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, "visual");
  assert.ok(typeof body.result === "object");
  const r = body.result;
  assert.ok(typeof r.title === "string" && r.title, "title must be non-empty string");
  assert.ok(typeof r.primaryText === "string" && r.primaryText, "primaryText must be non-empty string");
  assert.ok("secondaryText" in r, "secondaryText must be present");
  assert.ok("layout" in r, "layout must be present");
  assert.ok("rationale" in r, "rationale must be present");
  assert.ok("model" in r, "model must be present");
});

test("visual mode: layout is one of the exact allowed enum values", async () => {
  const ALLOWED = ["Classic top / bottom", "Editorial caption", "Tiny confession"];
  for (const layout of ALLOWED) {
    const connector = makeConnector({ chatResponse: { ...VALID_VISUAL_RESPONSE, layout } });
    const handler = makeHandler({ connector });
    const res = await handler(makeRequest(VISUAL_BODY), {});
    const body = await res.json();
    assert.ok(ALLOWED.includes(body.result.layout), `"${body.result.layout}" not in allowed set`);
  }
});

test("visual mode: unrecognized layout is normalized to Classic top / bottom", async () => {
  const connector = makeConnector({ chatResponse: { ...VALID_VISUAL_RESPONSE, layout: "Top" } });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  const body = await res.json();
  assert.equal(body.result.layout, "Classic top / bottom");
});

test("visual mode: returns 502 when AI returns empty title", async () => {
  const connector = makeConnector({ chatResponse: { ...VALID_VISUAL_RESPONSE, title: "" } });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  assert.equal(res.status, 502);
});

test("visual mode: returns 502 when AI returns empty primaryText", async () => {
  const connector = makeConnector({ chatResponse: { ...VALID_VISUAL_RESPONSE, primaryText: "  " } });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  assert.equal(res.status, 502);
});

test("visual mode: output strings are bounded to max lengths", async () => {
  const longResp = {
    title: "T".repeat(500),
    primaryText: "P".repeat(500),
    secondaryText: "S".repeat(500),
    layout: "Classic top / bottom",
    rationale: "R".repeat(500),
  };
  const connector = makeConnector({ chatResponse: longResp });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  const body = await res.json();
  assert.ok(body.result.title.length <= 120);
  assert.ok(body.result.primaryText.length <= 700);
  assert.ok(body.result.secondaryText.length <= 240);
  assert.ok(body.result.rationale.length <= 300);
});

test("rednote mode: response is { mode: 'rednote', result: { title, caption, tags, model } }", async () => {
  const connector = makeConnector({ chatResponse: VALID_REDNOTE_RESPONSE });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(REDNOTE_BODY), {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, "rednote");
  const r = body.result;
  assert.ok(typeof r.title === "string" && r.title, "title must be non-empty");
  assert.ok(typeof r.caption === "string" && r.caption, "caption must be non-empty");
  assert.ok(Array.isArray(r.tags), "tags must be array");
  assert.ok(r.tags.length >= 3 && r.tags.length <= 8, `tags count ${r.tags.length} out of range`);
  assert.ok("model" in r, "model must be present");
});

test("rednote tags conform to /^#[^\\s#,]{1,49}$/u", async () => {
  const connector = makeConnector({ chatResponse: VALID_REDNOTE_RESPONSE });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(REDNOTE_BODY), {});
  const body = await res.json();
  const TAG_RE = /^#[^\s#,]{1,49}$/u;
  for (const tag of body.result.tags) {
    assert.match(tag, TAG_RE, `tag "${tag}" does not match pattern`);
  }
});

test("rednote: tags without # prefix are normalized to include it", async () => {
  const noHashResp = {
    title: "Test Title",
    caption: "Test caption text here.",
    tags: ["lotr", "tolkien", "middleearth"],
  };
  const connector = makeConnector({ chatResponse: noHashResp });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(REDNOTE_BODY), {});
  const body = await res.json();
  for (const tag of body.result.tags) {
    assert.ok(tag.startsWith("#"), `tag "${tag}" must start with #`);
  }
});

test("rednote: tags are lowercased", async () => {
  const upperResp = {
    title: "Test Title",
    caption: "Test caption text here.",
    tags: ["#LOTR", "#Tolkien", "#MiddleEarth"],
  };
  const connector = makeConnector({ chatResponse: upperResp });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(REDNOTE_BODY), {});
  const body = await res.json();
  for (const tag of body.result.tags) {
    assert.equal(tag, tag.toLowerCase(), `tag "${tag}" must be lowercase`);
  }
});

test("rednote: returns 502 when AI returns fewer than 3 valid hashtags", async () => {
  const connector = makeConnector({
    chatResponse: { title: "Test", caption: "Test caption", tags: ["#one", "#two"] },
  });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(REDNOTE_BODY), {});
  assert.equal(res.status, 502);
});

test("rednote: returns 502 when AI returns empty title", async () => {
  const connector = makeConnector({
    chatResponse: { ...VALID_REDNOTE_RESPONSE, title: "" },
  });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(REDNOTE_BODY), {});
  assert.equal(res.status, 502);
});

test("rednote: returns 502 when AI returns empty caption", async () => {
  const connector = makeConnector({
    chatResponse: { ...VALID_REDNOTE_RESPONSE, caption: "" },
  });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(REDNOTE_BODY), {});
  assert.equal(res.status, 502);
});

test("rednote: tags are capped at 8", async () => {
  const connector = makeConnector({
    chatResponse: {
      title: "Test",
      caption: "Caption",
      tags: ["#a", "#b", "#c", "#d", "#e", "#f", "#g", "#h", "#i", "#j"],
    },
  });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(REDNOTE_BODY), {});
  const body = await res.json();
  assert.ok(body.result.tags.length <= 8);
});

// ---------------------------------------------------------------------------
// Rate limiting — per-account, 12/window, CAS-fail-closed
// ---------------------------------------------------------------------------

test("allows exactly 12 requests per window", async () => {
  const store = memoryStore();
  const now = () => 1700000000000;
  const connector = makeConnector({ chatResponse: VALID_VISUAL_RESPONSE });
  for (let i = 0; i < 12; i++) {
    const handler = makeHandler({ store, now, connector });
    const res = await handler(makeRequest(VISUAL_BODY), {});
    assert.equal(res.status, 200, `request ${i + 1} should succeed`);
  }
});

test("rejects 13th request with 429 and Retry-After header", async () => {
  const store = memoryStore();
  const now = () => 1700000000000;
  const connector = makeConnector({ chatResponse: VALID_VISUAL_RESPONSE });
  for (let i = 0; i < 12; i++) {
    const handler = makeHandler({ store, now, connector });
    await handler(makeRequest(VISUAL_BODY), {});
  }
  const handler = makeHandler({ store, now, connector });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  assert.equal(res.status, 429);
  assert.ok(res.headers.get("retry-after"), "429 must include Retry-After header");
  assert.ok((await res.json()).error);
});

test("rate limits are isolated per account", async () => {
  const store = memoryStore();
  const now = () => 1700000000000;
  const connector = makeConnector({ chatResponse: VALID_VISUAL_RESPONSE });
  for (let i = 0; i < 12; i++) {
    const handler = makeHandler({ store, now, connector, auth: makeAdminAuth("usr_a") });
    await handler(makeRequest(VISUAL_BODY), {});
  }
  // usr_a is exhausted
  const handlerA = makeHandler({ store, now, connector, auth: makeAdminAuth("usr_a") });
  assert.equal((await handlerA(makeRequest(VISUAL_BODY), {})).status, 429);
  // usr_b still has full quota
  const handlerB = makeHandler({ store, now, connector, auth: makeAdminAuth("usr_b") });
  assert.equal((await handlerB(makeRequest(VISUAL_BODY), {})).status, 200);
});

test("rate limit resets after window boundary", async () => {
  const store = memoryStore();
  const WINDOW_MS = 15 * 60 * 1000;
  const t0 = 1700000000000;
  const connector = makeConnector({ chatResponse: VALID_VISUAL_RESPONSE });
  for (let i = 0; i < 12; i++) {
    const h = makeHandler({ store, now: () => t0, connector });
    await h(makeRequest(VISUAL_BODY), {});
  }
  assert.equal((await makeHandler({ store, now: () => t0, connector })(makeRequest(VISUAL_BODY), {})).status, 429);
  // Advance past window
  const h2 = makeHandler({ store, now: () => t0 + WINDOW_MS, connector });
  assert.equal((await h2(makeRequest(VISUAL_BODY), {})).status, 200);
});

test("fail-closed: CAS conflict loop returns 503, not 200", async () => {
  const store = alwaysConflictStore();
  const connector = makeConnector({ chatResponse: VALID_VISUAL_RESPONSE });
  const handler = makeHandler({ store, connector });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  // Must NOT be 200 — quota must not be bypassed
  assert.equal(res.status, 503, "repeated CAS conflicts must fail closed with 503");
  const body = await res.json();
  assert.ok(body.error);
  // Must NOT have made a chat completion call
  assert.equal(connector.calls.filter(c => c.path === "/v1/chat/completions").length, 0);
});

// ---------------------------------------------------------------------------
// Upstream failure handling
// ---------------------------------------------------------------------------

test("returns 503 when connector throws on chat completion (network error)", async () => {
  const connector = makeConnector({ chatThrow: true });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  assert.equal(res.status, 503);
  const body = await res.json();
  // Must not expose the internal error message
  assert.ok(!body.error.includes("chat network error"), "must not expose internal error");
});

test("returns 503 when xAI returns 500", async () => {
  const connector = makeConnector({ chatStatus: 500 });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  assert.equal(res.status, 503);
});

test("logs successful discovery and completion without private request copy", async () => {
  const entries = [];
  const privateGuidance = "private operator copy must never enter logs";
  const handler = makeHandler({
    logger: {
      log(message, metadata) {
        entries.push([message, metadata]);
      },
    },
  });
  const res = await handler(makeRequest({
    ...VISUAL_BODY,
    guidance: privateGuidance,
  }), {});
  assert.equal(res.status, 200);
  assert.deepEqual(entries, [
    ["[middle-earth-ai] model discovered", { model: "grok-2-test" }],
    ["[middle-earth-ai] completion succeeded", {
      mode: "visual",
      model: "grok-2-test",
    }],
  ]);
  assert.ok(!JSON.stringify(entries).includes(privateGuidance));
});

test("returns 429 when xAI returns 429 (upstream rate limit)", async () => {
  const connector = makeConnector({ chatStatus: 429 });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  assert.equal(res.status, 429);
});

test("returns 502 when xAI returns malformed JSON in completion content", async () => {
  const connector = makeConnector({ chatResponse: "{ not valid json {{" });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  assert.equal(res.status, 502);
});

test("returns 502 when xAI returns null as completion object", async () => {
  const connector = makeConnector({ chatResponse: null });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  assert.equal(res.status, 502);
});

// ---------------------------------------------------------------------------
// Response headers
// ---------------------------------------------------------------------------

test("all responses include Cache-Control: no-store", async () => {
  const connector = makeConnector({ chatResponse: VALID_VISUAL_RESPONSE });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  assert.match(res.headers.get("cache-control"), /no-store/);
});

test("error responses also include Cache-Control: no-store", async () => {
  const handler = makeHandler({ auth: makeAuth(401, "Sign in required.") });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  assert.match(res.headers.get("cache-control"), /no-store/);
});

test("all responses have application/json Content-Type", async () => {
  const connector = makeConnector({ chatResponse: VALID_VISUAL_RESPONSE });
  const handler = makeHandler({ connector });
  const res = await handler(makeRequest(VISUAL_BODY), {});
  assert.match(res.headers.get("content-type"), /application\/json/);
});

// ---------------------------------------------------------------------------
// Real auth integration
// ---------------------------------------------------------------------------

test("real auth: non-admin gets 403, admin session succeeds", async () => {
  const { createPublicAuth } = await import("./public-auth.js");
  const stores = new Map();
  const getStore = name => {
    if (!stores.has(name)) stores.set(name, memoryStore());
    return stores.get(name);
  };

  async function mintSession(email, token) {
    const auth = createPublicAuth({
      env: {
        FANDOM_AUTH_ID_SECRET: "identity-secret-123",
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

  const connector = makeConnector({ chatResponse: VALID_VISUAL_RESPONSE });

  const nonAdmin = await mintSession("visitor@example.com", "magic-token-non-admin-at-least-thirty-two-chars");
  const nonAdminHandler = createMiddleEarthAIHandler({
    auth: nonAdmin.auth,
    getStore,
    makeConnectorClient: () => connector,
    now: () => Date.now(),
  });
  const denied = await nonAdminHandler(new Request(`${ORIGIN}/.netlify/functions/middle-earth-ai`, {
    method: "POST",
    headers: { origin: ORIGIN, cookie: nonAdmin.cookie, "content-type": "application/json" },
    body: JSON.stringify(VISUAL_BODY),
  }), {});
  assert.equal(denied.status, 403);

  const admin = await mintSession("admin@example.com", "magic-token-for-admin-at-least-thirty-two-chars");
  const adminHandler = createMiddleEarthAIHandler({
    auth: admin.auth,
    getStore,
    makeConnectorClient: () => connector,
    now: () => Date.now(),
  });
  const allowed = await adminHandler(new Request(`${ORIGIN}/.netlify/functions/middle-earth-ai`, {
    method: "POST",
    headers: { origin: ORIGIN, cookie: admin.cookie, "content-type": "application/json" },
    body: JSON.stringify(VISUAL_BODY),
  }), {});
  assert.equal(allowed.status, 200);
  const body = await allowed.json();
  assert.equal(body.mode, "visual");
  assert.ok(body.result.title);
});
