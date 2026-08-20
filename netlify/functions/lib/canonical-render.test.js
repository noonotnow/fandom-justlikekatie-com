import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  createPublicLookup,
  RENDER_HEIGHT,
  RENDER_WIDTH,
  fetchSafeImage,
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

test("renders the exact saved grid selected by a multi-grid packet output", async () => {
  const current = packet();
  current.grids = [{
    id: "grid-2",
    actor: "Second Star",
    actorAccentColor: "#4f7ea8",
    vibe: "Second Vibe",
    vibeEn: "Second Vibe",
    vibeEmoji: "🌙",
    vibeSubtitle: "A complete saved aesthetic.",
    searchSpell: "second star editorial search",
    capturedDate: "2026-08-05",
    edition: { legendary: true },
    images: [{
      resultId: "grid-result-2",
      title: "Second grid result",
      imageUrl: "/.netlify/functions/image-proxy?url=https%3A%2F%2Fimages.example%2Fselected-grid.jpg",
    }],
  }];
  const source = await sharp({
    create: { width: 400, height: 500, channels: 3, background: "#4f7ea8" },
  }).jpeg().toBuffer();
  const targets = [];
  await renderCanonicalOutput(
    current,
    { id: "grid-output-2", kind: "grid", sourceId: "grid-2" },
    {
      requestUrl: "https://fandom.justlikekatie.com/api/create-handoff",
      fetchSourceImpl: async target => {
        targets.push(target);
        return source;
      },
    },
  );
  assert.deepEqual(targets, ["https://images.example/selected-grid.jpg"]);
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

// ── Middle-earth tests ────────────────────────────────────────────────────────

const ME_REQUEST_URL = "https://fandom.justlikekatie.com/api/create-handoff";

function mePacket(overrides = {}) {
  return {
    actor: { name: "Middle-earth", nameEn: "Middle-earth" },
    vibe: { label: "Meme Forge", labelEn: "Meme Forge", emoji: "⚔️" },
    provenance: { generatedAt: "2026-08-10T12:00:00.000Z", gridId: "middle-earth-meme-abc123", sourceRoute: "/memeforge/middle-earth" },
    sourceCards: [{
      id: "src-abc123",
      title: "Frodo Baggins",
      imageUrl: "/.netlify/functions/image-proxy?url=https%3A%2F%2Fimages.example%2Ffrodo.jpg",
      resultId: "img-frodo-1",
    }],
    middleEarthContent: {
      "meme-abc123": {
        kind: "meme",
        title: "Even the smallest person",
        text: "Even the smallest person can change the course of the future.",
        tone: "inspirational",
        layout: "centered",
      },
    },
    ...overrides,
  };
}

function meOutput(overrides = {}) {
  return {
    id: "meme-abc123",
    kind: "meme",
    sourceId: "src-abc123",
    label: "Meme: Even the smallest person",
    included: true,
    addedAt: "2026-08-10T12:00:00.000Z",
    textFingerprint: "meme\x00Even the smallest person\x00Even the smallest person can change the course of the future.\x00\x00inspirational\x00centered",
    ...overrides,
  };
}

test("renders an image-backed meme as a 1080x1350 PNG using the proxied source visual", async () => {
  const source = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#3a2a1a" },
  }).jpeg().toBuffer();

  const fetchedTargets = [];
  const bytes = await renderCanonicalOutput(
    mePacket(),
    meOutput(),
    {
      requestUrl: ME_REQUEST_URL,
      fetchSourceImpl: async target => {
        fetchedTargets.push(target);
        return source;
      },
    },
  );

  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, RENDER_WIDTH);
  assert.equal(metadata.height, RENDER_HEIGHT);
  // Must have fetched via the proxy, never directly
  assert.deepEqual(fetchedTargets, ["https://images.example/frodo.jpg"]);
});

test("renders a typography-only spellbook as a 1080x1350 PNG without any image fetch", async () => {
  const typoPkt = mePacket({
    sourceCards: [{
      id: "src-abc123",
      title: "The Fellowship",
      imageUrl: "",    // empty — triggers typography-only path
      resultId: "middle-earth:spellbook:src-abc123",
    }],
    middleEarthContent: {
      "spellbook-abc123": {
        kind: "spellbook",
        title: "Not all those who wander are lost",
        text: "All that is gold does not glitter, not all those who wander are lost; the old that is strong does not wither, deep roots are not reached by the frost.",
        secondaryText: "J.R.R. Tolkien · The Fellowship of the Ring",
        tone: "reflective",
        layout: "quote",
      },
    },
  });
  const spellOutput = {
    id: "spellbook-abc123",
    kind: "spellbook",
    sourceId: "src-abc123",
    label: "Spellbook: Not all those who wander are lost",
    included: true,
    addedAt: "2026-08-10T12:00:00.000Z",
  };

  let fetchCalls = 0;
  const bytes = await renderCanonicalOutput(
    typoPkt,
    spellOutput,
    {
      requestUrl: ME_REQUEST_URL,
      fetchSourceImpl: async () => {
        fetchCalls += 1;
        return Buffer.alloc(0);
      },
    },
  );

  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, RENDER_WIDTH);
  assert.equal(metadata.height, RENDER_HEIGHT);
  assert.equal(fetchCalls, 0, "typography-only path must not fetch any image");
});

