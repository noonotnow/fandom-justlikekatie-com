import test from "node:test";
import assert from "node:assert/strict";
import { curateDisplayResults } from "./grid-curation.js";

const DIFFERENCE_COUNT = 256;

function fingerprint(id, {
  ones = [],
  width = 900,
  height = 1200,
  quality = 220,
  sharpness = 12,
  digest = `digest-${id}`,
} = {}) {
  const differences = new Uint8Array(DIFFERENCE_COUNT);
  for (const index of ones) differences[index % DIFFERENCE_COUNT] = 1;
  return { digest, differences, quality, sharpness, width, height };
}

function spreadBits(index, count = 96) {
  const bits = new Set();
  const seed = [...String(index)].reduce(
    (hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0,
    2166136261,
  );
  let state = seed || 1;
  while (bits.size < count) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    bits.add(state >>> 24);
  }
  return [...bits];
}

function result(id, {
  source = `source-${id}.test`,
  link = `https://${source}/editorial/${id}`,
  title = `刘宇宁 editorial frame ${id}`,
  fp = fingerprint(id, { ones: spreadBits(id) }),
} = {}) {
  return {
    title,
    thumbnail: `https://images.test/${id}.jpg`,
    link,
    source,
    fp,
  };
}

async function curate(results, options = {}) {
  return curateDisplayResults(
    [{ query: "刘宇宁 月光氛围", results }],
    {
      loadBuffer: async (_url, item) => item,
      fingerprint: async (_buffer, item) => item.fp,
      ...options,
    },
  );
}

test("chooses a coherent event over forced source diversity", async () => {
  const article = "https://editorial.test/liu-yuning/moonlight-set";
  const event = Array.from({ length: 9 }, (_, index) => result(`event-${index}`, {
    source: "editorial.test",
    link: article,
    title: `刘宇宁 月光大片 ${index + 1}`,
    fp: fingerprint(`event-${index}`, { ones: spreadBits(index + 1, 72) }),
  }));
  const scattered = Array.from({ length: 9 }, (_, index) => result(`random-${index}`, {
    source: `random-${index}.test`,
    title: `刘宇宁 unrelated handsome result ${index}`,
    fp: fingerprint(`random-${index}`, { ones: spreadBits(index + 20, 108) }),
  }));

  const first = await curate([...event, ...scattered]);
  const second = await curate([...event, ...scattered]);
  const permuted = await curate([...scattered, ...event].reverse());

  assert.equal(first.curation.mode, "event");
  assert.match(first.curation.rationale, /coherent editorial/i);
  assert.equal(first.displayResults.length, 9);
  assert.equal(first.displayResults.every(item => item.link === article), true);
  assert.deepEqual(first, second, "the same candidate pool must produce the same receipt and order");
  assert.deepEqual(first, permuted, "provider ordering must not change the winning board");
});

test("near-similar event frames survive until editorial mode is selected", async () => {
  const article = "https://rednote.test/post/moonlight-editorial";
  const base = new Set(Array.from({ length: 128 }, (_, index) => index));
  const frames = Array.from({ length: 9 }, (_, index) => result(`near-${index}`, {
    source: "rednote.test",
    link: article,
    title: `刘宇宁 月光写真 frame ${index}`,
    fp: fingerprint(`near-${index}`, {
      // Every pair is about seventeen percent apart: similar enough to be a
      // visual family, but visibly different rather than duplicate copies.
      ones: [
        ...[...base].filter(bit => bit < index * 11 || bit >= (index + 1) * 11),
        ...Array.from({ length: 11 }, (_, offset) => 128 + index * 11 + offset),
      ],
    }),
  }));

  const curated = await curate(frames);

  assert.equal(curated.curation.mode, "event");
  assert.equal(curated.displayResults.length, 9);
});

test("a strong compiled set wins when no coherent event exists", async () => {
  const compiled = Array.from({ length: 12 }, (_, index) => result(`compiled-${index}`, {
    source: `publication-${index % 6}.test`,
    link: `https://publication-${index % 6}.test/story/${index}`,
    title: `刘宇宁 role ${index} setting ${String.fromCharCode(97 + index)}`,
    fp: fingerprint(`compiled-${index}`, { ones: spreadBits(index + 40, 112) }),
  }));

  const curated = await curate(compiled);

  assert.equal(curated.curation.mode, "compiled");
  assert.equal(curated.displayResults.length, 9);
  assert.match(curated.curation.rationale, /varied set/i);
});

test("same publisher with unrelated shoots does not become an event", async () => {
  const unrelated = Array.from({ length: 10 }, (_, index) => result(`publisher-${index}`, {
    source: "magazine.test",
    link: `https://magazine.test/${2020 + index}/issue-${index}/story`,
    title: `刘宇宁 ${["concert", "airport", "costume", "suit", "drama", "award", "street", "brand", "stage", "portrait"][index]} ${index}`,
    fp: fingerprint(`publisher-${index}`, { ones: spreadBits(index + 70, 116) }),
  }));

  const curated = await curate(unrelated);

  assert.equal(curated.curation.mode, "compiled");
});

