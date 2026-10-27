import test from "node:test";
import assert from "node:assert/strict";
import { createCdramaStillHandler } from "./cdrama-still-search.js";
import { searchOneQuery } from "../preview-search.js";
import { readdir } from "node:fs/promises";
import deployedHandler from "../cdrama-still-search.js";

test("function discovery sees only valid endpoint names, not declaration files", async () => {
  const files = await readdir(new URL("../", import.meta.url), { withFileTypes: true });
  for (const file of files) {
    if (!file.isFile() || !/\.(?:[cm]?js|ts)$/.test(file.name)) continue;
    const name = file.name.replace(/\.(?:[cm]?js|ts)$/, "");
    assert.match(name, /^[A-Za-z0-9_-]+$/, `Invalid deployable function name: ${file.name}`);
  }
  const response = await deployedHandler(new Request("https://fandom.example/.netlify/functions/cdrama-still-search"));
  assert.equal(response.status, 400);
});

const request = (q) => new Request(`https://fandom.example/.netlify/functions/cdrama-still-search?q=${encodeURIComponent(q)}`);

test("generic C-drama source is validated and proxied while preserving the publisher link", async () => {
  let options;
  const handler = createCdramaStillHandler(async (_query, searchOptions) => {
    options = searchOptions;
    return { results: [
      { title: "Expression still", link: "https://studio.example/article", thumbnail: "https://images.example/no-cors.png", source: "studio.example" },
      { title: "Wrong URL", link: "http://unsafe.example/article", thumbnail: "https://images.example/other.jpg" },
      { title: "Local target", link: "https://studio.example/article-2", thumbnail: "https://127.0.0.1/private.png" },
    ] };
  });
  const res = await handler(request("xianxia startled elder still"));
  assert.equal(res.status, 200);
  assert.equal(options.providerPolicy, "cdrama-stills");
  const data = await res.json();
  assert.equal(data.results.length, 1);
  assert.equal(data.results[0].thumbnail, "/.netlify/functions/image-proxy?url=https%3A%2F%2Fimages.example%2Fno-cors.png");
  assert.equal(data.results[0].link, "https://studio.example/article");
  assert.equal(data.results[0].source, "studio.example");
  assert.equal((await handler(new Request(request("xianxia").url, { method: "POST" }))).status, 405);
});

test("generic C-drama queries do not require the first word in provider titles", async () => {
  // The test process uses a dummy key and a fully stubbed provider response.
  // No live provider or credential is accessed.
  process.env.SERPAPI_KEY = "fixture-key";
  try {
    const result = await searchOneQuery("xianxia startled elder still", {
      providerPolicy: "cdrama-stills",
      fetchImpl: async () => Response.json({
        images_results: Array.from({ length: 8 }, (_, index) => ({
          title: `Startled elder in a costume drama ${index}`,
          thumbnail: `https://images.example/${index}.jpg`,
          original: `https://images.example/original-${index}.jpg`,
          link: `https://studio-${index}.example/article`,
          domain: `studio-${index}.example`,
        })),
      }),
    });
    assert.equal(result.provider, "google_images");
    assert.ok(result.results.length > 0);
    assert.ok(result.results.some(item => item.title.includes("Startled elder")));
    assert.ok(result.results.every(item => !item.title.includes("xianxia")));
  } finally {
    delete process.env.SERPAPI_KEY;
  }
});
