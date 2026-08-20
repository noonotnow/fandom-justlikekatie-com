import test from "node:test";
import assert from "node:assert/strict";
import { handler } from "../middle-earth-search.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides = {}) {
  return {
    httpMethod: "GET",
    queryStringParameters: {},
    ...overrides,
  };
}

function mockFetch(payload, { status = 200, contentType = "application/json" } = {}) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": contentType }),
    async text() { return typeof payload === "string" ? payload : JSON.stringify(payload); },
    async json() { return typeof payload === "string" ? JSON.parse(payload) : payload; },
  });
}

// A minimal Brave-style response that passes the subject guard for English queries.
function bravePayload(subject = "Gandalf", count = 8) {
  return {
    results: Array.from({ length: count }, (_, i) => ({
      title: `${subject} editorial ${i}`,
      description: subject,
      url: `https://source-${i}.example/article-${i}`,
      thumbnail: { src: `https://images.example/${i}.jpg` },
    })),
  };
}

function googlePayload(subject = "Gandalf", count = 8) {
  return {
    images_results: Array.from({ length: count }, (_, i) => ({
      title: `${subject} Google image ${i}`,
      thumbnail: `https://google-images.example/${i}.jpg`,
      original: `https://google-originals.example/${i}.jpg`,
      link: `https://google-source-${i}.example/article-${i}`,
      domain: `google-source-${i}.example`,
    })),
  };
}

async function withSearchKeys(run) {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  const previousSerpKey = process.env.SERPAPI_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "brave-test";
  process.env.SERPAPI_KEY = "serp-test";
  try {
    await run();
  } finally {
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
    process.env.SERPAPI_KEY = previousSerpKey;
  }
}

// ---------------------------------------------------------------------------
// Method validation
// ---------------------------------------------------------------------------

test("rejects non-GET methods with 405", async () => {
  for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
    const res = await handler(makeEvent({ httpMethod: method, queryStringParameters: { q: "Gandalf" } }));
    assert.equal(res.statusCode, 405, `expected 405 for ${method}`);
    const body = JSON.parse(res.body);
    assert.equal(body.results.length, 0);
    assert.ok(body.error);
  }
});

test("405 response includes no-store cache header", async () => {
  const res = await handler(makeEvent({ httpMethod: "POST", queryStringParameters: { q: "Frodo" } }));
  assert.equal(res.statusCode, 405);
  assert.match(res.headers["Cache-Control"], /no-store/);
});

// ---------------------------------------------------------------------------
// Query validation
// ---------------------------------------------------------------------------

test("returns 400 when q is absent", async () => {
  const res = await handler(makeEvent());
  assert.equal(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.ok(body.error);
  assert.equal(body.results.length, 0);
});

test("returns 400 when q is empty string", async () => {
  const res = await handler(makeEvent({ queryStringParameters: { q: "" } }));
  assert.equal(res.statusCode, 400);
});

test("returns 400 when q is whitespace-only", async () => {
  const res = await handler(makeEvent({ queryStringParameters: { q: "   " } }));
  assert.equal(res.statusCode, 400);
});

test("returns 400 when q exceeds max length", async () => {
  const res = await handler(makeEvent({ queryStringParameters: { q: "a".repeat(201) } }));
  assert.equal(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.match(body.error, /too long/i);
});

test("accepts q at exactly the max allowed length", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  // Query is 200 chars — at the limit.  It won't get a context suffix (>80 chars).
  const q = "Tolkien " + "a".repeat(192);
  globalThis.fetch = mockFetch(JSON.stringify(bravePayload("Tolkien")), { contentType: "application/json" });
  try {
    const res = await handler(makeEvent({ queryStringParameters: { q } }));
    // May be 200 or 503 depending on env — the important thing is NOT 400.
    assert.notEqual(res.statusCode, 400);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
  }
});

// ---------------------------------------------------------------------------
// Query trimming
// ---------------------------------------------------------------------------

test("trims leading and trailing whitespace from q", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch(JSON.stringify(bravePayload("Frodo")), { contentType: "application/json" });
  try {
    const res = await handler(makeEvent({ queryStringParameters: { q: "  Frodo Baggins  " } }));
    const body = JSON.parse(res.body);
    assert.equal(body.query, "Frodo Baggins");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
  }
});

// ---------------------------------------------------------------------------
// Context suffix injection
// ---------------------------------------------------------------------------