test("search-engine viewer routes are never mistaken for one shared article", async () => {
  const viewerResults = Array.from({ length: 10 }, (_, index) => result(`viewer-${index}`, {
    source: "Bing Images",
    link: `https://www.bing.com/images/search?view=detail&id=result-${index}`,
    title: `刘宇宁 editorial frame ${index}`,
  }));

  const curated = await curate(viewerResults);

  assert.equal(curated.curation.mode, "compiled");
});

test("missing publisher identity cannot corroborate an event", async () => {
  const sourceLess = Array.from({ length: 10 }, (_, index) => result(`source-less-${index}`, {
    source: "",
    link: `https://editorials.test/shoot-${index}`,
    title: `刘宇宁 moonlight editorial ${index}`,
  }));

  const curated = await curate(sourceLess);

  assert.equal(curated.curation.mode, "compiled");
});

test("caption-similarity chains cannot transitively manufacture an event family", async () => {
  const words = ["amber", "bamboo", "crimson", "dragon", "ember", "falcon", "gold", "harbor", "ink", "jade", "king"];
  const chained = Array.from({ length: 10 }, (_, index) => result(`chain-${index}`, {
    source: "magazine.test",
    link: `https://magazine.test/unrelated/${index}`,
    title: `刘宇宁 ${words[index]} ${words[index + 1]}`,
    fp: fingerprint(`chain-${index}`, {
      ones: Array.from({ length: Math.min(index * 26, DIFFERENCE_COUNT) }, (_, bit) => bit),
    }),
  }));

  const curated = await curate(chained);

  assert.notEqual(curated.curation?.mode, "event");
});

test("exact image copies are always collapsed before either board is scored", async () => {
  const article = "https://editorial.test/liu-yuning/exact-copy-set";
  const duplicateFingerprint = fingerprint("shared", { ones: spreadBits(2), digest: "same-bytes" });
  const results = [
    result("copy-a", { source: "editorial.test", link: article, fp: duplicateFingerprint }),
    result("copy-b", {
      source: "editorial.test",
      link: article,
      fp: { ...duplicateFingerprint, quality: duplicateFingerprint.quality + 1 },
    }),
    ...Array.from({ length: 8 }, (_, index) => result(`unique-${index}`, {
      source: "editorial.test",
      link: article,
      fp: fingerprint(`unique-${index}`, { ones: spreadBits(index + 10) }),
    })),
  ];

  const curated = await curate(results);
  const thumbnails = curated.displayResults.map(item => item.thumbnail);

  assert.equal(curated.displayResults.length, 9);
  assert.equal(thumbnails.includes(result("copy-a").thumbnail), false);
  assert.equal(thumbnails.includes(result("copy-b").thumbnail), true);
});

test("unloaded, undersized, and unusably cropped images fail the hard gate", async () => {
  const valid = Array.from({ length: 9 }, (_, index) => result(`valid-${index}`));
  const undersized = result("tiny", {
    fp: fingerprint("tiny", { width: 80, height: 80 }),
  });
  const extremeCrop = result("crop", {
    fp: fingerprint("crop", { width: 160, height: 1200 }),
  });
  const broken = result("broken");

  const curated = await curate(
    [undersized, extremeCrop, broken, ...valid],
    {
      loadBuffer: async (_url, item) => {
        if (item.thumbnail.includes("broken")) throw new Error("host unavailable");
        return item;
      },
    },
  );

  assert.equal(curated.displayResults.length, 9);
  assert.equal(curated.displayResults.some(item => /tiny|crop|broken/.test(item.thumbnail)), false);
});

test("large but blank or low-detail images fail the hard gate", async () => {
  const valid = Array.from({ length: 9 }, (_, index) => result(`detail-${index}`));
  const blank = result("blank", {
    fp: fingerprint("blank", {
      ones: [],
      width: 1200,
      height: 1600,
      quality: 205,
      sharpness: 0,
    }),
  });

  const curated = await curate([blank, ...valid]);

  assert.equal(curated.displayResults.length, 9);
  assert.equal(curated.displayResults.some(item => item.thumbnail === blank.thumbnail), false);
});

test("visually repetitive frames without meaningful variation cannot fill an event board", async () => {
  const article = "https://editorial.test/reposted-frame";
  const base = spreadBits(3);
  const repetitive = Array.from({ length: 10 }, (_, index) => result(`repetitive-${index}`, {
    source: "editorial.test",
    link: article,
    fp: fingerprint(`repetitive-${index}`, {
      ones: index === 0 ? base : [...base.slice(0, -1), (220 + index) % DIFFERENCE_COUNT],
    }),
  }));

  const curated = await curate(repetitive);

  assert.notEqual(curated.curation?.mode, "event");
  assert.ok(curated.displayResults.length < 9);
});