test("Type specimen stays typography-only even when the packet retains a selected source asset", async () => {
  const packetWithEvidence = mePacket({
    middleEarthContent: {
      "spellbook-abc123": {
        kind: "spellbook",
        title: "A note in the margin",
        text: "Courage is found in unlikely places.",
        secondaryText: "Field note",
        tone: "Field note",
        layout: "Type specimen",
      },
    },
  });
  let fetchCalls = 0;
  const bytes = await renderCanonicalOutput(
    packetWithEvidence,
    meOutput({ id: "spellbook-abc123", kind: "spellbook" }),
    {
      requestUrl: ME_REQUEST_URL,
      fetchSourceImpl: async () => {
        fetchCalls += 1;
        return Buffer.alloc(0);
      },
    },
  );
  const metadata = await sharp(bytes).metadata();
  assert.equal(fetchCalls, 0);
  assert.equal(metadata.width, RENDER_WIDTH);
  assert.equal(metadata.height, RENDER_HEIGHT);
});

test("safe image fetch rejects a redirect from a public URL to a private target before a second request", async () => {
  const requested = [];
  await assert.rejects(
    fetchSafeImage(
      "https://images.example/public.jpg",
      0,
      async target => {
        requested.push(target);
        return {
          status: 302,
          headers: { location: "https://127.0.0.1/internal" },
          body: Buffer.alloc(0),
        };
      },
    ),
    /public HTTPS hostname/,
  );
  assert.deepEqual(requested, ["https://images.example/public.jpg"]);
});

test("rejects a meme/spellbook output when middleEarthContent is missing or mismatched", async () => {
  const source = await sharp({
    create: { width: 400, height: 400, channels: 3, background: "#111" },
  }).jpeg().toBuffer();
  const fetchImpl = async () => source;

  // Missing middleEarthContent entirely
  const noContent = mePacket({ middleEarthContent: undefined });
  await assert.rejects(
    renderCanonicalOutput(noContent, meOutput(), { requestUrl: ME_REQUEST_URL, fetchSourceImpl: fetchImpl }),
    /missing its structured text content/,
  );

  // middleEarthContent present but keyed for a different output id
  const wrongKey = mePacket({ middleEarthContent: { "other-output-id": mePacket().middleEarthContent["meme-abc123"] } });
  await assert.rejects(
    renderCanonicalOutput(wrongKey, meOutput(), { requestUrl: ME_REQUEST_URL, fetchSourceImpl: fetchImpl }),
    /missing its structured text content/,
  );
});

test("rejects a Middle-earth output whose source imageUrl bypasses the same-origin proxy", async () => {
  const directUrl = mePacket({
    sourceCards: [{
      id: "src-abc123",
      title: "Frodo",
      // Direct external URL — not via the proxy
      imageUrl: "https://attacker.example/image.jpg",
      resultId: "img-1",
    }],
  });
  let fetchCalls = 0;
  await assert.rejects(
    renderCanonicalOutput(
      directUrl,
      meOutput(),
      {
        requestUrl: ME_REQUEST_URL,
        fetchSourceImpl: async () => {
          fetchCalls += 1;
          return Buffer.alloc(0);
        },
      },
    ),
    /same-origin image proxy/,
  );
  assert.equal(fetchCalls, 0);
});

test("renders image-backed and typography-only Middle-earth outputs deterministically", async () => {
  const source = await sharp({
    create: { width: 600, height: 800, channels: 3, background: "#2a1a0a" },
  }).jpeg().toBuffer();
  const fetchImpl = async () => source;

  // Image-backed determinism
  const first = await renderCanonicalOutput(mePacket(), meOutput(), { requestUrl: ME_REQUEST_URL, fetchSourceImpl: fetchImpl });
  const second = await renderCanonicalOutput(mePacket(), meOutput(), { requestUrl: ME_REQUEST_URL, fetchSourceImpl: fetchImpl });
  assert.deepEqual(first, second, "image-backed render must be deterministic");

  // Typography-only determinism
  const typoPkt = mePacket({
    sourceCards: [{ id: "src-abc123", title: "T", imageUrl: "", resultId: "r" }],
  });
  const third = await renderCanonicalOutput(typoPkt, meOutput(), { requestUrl: ME_REQUEST_URL, fetchSourceImpl: fetchImpl });
  const fourth = await renderCanonicalOutput(typoPkt, meOutput(), { requestUrl: ME_REQUEST_URL, fetchSourceImpl: fetchImpl });
  assert.deepEqual(third, fourth, "typography-only render must be deterministic");
});
