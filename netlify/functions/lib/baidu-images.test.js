import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  clearBaiduImageCache,
  normalizeBaiduImage,
  parseBaiduImages,
  searchBaiduImages,
} from "./baidu-images.js";
import { searchBaiduProvider, searchOneQuery } from "../preview-search.js";
import { handler as baiduImageHandler } from "../baidu-image-search.js";

const imgDataFixture = await readFile(
  new URL("./fixtures/baidu-imgdata.html", import.meta.url),
  "utf8",
);
const initialStateFixture = await readFile(
  new URL("./fixtures/baidu-initial-state.html", import.meta.url),
  "utf8",
);

function mockResponse(body, { status = 200, contentType = "text/html; charset=utf-8" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": contentType }),
    async text() {
      return body;
    },
    async json() {
      return JSON.parse(body);
    },
  };
}

function bravePayload(count = 8) {
  return {
    results: Array.from({ length: count }, (_, index) => ({
      title: `刘学义 Brave result ${index}`,
      description: "刘学义",
      url: `https://brave-source-${index}.example/article`,
      thumbnail: { src: `https://brave-images.example/${index}.jpg` },
    })),
  };
}

function baiduPayload(count = 8, sourceCount = 5, subject = "刘学义") {
  return JSON.stringify({
    data: Array.from({ length: count }, (_, index) => ({
      thumbURL: `https://baidu-images.example/${index}.jpg`,
      objURL: `https://baidu-originals.example/${index}.jpg`,
      fromURL: `https://baidu-source-${index % sourceCount}.example/article/${index}`,
      fromURLHost: `baidu-source-${index % sourceCount}.example`,
      fromPageTitle: `${subject} Baidu result ${index}`,
    })),
  });
}

function serpPayload() {
  return {
    images_results: [
      {
        title: "刘学义 Google portrait one",
        thumbnail: "https://google-images.example/1.jpg",
        original: "https://google-images.example/original-1.jpg",
        link: "https://google-source-1.example/article",
        domain: "google-source-1.example",
      },
      {
        title: "刘学义 Google portrait two",
        thumbnail: "https://google-images.example/2.jpg",
        original: "https://google-images.example/original-2.jpg",
        link: "https://google-source-2.example/article",
        domain: "google-source-2.example",
      },
    ],
  };
}

test("parses imgData assignments and normalizes Baidu fields", () => {
  const parsed = parseBaiduImages(imgDataFixture, "刘学义");

  assert.equal(parsed.results.length, 5);
  assert.deepEqual(parsed.results[0], {
    title: "刘学义 念无双 垣仲",
    thumbnail: "https://thumbs.example/liu-1.jpg",
    thumbnailOriginal: "https://images.example/liu-1.jpg",
    link: "https://weibo.com/liu/1",
    source: "weibo.com",
    width: 800,
    height: 1200,
  });
  assert.equal(parsed.results[1].link, "https://sohu.com/a/liu-2");
});

test("parses nested initial-state payloads without relying on one selector", () => {
  const parsed = parseBaiduImages(initialStateFixture, "刘学义");

  assert.equal(parsed.results.length, 1);
  assert.equal(parsed.results[0].source, "douban.com");
  assert.equal(parsed.results[0].width, 900);
  assert.equal(parsed.results[0].height, 1350);
});

test("canonicalizes source provenance instead of trusting display labels", () => {
  const result = normalizeBaiduImage({
    thumbURL: "https://thumbs.example/product.jpg",
    fromURL: "https://www.taobao.com/listing/123",
    fromURLHost: "www.taobao.com",
    source: "淘宝",
  });

  assert.equal(result.source, "taobao.com");
});

test("retries transient Baidu responses with browser headers", async () => {
  clearBaiduImageCache();
  const calls = [];
  const delays = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? mockResponse("busy", { status: 503 })
      : mockResponse(initialStateFixture);
  };

  const response = await searchBaiduImages("刘学义 念无双", {
    fetchImpl,
    cache: false,
    delay: async (milliseconds) => delays.push(milliseconds),
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(delays, [250]);
  assert.match(calls[0].url, /word=%E5%88%98%E5%AD%A6%E4%B9%89\+%E5%BF%B5%E6%97%A0%E5%8F%8C/);
  assert.match(calls[0].options.headers["User-Agent"], /Mozilla/);
  assert.equal(response.telemetry.attempts, 2);
});

test("aborts Baidu requests at the configured timeout", async () => {
  await assert.rejects(
    searchBaiduImages("timeout test", {
      cache: false,
      retries: 0,
      timeoutMs: 5,
      fetchImpl: async (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    }),
    (error) => error.code === "timeout",
  );
});

test("keeps the timeout active while reading the Baidu response body", async () => {
  await assert.rejects(
    searchBaiduImages("stalled body test", {
      cache: false,
      retries: 0,
      timeoutMs: 5,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        body: new ReadableStream({ start() {} }),
      }),
    }),
    (error) => error.code === "timeout",
  );
});

