import test from "node:test";
import assert from "node:assert/strict";
import { discoverScene, parseSceneResearch, researchScene, sceneImageQueries } from "./cdrama-scene-search.js";
import { episodeRange } from "./cdrama-recap-search.js";
import { createCdramaStillHandler } from "./cdrama-still-search.js";

const link = "https://recaps.example.org/show/episode-47";
const clue = { summary: "A possible post-defeat speech, not a verified frame.",
  chineseTitle: "千古玦尘", chineseCharacter: "芜浣", action: "defiant speech",
  chineseAction: "白发 认罪", episodeStart: 47, episodeEnd: 47, sourceUrls: [link] };
const grounded = {
  output: [
    { type: "web_search_call", action: { sources: [{ url: link, title: "Episode 47 recap" }] } },
    { type: "message", content: [{ type: "output_text", text: JSON.stringify({
      sources: [{ url: link, title: "Episode 47 recap", description: "Research summary of the confrontation." }],
      clues: [clue],
    }) }] },
  ],
};
const research = () => ({ clues: [clue], research: [{ title: "Episode 47 recap", link, snippet: "Research summary" }] });

test("scene clues require real provider sources, never model-invented links", () => {
  const data = structuredClone(grounded);
  const message = JSON.parse(data.output[1].content[0].text);
  message.clues.push({ ...clue, sourceUrls: ["https://fabricated.example.org/scene"] });
  message.sources.push({ url: "https://fabricated.example.org/scene", title: "Invented" });
  data.output[1].content[0].text = JSON.stringify(message);
  const result = parseSceneResearch(data);
  assert.equal(result.clues.length, 1);
  assert.equal(result.research.length, 1);
  assert.equal(result.clues[0].chineseCharacter, "芜浣");
  assert.equal(result.research[0].snippet, "Research summary of the confrontation.");
});

test("provider URL citations also ground clues; malformed research and unsafe links fail closed", () => {
  const data = structuredClone(grounded);
  data.output.shift();
  data.output[0].content[0].annotations = [{ type: "url_citation", url: link }];
  assert.equal(parseSceneResearch(data).clues.length, 1);
  assert.deepEqual(parseSceneResearch({ output: [{ type: "message", content: [{ type: "output_text", text: '{"clues":42}' }] }] }).clues, []);
  for (const bad of ["http://public.example.org", "https://127.0.0.1/x", "https://[::1]/x", "https://a.local/x", "https://user:pass@public.example.org"]) {
    const unsafe = structuredClone(grounded);
    unsafe.output[0].action.sources[0].url = bad;
    assert.equal(parseSceneResearch(unsafe).clues.length, 0);
  }
});

test("later native episode sources survive a noisy first batch of English search records", () => {
  const data = structuredClone(grounded);
  const gallery = "https://www.tvmao.com/drama/source/episode/47";
  data.output[0].action.sources.unshift(...Array.from({ length: 12 }, (_, i) => ({
    url: `https://video.example.org/watch/${i}`, title: "Video lead",
  })));
  data.output[0].action.sources.push({ url: gallery, title: "第47集剧照" });
  const result = parseSceneResearch(data);
  assert.ok(result.research.some(source => source.link === gallery));
  assert.equal(result.research.length, 10);
  assert.equal(result.clues.length, 1);
});

test("Chinese and English episode labels parse without promoting scene confidence", () => {
  assert.deepEqual(episodeRange("千古玦尘第47集剧照"), { episodeStart: 47, episodeEnd: 47 });
  assert.deepEqual(episodeRange("第12至14集"), { episodeStart: 12, episodeEnd: 14 });
  assert.deepEqual(episodeRange("第0集"), {});
  assert.deepEqual(episodeRange("第48至47集"), {});
});

test("scene searches use researched native names and episode clues, not a fixed villain template", () => {
  const cases = [
    clue,
    { ...clue, chineseTitle: "苍兰诀", chineseCharacter: "东方青苍", chineseAction: "救人 嘴硬", episodeStart: 9, episodeEnd: 9 },
    { ...clue, chineseTitle: "庆余年", chineseCharacter: "范闲", chineseAction: "醉酒 背诗", episodeStart: 27, episodeEnd: 27 },
  ];
  for (const current of cases) {
    const queries = sceneImageQueries("my remembered scene", "Drama", [current]);
    assert.ok(queries.some(q => q.includes(current.chineseCharacter) && q.includes(String(current.episodeStart))));
    assert.ok(queries.some(q => q.includes(current.chineseAction)));
    assert.ok(queries.some(q => q.includes("my remembered scene")));
    if (current !== clue) assert.ok(queries.every(q => !/芜浣|白发|认罪/.test(q)));
    assert.ok(queries.length <= 3);
  }
  assert.deepEqual(sceneImageQueries("unknown moment", "", []), ["unknown moment still"]);
});