test("uses Google Images before Brave for an English Middle-earth search", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("serpapi.com")) {
      return mockFetch(googlePayload("Gandalf"))();
    }
    throw new Error(`Brave must not run when Google returns usable results: ${url}`);
  };
  try {
    await withSearchKeys(async () => {
      const response = await handler(makeEvent({ queryStringParameters: { q: "Gandalf" } }));
      const body = JSON.parse(response.body);
      assert.equal(response.statusCode, 200);
      assert.equal(body.provider, "google_images");
      assert.equal(calls.length, 1);
      assert.match(calls[0], /engine=google_images/);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps CJK Middle-earth searches Google-first instead of starting with Baidu", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("serpapi.com")) {
      return mockFetch(googlePayload("甘道夫"))();
    }
    throw new Error(`Baidu and Brave must not run when Google returns usable results: ${url}`);
  };
  try {
    await withSearchKeys(async () => {
      const response = await handler(makeEvent({ queryStringParameters: { q: "甘道夫 工作反应图" } }));
      const body = JSON.parse(response.body);
      assert.equal(response.statusCode, 200);
      assert.equal(body.provider, "google_images");
      assert.equal(calls.length, 1);
      assert.match(calls[0], /engine=google_images/);
      assert.ok(!calls.some((url) => url.includes("image.baidu.com")));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses Brave only after Middle-earth Google-compatible engines are unusable", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("serpapi.com")) {
      return mockFetch({}, { status: 503 })();
    }
    if (String(url).includes("api.search.brave.com")) {
      return mockFetch(bravePayload("Frodo"))();
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    await withSearchKeys(async () => {
      const response = await handler(makeEvent({ queryStringParameters: { q: "Frodo" } }));
      const body = JSON.parse(response.body);
      assert.equal(response.statusCode, 200);
      assert.equal(body.provider, "brave");
      assert.match(calls[0], /engine=google_images/);
      assert.match(calls[1], /engine=bing_images/);
      assert.match(calls[2], /engine=yandex_images/);
      assert.match(calls[3], /api\.search\.brave\.com/);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("appends Middle-earth context suffix for generic short queries", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "test-key";
  const capturedUrls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, ...rest) => {
    capturedUrls.push(url);
    return mockFetch(JSON.stringify(bravePayload("ancient castle landscape")))(url, ...rest);
  };
  try {
    // Query with NO Middle-earth keywords — suffix should be appended
    await handler(makeEvent({ queryStringParameters: { q: "ancient castle landscape art" } }));
    // The URL sent to Brave should contain the context suffix
    const braveCall = capturedUrls.find((u) => u.includes("search.brave.com"));
    assert.ok(braveCall, "expected a Brave API call");
    assert.match(decodeURIComponent(braveCall), /Middle-earth|Tolkien/i);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
  }
});

test("does NOT append context suffix when query already contains a Middle-earth keyword", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "test-key";
  const capturedUrls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, ...rest) => {
    capturedUrls.push(url);
    return mockFetch(JSON.stringify(bravePayload("Gandalf")))(url, ...rest);
  };
  try {
    await handler(makeEvent({ queryStringParameters: { q: "Gandalf the Grey tolkien" } }));
    const braveCall = capturedUrls.find((u) => u.includes("search.brave.com"));
    assert.ok(braveCall);
    // The raw query already had "tolkien" so no duplicate suffix should be added
    const decoded = decodeURIComponent(braveCall);
    // Should contain tolkien exactly once (case-insensitive check via counting)
    const count = (decoded.toLowerCase().match(/tolkien/g) || []).length;
    assert.equal(count, 1, "tolkien should appear exactly once when already present");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
  }
});

test("does NOT append context suffix when query is longer than 80 chars", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "test-key";
  const capturedUrls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, ...rest) => {
    capturedUrls.push(url);
    return mockFetch(JSON.stringify(bravePayload("Shire")))(url, ...rest);
  };
  // 81-char query without any Middle-earth keyword (note: "shire" IS a keyword so we avoid it)
  const longQ = "ancient castle concept art landscape " + "x".repeat(50);
  try {
    await handler(makeEvent({ queryStringParameters: { q: longQ } }));
    const braveCall = capturedUrls.find((u) => u.includes("search.brave.com"));
    if (braveCall) {
      const decoded = decodeURIComponent(braveCall);
      // Suffix should NOT have been added
      assert.ok(
        !decoded.includes("Middle-earth Tolkien"),
        "suffix should not be appended for long queries",
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
  }
});

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

test("returns normalized {query, provider, results} on success", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch(JSON.stringify(bravePayload("Aragorn")), { contentType: "application/json" });
  try {
    const res = await handler(makeEvent({ queryStringParameters: { q: "Aragorn" } }));
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.query, "Aragorn");
    assert.equal(typeof body.provider, "string");
    assert.ok(Array.isArray(body.results));
  } finally {
    globalThis.fetch = originalFetch;
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
  }
});