test("rejects unexpected Baidu response content types", async () => {
  let cancelled = false;
  await assert.rejects(
    searchBaiduImages("content type test", {
      cache: false,
      retries: 0,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "image/png" }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
          },
          cancel() {
            cancelled = true;
          },
        }),
      }),
    }),
    (error) => error.code === "invalid_content_type",
  );
  assert.equal(cancelled, true);
});

test("stops streaming a Baidu response once it exceeds the size limit", async () => {
  let chunkCount = 0;
  const body = new ReadableStream({
    pull(controller) {
      chunkCount += 1;
      controller.enqueue(new Uint8Array(1024 * 1024));
      if (chunkCount === 6) controller.close();
    },
  });

  await assert.rejects(
    searchBaiduImages("oversized body test", {
      cache: false,
      retries: 0,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        body,
      }),
    }),
    (error) => error.code === "response_too_large",
  );
});

test("reuses existing actor, promo, commerce, and duplicate filters", async () => {
  const baidu = await searchBaiduProvider("刘学义 念无双 垣仲 白衣", {
    fetchImpl: async () => mockResponse(imgDataFixture),
    baiduOptions: { cache: false, retries: 0 },
  });

  assert.equal(baidu.subjectGuardPassed, true);
  assert.equal(baidu.qualified, false);
  assert.match(baidu.fallbackReason, /useful_count_below_threshold/);
  assert.deepEqual(
    baidu.results.map((result) => result.title),
    ["刘学义 念无双 垣仲", "刘学义 白衣造型"],
  );
});

test("rejects high-volume Baidu batches that fail the subject identity ratio", async () => {
  const data = {
    data: Array.from({ length: 8 }, (_, index) => ({
      thumbURL: `https://thumbs.example/identity-${index}.jpg`,
      fromURL: `https://source-${index}.example/article`,
      fromPageTitle: index === 0 ? "刘学义 portrait" : `古装美男 ${index}`,
    })),
  };
  const baidu = await searchBaiduProvider("刘学义 古装 白衣", {
    fetchImpl: async () => mockResponse(JSON.stringify(data), { contentType: "application/json" }),
    baiduOptions: { cache: false, retries: 0 },
  });

  assert.equal(baidu.rawCount, 8);
  assert.equal(baidu.subjectHitCount, 1);
  assert.equal(baidu.subjectGuardPassed, false);
  assert.deepEqual(baidu.results, []);
});

test("does not treat a query fallback as provider-supplied identity evidence", async () => {
  const data = {
    data: Array.from({ length: 8 }, (_, index) => ({
      thumbURL: `https://thumbs.example/titleless-${index}.jpg`,
      fromURL: `https://titleless-${index}.example/article`,
    })),
  };
  const baidu = await searchBaiduProvider("刘学义 白衣", {
    fetchImpl: async () => mockResponse(JSON.stringify(data), { contentType: "application/json" }),
    baiduOptions: { cache: false, retries: 0 },
  });

  assert.equal(baidu.subjectHitCount, 0);
  assert.equal(baidu.subjectGuardPassed, false);
  assert.deepEqual(baidu.results, []);
});

