import test from "node:test";
import assert from "node:assert/strict";
import { extractScenePageImages, readScenePageImages, scenePageUrl } from "./cdrama-scene-pages.js";

const source = { link: "https://www.tvmao.com/drama/source/episode/47", title: "第47集" };
const html = `<title>千古玦尘第47集剧情介绍</title>
  <img src="https://lbimg.tvmao.com/logo.jpg">
  <img src="http://lbimg.tvmao.com/stillcut/a.jpg" alt="千古玦尘第47集剧照">
  <img src="/stillcut/tiny.jpg" width="20" height="20">
  <img data-original="https://lbimg.tvmao.com/stillcut/b.jpg?x=1&amp;y=2" src="/placeholder.gif">
  <img src="https://images.example.org/unrelated.jpg">
  <img src="https://lbimg.tvmao.com/stillcut/a.jpg">`;

test("episode page extraction reads real embedded stills, retains provenance and filters boilerplate", () => {
  const results = extractScenePageImages(html, source);
  assert.equal(results.length, 2);
  assert.equal(results[0].thumbnail, "https://lbimg.tvmao.com/stillcut/a.jpg");
  assert.equal(results[0].episodeStart, 47);
  assert.equal(results[0].link, source.link);
  assert.match(results[1].thumbnail, /x=1&y=2$/);
  assert.deepEqual(extractScenePageImages(html, { link: "https://arbitrary.example.org/page" }), []);
  assert.deepEqual(extractScenePageImages(html, source, ["庆余年"]), [], "an unrelated drama page cannot contribute stills");
  assert.equal(extractScenePageImages(html, source, ["千古玦尘"]).length, 2);
});

test("recap page inline images survive without treating recommendation images as episode evidence", () => {
  const results = extractScenePageImages(`<article><title>Recap</title>
    <img src="https://blogger.googleusercontent.com/img/caught.jpg">
    <img src="https://0.gravatar.com/avatar/small.jpg">
    <div class="related-posts"><img src="https://blogger.googleusercontent.com/img/other.jpg"></div></article>`,
  { link: "https://cyn-lynn.blogspot.com/2021/06/recap.html" });
  assert.equal(results.length, 1);
  assert.match(results[0].thumbnail, /caught/);
  assert.equal(results[0].episodeStart, undefined, "generic recap membership never assigns the requested episode to a frame");
});

test("page reads allow only fixed hosts, refuse redirects, and cap streaming response size", async () => {
  for (const url of ["https://www.tvmao.com.evil.org/page", "https://127.0.0.1/page",
    "https://user:pass@www.tvmao.com/page", "http://www.tvmao.com/page", "https://www.tvmao.com:444/page"]) {
    assert.equal(scenePageUrl(url), "");
    assert.deepEqual(await readScenePageImages({ link: url }, { fetchImpl: () => { throw new Error("Must not fetch"); } }), []);
  }
  let calls = 0;
  const results = await readScenePageImages(source, { fetchImpl: async (_url, options) => {
    calls++;
    assert.equal(options.redirect, "error");
    assert.ok(options.signal);
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  } });
  assert.equal(calls, 1);
  assert.equal(results.length, 2);
  await assert.rejects(readScenePageImages(source, { fetchImpl: async () => new Response("x".repeat(800001),
    { headers: { "Content-Type": "text/html" } }) }), /too large/);
});

test("a nearby episode page follows a real numbered navigation link, not a guessed URL", async () => {
  const urls = [];
  const nearby = { link: "https://www.tvmao.com/drama/source/episode/43" };
  const result = await readScenePageImages(nearby, { episode: 47, fetchImpl: async url => {
    urls.push(url);
    return new Response(url === nearby.link
      ? `<title>第43集</title><a href="https://unsafe.example.org/episode/47">47</a><a href="/drama/source/episode/47">47</a>`
      : html, { headers: { "Content-Type": "text/html" } });
  } });
  assert.deepEqual(urls, [nearby.link, "https://www.tvmao.com/drama/source/episode/47"]);
  assert.equal(result[0].episodeStart, 47);
  assert.equal(result[0].link, urls[1]);
});
