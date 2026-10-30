import test from "node:test";
import assert from "node:assert/strict";
import { connectorRecapResults, discoverRecaps, episodeRange, redditImages, redditPostUrl } from "./cdrama-recap-search.js";
import { createCdramaStillHandler } from "./cdrama-still-search.js";

test("episode tags are optional discovery metadata, never a viewing gate", () => {
  assert.deepEqual(episodeRange("Title Episodes 1–3 Discussion"), { episodeStart: 1, episodeEnd: 3 });
  assert.deepEqual(episodeRange("Title EP. 22 recap"), { episodeStart: 22, episodeEnd: 22 });
  assert.deepEqual(episodeRange("A general discussion"), {});
  assert.deepEqual(episodeRange("Episodes 9-2"), {});
});

test("Reddit extraction reads galleries, previews and inline media with source context", async () => {
  const link = "https://www.reddit.com/r/CDrama/comments/abc123/episode_discussion/";
  let fetched;
  const images = await redditImages(link, async url => {
    fetched = url;
    return Response.json([{ data: { children: [{ data: {
      title: "A Drama Episodes 1-3 discussion", subreddit: "CDrama",
      gallery_data: { items: [{ media_id: "gallery" }] },
      media_metadata: {
        gallery: { e: "Image", s: { u: "https://preview.redd.it/a.jpg?width=900&amp;format=pjpg" } },
        inline: { e: "Image", s: { u: "https://i.redd.it/b.png" } },
        unsafe: { e: "Image", s: { u: "https://127.0.0.1/private.png" } },
      },
      preview: { images: [{ source: { url: "https://i.redd.it/c.jpg" } }] },
    } }] } }]);
  });
  assert.match(fetched, /\.json\?raw_json=1/);
  assert.equal(images.length, 3);
  assert.equal(images[0].thumbnail, "https://preview.redd.it/a.jpg?width=900&format=pjpg");
  assert.equal(images[0].episodeEnd, 3);
  assert.equal(images[0].evidence, "unverified");
  assert.equal(redditPostUrl("https://www.reddit.com.evil.test/r/CDrama/comments/abc/title"), null);
  assert.equal(redditPostUrl("https://www.reddit.com/r/CDrama/comments/abc/title/private/"), null);
});

test("blocked Reddit image reads preserve discovered sources without invented images", async () => {
  const source = { title: "A Drama Episodes 10–12 discussion", link: "https://www.reddit.com/r/CDrama/comments/abc123/a_drama/", snippet: "Episode discussion" };
  const result = await discoverRecaps({
    query: "caught stirring trouble", dramaTitle: "A Drama",
    searchPages: async () => [source], searchImages: async () => ({ results: [] }),
    fetchPostImages: async () => { throw new Error("403"); },
  });
  assert.equal(result.results.length, 0);
  assert.equal(result.research.length, 1);
  assert.match(result.warning, /Reddit blocked/);
  assert.ok(result.queries.some(query => query.includes("reddit")));
  assert.ok(result.queries.some(query => query.includes("recap")));
});

test("recap endpoint accepts no watch boundary and returns proxied unverified candidates", async () => {
  const handler = createCdramaStillHandler(async () => ({ results: [] }), {
    searchPages: async () => [{ title: "A Drama EP 8", link: "https://www.reddit.com/r/CDrama/comments/abc123/a_drama/", snippet: "Discussion" }],
    fetchPostImages: async link => [{ title: "A Drama EP 8", link, source: "Reddit", thumbnail: "https://i.redd.it/image.jpg", episodeStart: 8, episodeEnd: 8 }],
  });
  const response = await handler(new Request("https://example.test/.netlify/functions/cdrama-still-search?mode=recaps&q=playing%20innocent&dramaTitle=A%20Drama"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.research.length, 1);
  assert.match(body.results[0].thumbnail, /^\/.netlify\/functions\/image-proxy/);
  assert.equal(body.results[0].evidence, "unverified");
  assert.equal(body.results[0].episodeEnd, 8);
});

test("connector discovery only accepts URLs returned by actual web search, not model inventions", () => {
  const real = "https://recap.example/show/episode-3";
  const result = connectorRecapResults({ output: [
    { type: "web_search_call", action: { sources: [{ url: real }] } },
    { type: "message", content: [{ type: "output_text", text: JSON.stringify({ results: [
      { title: "Episode 3 recap", link: real, snippet: "Search description" },
      { title: "Imaginary episode", link: "https://invented.example/episode", snippet: "No evidence" },
    ] }) }] },
  ] });
  assert.equal(result.length, 1);
  assert.equal(result[0].link, real);
});