test("exposes the direct Baidu Netlify endpoint", async () => {
  clearBaiduImageCache();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    mockResponse(baiduPayload(), { contentType: "application/json" });
  try {
    const response = await baiduImageHandler({
      queryStringParameters: { q: "刘学义 直接端点", debug: "1" },
    });
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(body.provider, "baidu");
    assert.equal(body.results.length, 8);
    assert.equal(body.baiduAttemptLog.subjectGuardPassed, true);
    assert.equal(body.baiduAttemptLog.qualified, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns a qualifying Baidu batch without invoking Brave or SerpAPI", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  const previousSerpKey = process.env.SERPAPI_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY;
  delete process.env.SERPAPI_KEY;
  const calls = [];
  try {
    const response = await searchOneQuery("刘学义 念无双 垣仲 白衣", {
      debug: true,
      baiduOptions: { cache: false, retries: 0 },
      fetchImpl: async (url) => {
        calls.push(url);
        if (url.includes("image.baidu.com")) {
          return mockResponse(baiduPayload(), { contentType: "application/json" });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    });

    assert.equal(response.provider, "baidu");
    assert.equal(response.baiduAttemptLog.usedAsFinal, true);
    assert.equal(response.baiduAttemptLog.qualified, true);
    assert.equal(response.baiduFallbackUsed, false);
    assert.equal(response.fallbackReason, null);
    assert.deepEqual(response.providerFetchOrder, ["baidu"]);
    assert.equal(response.serpApiAttempted, false);
    assert.equal(calls.length, 1);
    assert.ok(response.results.every((result) => result.provider === "baidu"));
  } finally {
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
    process.env.SERPAPI_KEY = previousSerpKey;
  }
});

test("preserves Brave-first behavior for non-CJK queries", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  const previousSerpKey = process.env.SERPAPI_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "brave-test";
  delete process.env.SERPAPI_KEY;
  const calls = [];
  try {
    const response = await searchOneQuery("Brad Pitt editorial portrait", {
      debug: true,
      baiduOptions: { cache: false, retries: 0 },
      fetchImpl: async (url) => {
        calls.push(url);
        if (url.includes("api.search.brave.com")) {
          return mockResponse(
            JSON.stringify({
              results: Array.from({ length: 8 }, (_, index) => ({
                title: `Brad Pitt editorial ${index}`,
                description: "Brad Pitt",
                url: `https://english-source-${index}.example/article`,
                thumbnail: { src: `https://english-images.example/${index}.jpg` },
              })),
            }),
            { contentType: "application/json" },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    });

    assert.equal(response.provider, "brave");
    assert.equal(response.baiduAttemptLog.attempted, false);
    assert.equal(response.baiduAttemptLog.skippedReason, "non_cjk_query");
    assert.equal(response.baiduFallbackUsed, false);
    assert.equal(response.fallbackReason, null);
    assert.deepEqual(response.providerFetchOrder, ["brave_baseline"]);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /api\.search\.brave\.com/);
  } finally {
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
    process.env.SERPAPI_KEY = previousSerpKey;
  }
});

test("routes Han, kana, and Hangul queries through Baidu first", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  const previousSerpKey = process.env.SERPAPI_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY;
  delete process.env.SERPAPI_KEY;
  try {
    for (const query of ["山崎賢人 俳優", "김수현 배우", "𠮷沢亮 俳優"]) {
      const subject = query.split(/\s+/)[0];
      const calls = [];
      const response = await searchOneQuery(query, {
        debug: true,
        baiduOptions: { cache: false, retries: 0 },
        fetchImpl: async (url) => {
          calls.push(url);
          if (url.includes("image.baidu.com")) {
            return mockResponse(baiduPayload(8, 5, subject), {
              contentType: "application/json",
            });
          }
          throw new Error(`Unexpected request: ${url}`);
        },
      });

      assert.equal(response.provider, "baidu");
      assert.deepEqual(response.providerFetchOrder, ["baidu"]);
      assert.equal(calls.length, 1);
    }
  } finally {
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
    process.env.SERPAPI_KEY = previousSerpKey;
  }
});

test("continues to Google when Baidu is unavailable", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  const previousSerpKey = process.env.SERPAPI_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "brave-test";
  process.env.SERPAPI_KEY = "serp-test";
  const warnings = [];
  const calls = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    const response = await searchOneQuery("刘学义 念无双 垣仲 白衣", {
      debug: true,
      baiduOptions: { cache: false, retries: 0 },
      fetchImpl: async (url) => {
        calls.push(url);
        if (url.includes("api.search.brave.com")) {
          return mockResponse(JSON.stringify(bravePayload()), { contentType: "application/json" });
        }
        if (url.includes("image.baidu.com")) return mockResponse("busy", { status: 503 });
        if (url.includes("serpapi.com")) {
          return mockResponse(JSON.stringify(serpPayload()), { contentType: "application/json" });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    });

    assert.equal(response.provider, "google_images");
    assert.equal(response.baiduAttemptLog.errorCode, "http_error");
    assert.equal(response.baiduFallbackUsed, true);
    assert.equal(response.fallbackReason, "provider_exception");
    assert.deepEqual(response.providerFetchOrder, [
      "baidu",
      "brave_baseline",
      "google_images",
    ]);
    assert.equal(response.serpApiEngineLog[0].engine, "google_images");
    assert.equal(response.serpApiEngineLog[0].usedAsFinal, true);
    assert.match(calls[0], /image\.baidu\.com/);
    assert.match(calls[1], /api\.search\.brave\.com/);
    assert.match(calls[2], /serpapi\.com/);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalWarn;
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
    process.env.SERPAPI_KEY = previousSerpKey;
  }
});

test("continues to SerpAPI when Baidu is unavailable and Brave is not configured", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  const previousSerpKey = process.env.SERPAPI_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY;
  process.env.SERPAPI_KEY = "serp-test";
  const warnings = [];
  const calls = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    const response = await searchOneQuery("刘学义 古装 写真", {
      debug: true,
      baiduOptions: { cache: false, retries: 0 },
      fetchImpl: async (url) => {
        calls.push(url);
        if (url.includes("image.baidu.com")) return mockResponse("busy", { status: 503 });
        if (url.includes("serpapi.com")) {
          return mockResponse(JSON.stringify(serpPayload()), { contentType: "application/json" });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    });

    assert.equal(response.provider, "google_images");
    assert.equal(response.braveConfigured, false);
    assert.equal(response.braveTriggerReason, "brave_not_configured");
    assert.deepEqual(response.providerFetchOrder, ["baidu", "google_images"]);
    assert.equal(calls.some(url => url.includes("api.search.brave.com")), false);
    assert.equal(response.serpApiEngineLog[0].usedAsFinal, true);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalWarn;
    if (previousBraveKey === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
    else process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
    if (previousSerpKey === undefined) delete process.env.SERPAPI_KEY;
    else process.env.SERPAPI_KEY = previousSerpKey;
  }
});

test("falls back when Baidu is valid but below the viability threshold", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  const previousSerpKey = process.env.SERPAPI_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "brave-test";
  process.env.SERPAPI_KEY = "serp-test";
  const calls = [];
  try {
    const response = await searchOneQuery("刘学义 念无双 垣仲 白衣", {
      debug: true,
      baiduOptions: { cache: false, retries: 0 },
      fetchImpl: async (url) => {
        calls.push(url);
        if (url.includes("image.baidu.com")) {
          return mockResponse(baiduPayload(6, 5), { contentType: "application/json" });
        }
        if (url.includes("api.search.brave.com")) {
          return mockResponse(JSON.stringify(bravePayload()), { contentType: "application/json" });
        }
        if (url.includes("serpapi.com")) {
          return mockResponse(JSON.stringify(serpPayload()), { contentType: "application/json" });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    });

    assert.equal(response.provider, "google_images");
    assert.equal(response.baiduAttemptLog.subjectGuardPassed, true);
    assert.equal(response.baiduAttemptLog.viabilityPassed, false);
    assert.equal(response.baiduAttemptLog.qualified, false);
    assert.match(response.fallbackReason, /useful_count_below_threshold/);
    assert.equal(calls.length, 3);
  } finally {
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
    process.env.SERPAPI_KEY = previousSerpKey;
  }
});

test("falls back when Baidu clears count but misses the quality threshold", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  const previousSerpKey = process.env.SERPAPI_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "brave-test";
  process.env.SERPAPI_KEY = "serp-test";
  try {
    const response = await searchOneQuery("刘学义 念无双 垣仲 白衣", {
      debug: true,
      baiduOptions: { cache: false, retries: 0 },
      fetchImpl: async (url) => {
        if (url.includes("image.baidu.com")) {
          return mockResponse(baiduPayload(8, 1), { contentType: "application/json" });
        }
        if (url.includes("api.search.brave.com")) {
          return mockResponse(JSON.stringify(bravePayload()), { contentType: "application/json" });
        }
        if (url.includes("serpapi.com")) {
          return mockResponse(JSON.stringify(serpPayload()), { contentType: "application/json" });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    });

    assert.equal(response.provider, "google_images");
    assert.equal(response.baiduAttemptLog.viabilityPassed, true);
    assert.equal(response.baiduAttemptLog.qualityPassed, false);
    assert.equal(response.baiduAttemptLog.qualified, false);
    assert.match(response.fallbackReason, /quality_below_threshold/);
  } finally {
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
    process.env.SERPAPI_KEY = previousSerpKey;
  }
});

test("continues from a thrown Google request to Bing with accurate telemetry", async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  const previousSerpKey = process.env.SERPAPI_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "brave-test";
  process.env.SERPAPI_KEY = "serp-test";
  try {
    const response = await searchOneQuery("刘学义 念无双 垣仲 白衣", {
      debug: true,
      baiduOptions: { cache: false, retries: 0 },
      fetchImpl: async (url) => {
        if (url.includes("image.baidu.com")) {
          return mockResponse(baiduPayload(6, 5), { contentType: "application/json" });
        }
        if (url.includes("api.search.brave.com")) {
          return mockResponse(JSON.stringify(bravePayload()), { contentType: "application/json" });
        }
        if (url.includes("engine=google_images")) throw new Error("Google unavailable");
        if (url.includes("engine=bing_images")) {
          return mockResponse(JSON.stringify(serpPayload()), { contentType: "application/json" });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    });

    assert.equal(response.provider, "bing_images");
    assert.deepEqual(response.providerFetchOrder, [
      "baidu",
      "brave_baseline",
      "google_images",
      "bing_images",
    ]);
    assert.equal(response.serpApiEngineLog[0].engine, "google_images");
    assert.equal(response.serpApiEngineLog[0].skippedReason, "exception");
    assert.equal(response.serpApiEngineLog[1].engine, "bing_images");
    assert.equal(response.serpApiEngineLog[1].usedAsFinal, true);
  } finally {
    process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
    process.env.SERPAPI_KEY = previousSerpKey;
  }
});
