import test from "node:test";
import assert from "node:assert/strict";
import { discoverSimilarStills, publicSimilarityUrl } from "./cdrama-similar-stills.js";
import { createCdramaStillHandler } from "./cdrama-still-search.js";

const seed = "https://images.example.com/wu-huan.jpg";
const match = {
  title: "Alternate still", image: "https://images.example.com/other.jpg",
  thumbnail: "https://thumbs.example.com/other.jpg", link: "https://publisher.example.com/scene", source: "Publisher",
};
const discover = (body) => discoverSimilarStills(seed, {
  apiKey: "fixture", fetchImpl: async () => Response.json(body),
});

test("similarity accepts only public HTTPS URLs and strips fragments", () => {
  assert.equal(publicSimilarityUrl(`${seed}#fragment`), seed);
  for (const url of ["data:image/png;base64,abc", "blob:https://example.com/a", "/.netlify/functions/image-proxy?url=x",
    "http://example.com/a", "https://localhost/a", "https://a.local/a", "https://a.internal/a",
    "https://127.0.0.1/a", "https://[::1]/a", "https://2130706433/a", "https://user:pass@example.com/a",
    "https://example.com:8080/a", "https://a.test/a", "https://private/a", "x".repeat(4097)]) {
    assert.equal(publicSimilarityUrl(url), "", url);
  }
});

test("provider receives the clean image URL, not a keyword or caption", async () => {
  let requested;
  const result = await discoverSimilarStills(seed, {
    apiKey: "fixture",
    fetchImpl: async (url, options) => {
      requested = url;
      assert.ok(options.signal);
      assert.equal(options.redirect, "error");
      return Response.json({ visual_matches: [match] });
    },
  });
  assert.equal(requested.searchParams.get("engine"), "google_lens");
  assert.equal(requested.searchParams.get("url"), seed);
  assert.equal(requested.searchParams.has("q"), false);
  assert.equal(result.results[0].thumbnail, match.image);
  assert.equal(result.results[0].link, match.link);
});

test("deduplicates the seed and image copies, rejects unsafe results, caps at twelve", async () => {
  const result = await discover({ visual_matches: [
    { ...match, image: seed }, match, match, null,
    { ...match, image: "https://127.0.0.1/a", thumbnail: "data:bad" },
    { ...match, link: "javascript:alert(1)" },
    ...Array.from({ length: 20 }, (_, i) => ({ ...match, image: `https://images.example.com/alt-${i}.jpg` })),
  ] });
  assert.equal(result.results.length, 12);
  assert.equal(new Set(result.results.map(x => x.thumbnail)).size, 12);
});

test("falls back to public thumbnails, preserves warning when there are no visual matches", async () => {
  const result = await discover({ visual_matches: [{ ...match, image: undefined }] });
  assert.equal(result.results[0].thumbnail, match.thumbnail);
  const empty = await discover({ visual_matches: [] });
  assert.equal(empty.results.length, 0);
  assert.match(empty.warning, /No additional visual matches/);
});

test("missing configuration, provider errors and fetch rejection fail explicitly", async () => {
  await assert.rejects(discoverSimilarStills(seed, { apiKey: "" }), /not configured/);
  await assert.rejects(discover({ error: "provider detail" }), /unavailable/);
  await assert.rejects(discoverSimilarStills(seed, { apiKey: "fixture", fetchImpl: async () => new Response("", { status: 429 }) }), /unavailable/);
  await assert.rejects(discoverSimilarStills(seed, { apiKey: "fixture", fetchImpl: async () => { throw new Error("offline"); } }), /offline/);
});

test("similar mode accepts no query, proxies images and retains sources without caching", async () => {
  const handler = createCdramaStillHandler(undefined, {}, {}, async image => {
    assert.equal(image, seed);
    return { results: [match].map(x => ({ ...x, thumbnail: x.image })), warning: "Unverified" };
  });
  const response = await handler(new Request(`https://fandom.example/.netlify/functions/cdrama-still-search?mode=similar&image=${encodeURIComponent(seed)}`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const data = await response.json();
  assert.equal(data.results[0].thumbnail, `/.netlify/functions/image-proxy?url=${encodeURIComponent(match.image)}`);
  assert.equal(data.results[0].evidence, "unverified");
  assert.equal(data.results[0].link, match.link);
});

test("invalid seeds never invoke provider; errors do not expose provider secrets", async () => {
  let called = false;
  const handler = createCdramaStillHandler(undefined, {}, {}, async () => {
    called = true;
    throw new Error("https://provider/?api_key=private-fixture");
  });
  const invalid = await handler(new Request("https://fandom.example/.netlify/functions/cdrama-still-search?mode=similar&image=data:abc"));
  assert.equal(invalid.status, 400);
  assert.equal(called, false);
  const failure = await handler(new Request(`https://fandom.example/.netlify/functions/cdrama-still-search?mode=similar&image=${encodeURIComponent(seed)}`));
  assert.equal(failure.status, 503);
  assert.doesNotMatch(await failure.text(), /private-fixture|api_key/);
});
