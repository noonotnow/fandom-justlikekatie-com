import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  createPublicLookup,
  RENDER_HEIGHT,
  RENDER_WIDTH,
  renderCanonicalOutput,
  validatedProxyTarget,
} from "./canonical-render.js";

function packet() {
  return {
    actor: { name: "Star" },
    vibe: { label: "Vibe", labelEn: "Vibe" },
    provenance: { generatedAt: "2026-08-05T12:00:00.000Z", gridId: "grid-1" },
    sourceCards: [{
      id: "card-1",
      title: "Persisted source",
      imageUrl: "/.netlify/functions/image-proxy?url=https%3A%2F%2Fimages.example%2Ftrusted.jpg",
    }],
  };
}

test("renders canonical PNG bytes only from the persisted source selection", async () => {
  const source = await sharp({
    create: { width: 400, height: 500, channels: 3, background: "#9b4f6f" },
  }).jpeg().toBuffer();
  const targets = [];
  const bytes = await renderCanonicalOutput(
    packet(),
    { id: "grid-output", kind: "grid", sourceId: "grid-1" },
    {
      requestUrl: "https://fandom.justlikekatie.com/api/create-handoff",
      fetchSourceImpl: async target => {
        targets.push(target);
        return source;
      },
    },
  );
  const metadata = await sharp(bytes).metadata();
  assert.deepEqual(targets, ["https://images.example/trusted.jpg"]);
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, RENDER_WIDTH);
  assert.equal(metadata.height, RENDER_HEIGHT);
});

test("renders the incident-shaped grid deterministically from canonical persisted image URLs", async () => {
  const incidentTitle = "风掠过塞纳河，攀上埃菲尔铁塔。驻足塔边，赴一场与@摩登兄弟刘宇宁 的巴黎之约。#地球超新鲜, Cr.刘宇宁LYN工作室, 微博：摩登兄弟刘宇宁 , http://t.cn/A6KkynyZ, #摩登兄弟刘宇宁 , #刘宇宁LYN工作室, #刘宇宁铁证, #刘宇宁高原, 摩登兄弟劉宇寧台灣應援站";
  const productionTarget = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSkyscraperEnergy&usqp=CAU";
  const incident = packet();
  incident.id = "94a5581e-e2e4-4c14-b904-48e77ce1e5f0";
  incident.actor = { name: "刘宇宁" };
  incident.vibe = { label: "摩天能量", labelEn: "Skyscraper Energy" };
  incident.sourceCards = Array.from({ length: 4 }, (_, index) => ({
    id: `card-${index + 1}`,
    title: index === 0 ? incidentTitle : `Persisted source ${index + 1}`,
    imageUrl: `/.netlify/functions/image-proxy?url=${encodeURIComponent(
      index === 0 ? productionTarget : `https://images.example/${index + 1}.jpg`,
    )}`,
  }));
  const source = await sharp({
    create: { width: 400, height: 500, channels: 3, background: "#9b4f6f" },
  }).jpeg().toBuffer();
  const targets = [];
  const render = () => renderCanonicalOutput(
    incident,
    { id: "grid-output", kind: "grid", sourceId: "grid-1" },
    {
      requestUrl: "https://fandom.justlikekatie.com/api/create-handoff",
      fetchSourceImpl: async target => {
        targets.push(target);
        return source;
      },
    },
  );

  const first = await render();
  const second = await render();
  assert.deepEqual(first, second);
  assert.deepEqual(targets.slice(0, 4), [
    productionTarget,
    "https://images.example/2.jpg",
    "https://images.example/3.jpg",
    "https://images.example/4.jpg",
  ]);
  assert.equal(targets.includes(incidentTitle), false);
});

test("rejects direct, cross-origin, private, and mismatched proxy source descriptors", () => {
  const requestUrl = "https://fandom.justlikekatie.com/api/create-handoff";
  assert.throws(
    () => validatedProxyTarget("https://attacker.example/arbitrary.png", requestUrl),
    /same-origin image proxy/,
  );
  assert.throws(
    () => validatedProxyTarget(
      "/.netlify/functions/image-proxy?url=http%3A%2F%2Fexample.com%2Fimage.jpg",
      requestUrl,
    ),
    /public HTTPS hostname/,
  );
  assert.throws(
    () => validatedProxyTarget(
      "/.netlify/functions/image-proxy?url=https%3A%2F%2F127.0.0.1%2Fsecret",
      requestUrl,
    ),
    /public HTTPS hostname/,
  );
});

test("returns the DNS callback shape requested by modern and legacy Node clients", async () => {
  const addresses = [
    { address: "93.184.216.34", family: 4 },
    { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
  ];
  const lookup = createPublicLookup(async (hostname, options) => {
    assert.equal(hostname, "images.example");
    assert.deepEqual(options, { all: true, verbatim: true });
    return addresses;
  });
  const callLookup = options => new Promise((resolve, reject) => {
    lookup("images.example", options, (error, address, family) => {
      if (error) reject(error);
      else resolve({ address, family });
    });
  });

  assert.deepEqual(await callLookup({ all: true }), { address: addresses, family: undefined });
  assert.deepEqual(await callLookup({ all: false }), {
    address: addresses[0].address,
    family: addresses[0].family,
  });
});

test("fails closed when DNS is unresolvable, private, or malformed", async () => {
  const cases = [
    async () => { throw new Error("getaddrinfo ENOTFOUND images.example"); },
    async () => [{ address: "127.0.0.1", family: 4 }],
    async () => [{ address: "::ffff:7f00:1", family: 6 }],
    async () => [{ address: "0:0:0:0:0:ffff:a9fe:1", family: 6 }],
    async () => [{ address: undefined, family: 4 }],
  ];
  for (const lookupImpl of cases) {
    const lookup = createPublicLookup(lookupImpl);
    const error = await new Promise(resolve => {
      lookup("images.example", { all: true }, resolve);
    });
    assert.ok(error instanceof Error);
  }
});

test("reports malformed and missing persisted proxy targets without fetching", async () => {
  for (const imageUrl of [
    "/.netlify/functions/image-proxy?url=not-a-url",
    "/.netlify/functions/image-proxy",
  ]) {
    const malformed = packet();
    malformed.sourceCards[0].imageUrl = imageUrl;
    let fetchCalls = 0;
    await assert.rejects(
      renderCanonicalOutput(
        malformed,
        { id: "grid-output", kind: "grid", sourceId: "grid-1" },
        {
          requestUrl: "https://fandom.justlikekatie.com/api/create-handoff",
          fetchSourceImpl: async () => {
            fetchCalls += 1;
          },
        },
      ),
    );
    assert.equal(fetchCalls, 0);
  }
});
