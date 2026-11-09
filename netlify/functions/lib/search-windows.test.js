import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBaiduImageUrl,
  clearBaiduImageCache,
  searchBaiduImages,
} from "./baidu-images.js";
import {
  normalizeSearchWindow,
  providerWindowParams,
  searchOneQuery,
} from "../preview-search.js";

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    async text() { return JSON.stringify(payload); },
    async json() { return payload; },
  };
}

function baiduPayload(prefix = "p0", count = 8) {
  return {
    data: Array.from({ length: count }, (_, index) => ({
      thumbURL: `https://baidu-images.example/${prefix}-${index}.jpg`,
      objURL: `https://baidu-originals.example/${prefix}-${index}.jpg`,
      fromURL: `https://baidu-source-${index % 5}.example/article/${prefix}-${index}`,
      fromURLHost: `baidu-source-${index % 5}.example`,
      fromPageTitle: `刘学义 Baidu result ${prefix} ${index}`,
    })),
  };
}

function withProviderEnv({ brave = null, serp = null } = {}, run) {
  const previous = {
    brave: process.env.BRAVE_SEARCH_API_KEY,
    serp: process.env.SERPAPI_KEY,
  };
  if (brave) process.env.BRAVE_SEARCH_API_KEY = brave;
  else delete process.env.BRAVE_SEARCH_API_KEY;
  if (serp) process.env.SERPAPI_KEY = serp;
  else delete process.env.SERPAPI_KEY;
  return Promise.resolve(run()).finally(() => {
    if (previous.brave === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
    else process.env.BRAVE_SEARCH_API_KEY = previous.brave;
    if (previous.serp === undefined) delete process.env.SERPAPI_KEY;
    else process.env.SERPAPI_KEY = previous.serp;
  });
}

test("page zero keeps the historical Baidu URL and deeper pages add an offset", () => {
  const base = buildBaiduImageUrl("刘学义 白衣");
  assert.equal(buildBaiduImageUrl("刘学义 白衣", { page: 0 }), base);
  assert.ok(!base.includes("pn="));
  const second = new URL(buildBaiduImageUrl("刘学义 白衣", { page: 2 }));
  assert.equal(second.searchParams.get("pn"), "60");
  assert.equal(second.searchParams.get("rn"), "30");
  const clamped = new URL(buildBaiduImageUrl("刘学义 白衣", { page: 99 }));
  assert.equal(clamped.searchParams.get("pn"), "120");
});

test("Baidu caches each page separately", async () => {
  clearBaiduImageCache();
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    const page = new URL(url).searchParams.get("pn") ? "p1" : "p0";
    return jsonResponse(baiduPayload(page));
  };
  try {
    const first = await searchBaiduImages("刘学义 白衣", { fetchImpl, retries: 0 });
    const deeper = await searchBaiduImages("刘学义 白衣", { fetchImpl, retries: 0, page: 1 });
    const firstAgain = await searchBaiduImages("刘学义 白衣", { fetchImpl, retries: 0 });
    assert.equal(urls.length, 2);
    assert.notEqual(first.results[0].thumbnail, deeper.results[0].thumbnail);
    assert.equal(firstAgain.telemetry.cacheHit, true);
    assert.equal(firstAgain.results[0].thumbnail, first.results[0].thumbnail);
    assert.equal(deeper.telemetry.page, 1);
  } finally {
    clearBaiduImageCache();
  }
});

test("window normalization rejects unknown recency and clamps pages", () => {
  assert.deepEqual(normalizeSearchWindow(), { page: 0, recency: null });
  assert.deepEqual(normalizeSearchWindow({ page: -3, recency: "week" }), { page: 0, recency: null });
  assert.deepEqual(normalizeSearchWindow({ page: 2.7, recency: "year" }), { page: 2, recency: "year" });
  assert.deepEqual(normalizeSearchWindow({ page: 40 }), { page: 4, recency: null });
});

test("provider window parameters map to each engine's paging and date filters", () => {
  assert.equal(providerWindowParams("google_images", { page: 0 }), "");
  assert.equal(providerWindowParams("brave", {}), "");
  assert.equal(providerWindowParams("google_images", { page: 2, recency: "month" }), "&ijn=2&tbs=qdr%3Am");
  assert.equal(providerWindowParams("bing_images", { page: 1, recency: "year" }), "&first=36&qft=%2Bfilterui%3Aage-lt525600");
  assert.equal(providerWindowParams("yandex_images", { page: 3, recency: "year" }), "&p=3");
  assert.equal(providerWindowParams("brave", { page: 2, recency: "year" }), "&offset=2&freshness=py");
});

test("a deeper page reaches Baidu with an offset and records the window in provenance", async () => {
  clearBaiduImageCache();
  const calls = [];
  await withProviderEnv({}, async () => {
    const response = await searchOneQuery("刘学义 念无双 垣仲 白衣", {
      debug: true,
      page: 1,
      baiduOptions: { cache: false, retries: 0 },
      fetchImpl: async (url) => {
        calls.push(url);
        return jsonResponse(baiduPayload("p1"));
      },
    });
    assert.equal(response.provider, "baidu");
    assert.equal(new URL(calls[0]).searchParams.get("pn"), "30");
    assert.deepEqual(response.cacheProvenance.window, { page: 1, recency: null });
  });
  clearBaiduImageCache();
});

test("page-one cache key is unchanged while windowed searches get distinct keys", async () => {
  await withProviderEnv({}, async () => {
    const run = (options) => searchOneQuery("刘学义 念无双 垣仲 白衣", {
      debug: true,
      baiduOptions: { cache: false, retries: 0 },
      fetchImpl: async () => jsonResponse(baiduPayload()),
      ...options,
    });
    const base = await run({});
    const explicitBase = await run({ page: 0, recency: null });
    const deeper = await run({ page: 1 });
    assert.equal(base.cacheProvenance.key, explicitBase.cacheProvenance.key);
    assert.notEqual(base.cacheProvenance.key, deeper.cacheProvenance.key);
  });
});

test("a recency window skips Baidu and Yandex and filters SerpAPI engines by date", async () => {
  const calls = [];
  await withProviderEnv({ serp: "serp-test" }, async () => {
    const response = await searchOneQuery("刘学义 念无双 垣仲 白衣", {
      debug: true,
      recency: "year",
      fetchImpl: async (url) => {
        calls.push(url);
        if (url.includes("serpapi.com")) {
          return jsonResponse({
            images_results: Array.from({ length: 6 }, (_, index) => ({
              title: `刘学义 recent ${index}`,
              thumbnail: `https://google-images.example/recent-${index}.jpg`,
              original: `https://google-images.example/recent-original-${index}.jpg`,
              link: `https://recent-source-${index}.example/article`,
              domain: `recent-source-${index}.example`,
            })),
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    });
    assert.ok(!calls.some(url => url.includes("image.baidu.com")));
    assert.equal(response.baiduAttemptLog.skippedReason, "recency_unsupported");
    const google = calls.find(url => url.includes("engine=google_images"));
    assert.ok(google);
    assert.equal(new URL(google).searchParams.get("tbs"), "qdr:y");
    assert.equal(response.provider, "google_images");
  });
});