test("image candidates survive blocked Reddit and distinguish episode alignment from frame verification", async () => {
  const requested = [];
  const reddit = "https://www.reddit.com/r/CDrama/comments/abc123/episode_47/";
  const result = await discoverScene({
    query: "Wu Huan making a villain speech after caught",
    resolveScene: async () => ({ ...research(), research: [...research().research, { link: reddit }] }),
    fetchPostImages: async () => { throw new Error("403"); },
    searchImages: async (q, options) => {
      requested.push({ q, options });
      return { results: [
        { title: "千古玦尘第47集剧照", thumbnail: "https://images.example.org/aligned.jpg", link },
        { title: "Episode 48 still", thumbnail: "https://images.example.org/nearby.jpg", link },
        { title: "A portrait", thumbnail: "https://images.example.org/portrait.jpg", link },
      ] };
    },
  });
  assert.equal(result.results.length, 3, "duplicate images across queries are removed");
  assert.deepEqual(result.results.map(item => item.match), ["episode-aligned", "nearby-episode", "broader-lead"]);
  assert.ok(result.results.every(item => item.evidence === "unverified" && item.subtitleStatus === "unchecked"));
  assert.match(result.warning, /Reddit blocked/);
  assert.ok(requested.some(item => item.q.includes("芜浣")));
  assert.ok(requested.every(item => item.options.preferOriginal === true));
});

test("source-only and partial provider failures remain explicit; unsupported names are never invented", async () => {
  const noImages = await discoverScene({
    query: "a remembered rivalry", resolveScene: async () => research(),
    searchImages: async () => { throw new Error("Unavailable"); },
  });
  assert.equal(noImages.research.length, 1);
  assert.equal(noImages.results.length, 0);
  assert.match(noImages.warning, /Some image searches were unavailable/);
  const fallback = await discoverScene({
    query: "quiet devotion", resolveScene: async () => { throw new Error("Unavailable"); },
    searchImages: async () => ({ results: [{ thumbnail: "https://images.example.org/devotion.jpg", link }] }),
  });
  assert.deepEqual(fallback.clues, []);
  assert.deepEqual(fallback.queries, ["quiet devotion still"]);
  assert.match(fallback.warning, /research was unavailable/);
  await assert.rejects(discoverScene({ query: "anything",
    resolveScene: async () => { throw new Error("Unavailable"); },
    searchImages: async () => { throw new Error("Unavailable"); },
  }));
});

test("resolver discovers a non-reasoning model and never asks for captions or image inventions", async () => {
  let body;
  const signal = new AbortController().signal;
  const connector = { proxy: async (_provider, path, options) => {
    assert.equal(options.signal, signal);
    if (path.includes("models")) return Response.json({ models: [{ id: "grok-reasoning" }, { id: "grok-non-reasoning" }] });
    body ??= JSON.parse(options.body);
    return Response.json(grounded);
  } };
  const result = await researchScene({ query: "defiant speech", dramaTitle: "Drama", signal }, connector);
  assert.equal(body.model, "grok-non-reasoning");
  assert.match(body.input, /Never return captions/);
  assert.match(body.input, /No watch-progress/);
  assert.equal(body.max_tool_calls, 3);
  assert.equal(result.clues.length, 1);
});

test("a separate native source lookup repairs broad research without inventing an episode-page URL", async () => {
  const vague = structuredClone(grounded);
  const parsed = JSON.parse(vague.output[1].content[0].text);
  delete parsed.clues[0].episodeStart;
  delete parsed.clues[0].episodeEnd;
  vague.output[1].content[0].text = JSON.stringify(parsed);
  const focused = structuredClone(grounded);
  const gallery = "https://www.tvmao.com/drama/source/episode/47";
  focused.output[0].action.sources.push({ url: gallery, title: "Episode stills" });
  const second = JSON.parse(focused.output[1].content[0].text);
  second.sources.push({ url: gallery, title: "Episode stills" });
  second.clues[0].sourceUrls = [gallery];
  focused.output[1].content[0].text = JSON.stringify(second);
  const requests = [];
  const result = await researchScene({ query: "remembered speech", dramaTitle: "Drama" }, {
    proxy: async (_provider, path, options) => {
      if (path.includes("models")) return Response.json({ models: [{ id: "grok-non-reasoning" }] });
      requests.push(JSON.parse(options.body));
      return Response.json(requests.length === 1 ? vague : focused);
    },
  });
  assert.equal(requests.length, 2);
  assert.match(requests[1].input, /Focused C-drama source lookup/);
  assert.match(requests[1].input, /芜浣/);
  assert.equal(result.clues[0].episodeStart, 47);
  assert.ok(result.research.some(source => source.link === gallery));
});

test("scene endpoint supports conversational descriptions and proxies candidates without leaking captions", async () => {
  const handler = createCdramaStillHandler(async () => ({ results: [
    { title: "第47集", thumbnail: "http://images.example.org/still.jpg", link },
  ] }), {}, { resolveScene: async () => research() });
  const query = "Wu Huan making a villain speech after caught. ".repeat(5).trim();
  const params = new URLSearchParams({ q: query, mode: "scenes", dramaTitle: "Ancient Love Poetry" });
  const response = await handler(new Request(`https://example.org/search?${params}`));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(result.clues[0].episodeStart, 47);
  assert.equal(result.results[0].match, "episode-aligned");
  assert.match(result.results[0].thumbnail, /^\/.netlify\/functions\/image-proxy/);
  assert.equal(result.results[0].subtitleStatus, "unchecked");
  assert.equal(Object.hasOwn(result, "ideas"), false);
  assert.equal((await handler(new Request("https://example.org/search?mode=scenes&q=" + "x".repeat(501)))).status, 400);
});