test("each result has exactly the documented fields", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch(JSON.stringify(bravePayload("Legolas")), { contentType: "application/json" });
  try {
    const res = await handler(makeEvent({ queryStringParameters: { q: "Legolas" } }));
    const body = JSON.parse(res.body);
    if (body.results.length > 0) {
      for (const item of body.results) {
        assert.ok("title" in item, "missing title");
        assert.ok("thumbnail" in item, "missing thumbnail");
        assert.ok("link" in item, "missing link");
        assert.ok("source" in item, "missing source");
        assert.ok("provider" in item, "missing provider");
        assert.match(
          item.thumbnail,
          /^\/\.netlify\/functions\/image-proxy\?url=/,
          "thumbnail should use the same-origin image proxy",
        );
        // Should NOT expose internal fields
        assert.ok(!("isLogo" in item), "should not expose isLogo");
        assert.ok(!("thumbnailOriginal" in item), "should not expose thumbnailOriginal");
        assert.ok(!("description" in item), "should not expose description");
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
  }
});

test("drops candidates without public HTTPS image and publisher URLs", async () => {
  const originalFetch = globalThis.fetch;
  const payload = googlePayload("Frodo", 6);
  payload.images_results[0].thumbnail = "http://images.example/insecure.jpg";
  payload.images_results[1].thumbnail = "data:image/png;base64,not-an-image";
  payload.images_results[2].link = "http://publisher.example/insecure";
  payload.images_results[3].link = "https://user:password@publisher.example/private";
  globalThis.fetch = async (url) => {
    if (String(url).includes("serpapi.com")) return mockFetch(payload)();
    throw new Error(`Brave must not run when Google returns usable results: ${url}`);
  };
  try {
    await withSearchKeys(async () => {
      const response = await handler(makeEvent({ queryStringParameters: { q: "Frodo" } }));
      const body = JSON.parse(response.body);
      assert.equal(response.statusCode, 200);
      assert.equal(body.results.length, 2);
      for (const result of body.results) {
        assert.match(result.thumbnail, /^\/\.netlify\/functions\/image-proxy\?url=https%3A%2F%2F/);
        assert.match(result.link, /^https:\/\//);
        assert.doesNotMatch(result.link, /@/);
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("derives candidate attribution from the validated publisher URL", async () => {
  const originalFetch = globalThis.fetch;
  const payload = googlePayload("Sam", 3);
  payload.images_results.forEach((result) => { result.domain = ""; });
  payload.images_results[0].link = "https://www.publisher.example/reaction-still";
  globalThis.fetch = async (url) => {
    if (String(url).includes("serpapi.com")) return mockFetch(payload)();
    throw new Error(`Brave must not run when Google returns usable results: ${url}`);
  };
  try {
    await withSearchKeys(async () => {
      const response = await handler(makeEvent({ queryStringParameters: { q: "Sam" } }));
      const body = JSON.parse(response.body);
      assert.equal(response.statusCode, 200);
      assert.equal(body.results[0].source, "publisher.example");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns at most 18 results", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  // Provide 30 results to confirm cap of 18 is applied
  globalThis.fetch = mockFetch(JSON.stringify(bravePayload("Sauron", 30)), { contentType: "application/json" });
  try {
    const res = await handler(makeEvent({ queryStringParameters: { q: "Sauron" } }));
    const body = JSON.parse(res.body);
    assert.ok(body.results.length <= 18, `expected ≤18 results, got ${body.results.length}`);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
  }
});

test("results are de-duplicated by link", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  // Produce results with duplicate links
  const dupPayload = {
    results: Array.from({ length: 6 }, (_, i) => ({
      title: `Gimli result ${i % 3}`,
      description: "Gimli",
      url: `https://source-${i % 3}.example/article`,
      thumbnail: { src: `https://images.example/${i}.jpg` },
    })),
  };
  globalThis.fetch = mockFetch(JSON.stringify(dupPayload), { contentType: "application/json" });
  try {
    const res = await handler(makeEvent({ queryStringParameters: { q: "Gimli Tolkien" } }));
    const body = JSON.parse(res.body);
    const links = body.results.map((r) => r.link);
    const uniqueLinks = new Set(links);
    assert.equal(links.length, uniqueLinks.size, "duplicate links should be removed");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
  }
});

test("returns original query string in response, not the enriched one", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch(JSON.stringify(bravePayload("Eowyn")), { contentType: "application/json" });
  try {
    const res = await handler(makeEvent({ queryStringParameters: { q: "Eowyn shield maiden" } }));
    const body = JSON.parse(res.body);
    // The query field in the response should match the original input exactly (trimmed),
    // not include the internally appended "Middle-earth Tolkien" suffix.
    assert.equal(body.query, "Eowyn shield maiden");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
  }
});

// ---------------------------------------------------------------------------
// Cache-Control header
// ---------------------------------------------------------------------------

test("200 response includes public Cache-Control header", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch(JSON.stringify(bravePayload("Gandalf")), { contentType: "application/json" });
  try {
    const res = await handler(makeEvent({ queryStringParameters: { q: "Gandalf" } }));
    assert.equal(res.statusCode, 200);
    assert.ok(res.headers["Cache-Control"], "Cache-Control header must be present");
    assert.match(res.headers["Cache-Control"], /public/);
    assert.match(res.headers["Cache-Control"], /max-age/);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
  }
});

test("400 error response has no-store Cache-Control", async () => {
  const res = await handler(makeEvent({ queryStringParameters: { q: "" } }));
  assert.equal(res.statusCode, 400);
  assert.match(res.headers["Cache-Control"], /no-store/);
});

// ---------------------------------------------------------------------------
// Error safety
// ---------------------------------------------------------------------------

test("returns 500 without exposing internal error message on fetch failure", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Network timeout — internal detail"); };
  try {
    const res = await handler(makeEvent({ queryStringParameters: { q: "Mordor" } }));
    assert.ok(res.statusCode >= 500, `expected 5xx, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert.ok(body.error, "error field must be present");
    // Must not expose raw internal error detail
    assert.ok(
      !body.error.includes("Network timeout"),
      "should not expose internal error message",
    );
    assert.equal(body.results.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
  }
});

test("returns 503 without exposing key details when API key missing", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  const previousSerpKey = process.env.SERPAPI_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY;
  delete process.env.SERPAPI_KEY;
  try {
    const res = await handler(makeEvent({ queryStringParameters: { q: "Hobbiton" } }));
    // Without keys, expect either 503 (config error) or a 200 with no results
    // (if Baidu path runs but fails) — the key thing is no secret is exposed.
    const body = JSON.parse(res.body);
    if (res.statusCode !== 200) {
      assert.ok(res.statusCode === 503 || res.statusCode === 500);
      assert.ok(body.error);
      assert.ok(
        !body.error.toLowerCase().includes("api_key"),
        "error must not include API key details",
      );
    }
    assert.equal(body.query, "Hobbiton");
    assert.ok(Array.isArray(body.results));
  } finally {
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
    process.env.SERPAPI_KEY = previousSerpKey;
  }
});

test("error response always includes query, provider=null, and empty results array", async () => {
  const res = await handler(makeEvent({ queryStringParameters: { q: "" } }));
  const body = JSON.parse(res.body);
  assert.ok(Array.isArray(body.results));
  assert.equal(body.results.length, 0);
  assert.equal(body.provider, null);
  assert.ok("query" in body);
});

// ---------------------------------------------------------------------------
// Multiword / English query support
// ---------------------------------------------------------------------------

test("handles multiword English queries without error", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch(
    JSON.stringify(bravePayload("Minas Tirith", 8)),
    { contentType: "application/json" },
  );
  try {
    const res = await handler(makeEvent({
      queryStringParameters: { q: "Minas Tirith city of gondor" },
    }));
    assert.ok(res.statusCode === 200 || res.statusCode === 503);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.results));
  } finally {
    globalThis.fetch = originalFetch;
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
  }
});
