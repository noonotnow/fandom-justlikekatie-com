import test from "node:test";
import assert from "node:assert/strict";
import { candidateIdForResult, CURATION_VERSION, curateDisplayResults } from "./grid-curation.js";

test("analyzed candidate identity follows the image digest across metadata and query changes", () => {
  const first = candidateIdForResult({
    digest: "same-image-bytes",
    batchKey: "actor birthday emoji pack",
    title: "First search title",
    link: "https://photo.sina.cn/album/first",
    thumbnail: "https://cdn.example/first.jpg?token=old",
  });
  const second = candidateIdForResult({
    digest: "same-image-bytes",
    batchKey: "different query",
    title: "Corrected title",
    link: "https://photo.sina.cn/album/canonical",
    thumbnail: "https://cdn.example/renewed.jpg?token=new",
  });
  assert.equal(first, second);
});

test("a prior digest-backed preference can break a close next-review board tie", async () => {
  const candidates = Array.from({ length: 10 }, (_, index) => result(`preference-${index}`, {
    source: `publisher-${index}.test`,
    title: `刘宇宁 editorial portrait ${index}`,
    fp: fingerprint(`preference-${index}`, {
      ones: spreadBits(`preference-${index}`, 96),
      quality: 220,
      sharpness: 12,
    }),
  }));
  const baseline = await curate(candidates, { diagnostics: true });
  const selectedIds = new Set(
    baseline.diagnostics.strongestCompiled.candidates.map(candidate => candidate.candidateId),
  );
  const omitted = baseline.diagnostics.rawCandidates.find(candidate =>
    !selectedIds.has(candidate.candidateId));
  assert.ok(omitted, "the ten-image pool should leave one valid candidate out");

  const preferred = await curate(candidates, {
    diagnostics: true,
    preferredCandidateIds: [omitted.candidateId],
  });
  assert.ok(preferred.diagnostics.strongestCompiled.candidates.some(candidate =>
    candidate.candidateId === omitted.candidateId));
});

const DIFFERENCE_COUNT = 256;

function fingerprint(id, {
  ones = [],
  width = 900,
  height = 1200,
  quality = 220,
  sharpness = 12,
  digest = `digest-${id}`,
  compositeScore = 0,
  singleFrameRatio = 1,
} = {}) {
  const differences = new Uint8Array(DIFFERENCE_COUNT);
  for (const index of ones) differences[index % DIFFERENCE_COUNT] = 1;
  return { digest, differences, quality, sharpness, width, height, compositeScore, singleFrameRatio };
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
  return curateBatches([{ query: "刘宇宁 月光氛围", results }], options);
}

async function curateBatches(batches, options = {}) {
  return curateDisplayResults(
    batches,
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

test("a specific work and character query can form a cross-publisher character Event board", async () => {
  const characterFrames = Array.from({ length: 9 }, (_, index) => result(`yuan-zhong-${index}`, {
    source: `publisher-${index}.test`,
    link: `https://publisher-${index}.test/念无双/frame-${index}`,
    title: `源仲 character frame ${index + 1}`,
    fp: fingerprint(`yuan-zhong-${index}`, { ones: spreadBits(`yuan-zhong-${index}`, 104) }),
  }));

  const curated = await curateBatches([
    { query: "刘学义 念无双 源仲", results: characterFrames },
  ], { diagnostics: true });

  assert.equal(curated.diagnostics.strongestEvent.candidates.length, 9);
  assert.equal(curated.diagnostics.strongestCompiled.candidates.length, 9);
  assert.equal(curated.diagnostics.eventFamilies.some(family => family.size >= 9), true);
  assert.equal(curated.diagnostics.receipt.curationVersion, CURATION_VERSION);
});

test("a generic actor style query cannot manufacture an Event family", async () => {
  const styleFrames = Array.from({ length: 9 }, (_, index) => result(`suit-${index}`, {
    source: `publisher-${index}.test`,
    link: `https://publisher-${index}.test/style/frame-${index}`,
    title: `unrelated suit portrait ${index + 1}`,
    fp: fingerprint(`suit-${index}`, { ones: spreadBits(`suit-${index}`, 104) }),
  }));

  const curated = await curateBatches([
    { query: "刘学义 西装 写真", results: styleFrames },
  ], { diagnostics: true });

  assert.equal(curated.diagnostics.strongestEvent, null);
  assert.equal(curated.diagnostics.strongestCompiled.candidates.length, 9);
  assert.equal(curated.diagnostics.boardDiagnostics.event.available, false);
  assert.equal(curated.diagnostics.boardDiagnostics.event.reasonCode, "no_bounded_role_family");
  assert.match(curated.diagnostics.boardDiagnostics.event.summary, /more specific/i);
  assert.equal(curated.diagnostics.boardDiagnostics.compiled.available, true);
});

test("related character and look queries can combine into one Event mood board", async () => {
  const queries = ["刘宇宁 离十六 蒙面", "刘宇宁 离十六 面具", "刘宇宁 离十六 夜行"];
  const batches = queries.map((query, batchIndex) => ({
    query,
    results: Array.from({ length: 3 }, (_, index) => result(`masked-${batchIndex}-${index}`, {
      source: `publisher-${batchIndex}-${index}.test`,
      link: `https://publisher-${batchIndex}-${index}.test/li-shiliu/frame`,
      title: `离十六 moonlit mask and hat frame ${batchIndex}-${index}`,
      fp: fingerprint(`masked-${batchIndex}-${index}`, {
        ones: spreadBits(`masked-${batchIndex}-${index}`, 104),
      }),
    })),
  }));

  const curated = await curateBatches(batches, { diagnostics: true });

  assert.equal(curated.diagnostics.strongestEvent.candidates.length, 9);
  assert.equal(curated.diagnostics.eventFamilies.some(family => family.size >= 9), true);
});

test("different characters from the same work cannot combine into one Event board", async () => {
  const roles = ["角色甲", "角色乙", "角色丙"];
  const batches = roles.map((role, batchIndex) => ({
    query: `刘学义 同一部剧 ${role}`,
    results: Array.from({ length: 3 }, (_, index) => result(`separate-role-${batchIndex}-${index}`, {
      source: `publisher-${batchIndex}-${index}.test`,
      link: `https://publisher-${batchIndex}-${index}.test/${role}/frame`,
      title: `同一部剧 ${role} character frame ${index + 1}`,
      fp: fingerprint(`separate-role-${batchIndex}-${index}`, {
        ones: spreadBits(`separate-role-${batchIndex}-${index}`, 104),
      }),
    })),
  }));

  const curated = await curateBatches(batches, { diagnostics: true });

  assert.equal(curated.diagnostics.strongestEvent, null);
  assert.equal(curated.diagnostics.eventFamilies.some(family => family.size >= 9), false);
  assert.equal(curated.diagnostics.strongestCompiled.candidates.length, 9);
});

test("provider order cannot change which candidates survive the curation cap", async () => {
  const event = Array.from({ length: 9 }, (_, index) => result(`capped-event-${index}`, {
    source: "editorial.test",
    link: "https://editorial.test/capped-event",
    title: `刘宇宁 月光大片 ${index + 1}`,
    fp: fingerprint(`capped-event-${index}`, { ones: spreadBits(index + 1, 72) }),
  }));
  const noise = Array.from({ length: 40 }, (_, index) => result(`capped-noise-${index}`, {
    source: `noise-${index}.test`,
    link: `https://noise-${index}.test/result`,
    title: `刘宇宁 unrelated result ${index}`,
  }));

  const first = await curate([...noise, ...event], { candidateLimit: 36 });
  const second = await curate([...event, ...noise], { candidateLimit: 36 });

  assert.deepEqual(first, second);
  assert.equal(first.curation.mode, "event");
  assert.equal(first.displayResults.length, 9);
});

test("candidate cap preserves top-ranked batch priority over lexical query order", async () => {
  const article = "https://editorial.test/top-ranked-event";
  const topRanked = [
    ...Array.from({ length: 9 }, (_, index) => result(`ranked-event-${index}`, {
      source: "editorial.test",
      link: article,
      title: `刘宇宁 月光大片 ${index + 1}`,
    })),
    ...Array.from({ length: 9 }, (_, index) => result(`ranked-noise-${index}`)),
  ];
  const lowerRanked = Array.from({ length: 30 }, (_, index) => result(`lower-${index}`, {
    source: `aaa-lower-${index}.test`,
  }));

  const curated = await curateBatches([
    { query: "zzzz top ranked", results: topRanked },
    { query: "aaaa lower ranked", results: lowerRanked },
  ], { candidateLimit: 36 });

  assert.equal(curated.curation.mode, "event");
  assert.equal(curated.displayResults.every(item => item.link === article), true);
});

test("tracking-only duplicate variants cannot change the capped curation output", async () => {
  const stable = Array.from({ length: 35 }, (_, index) => result(`tracking-stable-${index}`, {
    source: `stable-${index}.test`,
    link: `https://stable-${index}.test/result`,
  }));
  const sharedFingerprint = fingerprint("tracking-duplicate", { ones: spreadBits("tracking-duplicate") });
  const trackedA = {
    ...result("tracking-a", {
      source: "editorial.test",
      link: "https://editorial.test/shared?utm_source=a",
      fp: sharedFingerprint,
    }),
    thumbnail: "https://images.test/tracking-duplicate.jpg",
  };
  const trackedB = {
    ...result("tracking-b", {
      source: "editorial.test",
      link: "https://editorial.test/shared?utm_source=b",
      fp: sharedFingerprint,
    }),
    title: trackedA.title,
    thumbnail: trackedA.thumbnail,
  };

  const first = await curate([...stable, trackedA, trackedB], { candidateLimit: 36 });
  const second = await curate([trackedB, trackedA, ...stable].reverse(), { candidateLimit: 36 });

  assert.deepEqual(first, second);
  assert.equal(first.displayResults.some(item => item.link === trackedA.link), true);
  assert.equal(first.displayResults.some(item => item.link === trackedB.link), false);
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

test("a strong compiled set wins with a frozen component score breakdown", async () => {
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

  const diagnostic = await curate(compiled, { diagnostics: true });
  const breakdown = diagnostic.diagnostics.strongestCompiled.scoreBreakdown;
  assert.deepEqual(Object.keys(breakdown), [
    "promiseFulfillment", "coreAnchorCoverage", "heroSlotFulfillment", "coherentRange",
    "visualVariation", "quality", "contradictionPenalty",
  ]);
  const contributionTotal = Object.values(breakdown)
    .reduce((total, component) => total + component.contribution, 0);
  assert.ok(Math.abs(contributionTotal - diagnostic.diagnostics.strongestCompiled.score) < 0.001);
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

test("higher-scoring event family wins over a lexically earlier eligible family", async () => {
  const weak = Array.from({ length: 9 }, (_, index) => result(`weak-${index}`, {
    source: "aaa-editorial.test",
    link: `https://aaa-editorial.test/shoot/${index}`,
    title: `刘宇宁 shared moonlight sequence ${index}`,
  }));
  const strongLink = "https://zzz-editorial.test/one-article";
  const strong = Array.from({ length: 9 }, (_, index) => result(`strong-${index}`, {
    source: "zzz-editorial.test",
    link: strongLink,
    title: `刘宇宁 cinematic frame ${index}`,
  }));

  const curated = await curate([...weak, ...strong]);

  assert.equal(curated.curation.mode, "event");
  assert.equal(curated.displayResults.every(item => item.link === strongLink), true);
});

test("compiled selection chooses scored quality over lexical first-match order", async () => {
  const lowQuality = Array.from({ length: 9 }, (_, index) => result(`low-score-${index}`, {
    source: `aaa-low-${index}.test`,
    fp: fingerprint(`low-score-${index}`, {
      ones: spreadBits(`low-score-${index}`),
      quality: 121,
    }),
  }));
  const highQuality = Array.from({ length: 9 }, (_, index) => result(`high-score-${index}`, {
    source: `zzz-high-${index}.test`,
    fp: fingerprint(`high-score-${index}`, {
      ones: spreadBits(`high-score-${index}`),
      quality: 240,
    }),
  }));

  const curated = await curate([...lowQuality, ...highQuality]);

  assert.equal(curated.curation.mode, "compiled");
  assert.equal(curated.displayResults.every(item => item.source.startsWith("zzz-high-")), true);
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

test("diagnostics retain exact-copy and image-gate rejection reasons", async () => {
  const exactFingerprint = fingerprint("same-digest", { ones: spreadBits(71) });
  const items = [
    result("exact-a", { fp: exactFingerprint }),
    result("exact-b", { fp: exactFingerprint }),
    result("broken", { fp: null }),
    ...Array.from({ length: 9 }, (_, index) => result(`clean-${index}`)),
  ];
  const output = await curate(items, {
    diagnostics: true,
    fingerprint: async (_buffer, item) => item.fp,
  });

  assert.equal(output.diagnostics.dropped.some(item => item.dropReason === "exact_duplicate"), true);
  assert.equal(output.diagnostics.dropped.some(item => item.dropReason === "unusable_image"), true);
  assert.equal(output.diagnostics.rawCandidates.length, items.length);
});

test("diagnostics explain when usable images collapse into too much visual duplication", async () => {
  const exactFingerprint = fingerprint("repeated", { ones: spreadBits(91) });
  const repeated = Array.from({ length: 9 }, (_, index) => result(`repeated-${index}`, {
    source: `publisher-${index}.test`,
    fp: exactFingerprint,
  }));
  const output = await curate(repeated, { diagnostics: true });

  assert.equal(output.diagnostics.boardDiagnostics.event.reasonCode, "too_much_visual_duplication");
  assert.equal(output.diagnostics.boardDiagnostics.compiled.reasonCode, "too_much_visual_duplication");
  assert.match(output.diagnostics.boardDiagnostics.compiled.summary, /1 distinct frames/);
});

test("diagnostics explain when fewer than nine images are usable", async () => {
  const output = await curate(
    Array.from({ length: 8 }, (_, index) => result(`sparse-${index}`)),
    { diagnostics: true },
  );

  assert.equal(output.diagnostics.boardDiagnostics.event.reasonCode, "too_few_usable_images");
  assert.equal(output.diagnostics.boardDiagnostics.compiled.reasonCode, "too_few_usable_images");
  assert.match(output.diagnostics.boardDiagnostics.event.summary, /8 usable images/);
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

  const curated = await curate(repetitive, { diagnostics: true });

  assert.notEqual(curated.curation?.mode, "event");
  assert.ok(curated.displayResults.length < 9);
  assert.equal(curated.diagnostics.boardDiagnostics.event.reasonCode, "too_much_visual_duplication");
  assert.match(curated.diagnostics.boardDiagnostics.event.summary, /visual duplicates/i);
  assert.equal(curated.diagnostics.boardDiagnostics.compiled.reasonCode, "too_much_visual_duplication");
  assert.match(curated.diagnostics.boardDiagnostics.compiled.summary, /visual overlap/i);
});

test("bounds concurrent image analysis for serverless runtimes", async () => {
  let active = 0;
  let peak = 0;
  const items = Array.from({ length: 12 }, (_, index) => result(`bounded-${index}`));

  const curated = await curate(items, {
    analysisConcurrency: 3,
    loadBuffer: async (_url, item) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return item;
    },
  });

  assert.equal(curated.displayResults.length, 9);
  assert.equal(peak, 3);
});

test("composite thumbnails are rejected before their internal variety can earn score", async () => {
  const collage = result("collage", {
    title: "刘学义介绍 +10部必看陆剧 多图合集",
    source: "high-variety.test",
    fp: fingerprint("collage", {
      ones: spreadBits("collage", 128),
      quality: 280,
      sharpness: 40,
      compositeScore: 0.91,
      singleFrameRatio: 0.09,
    }),
  });
  const clean = Array.from({ length: 9 }, (_, index) => result(`single-${index}`, {
    title: `刘学义 源仲 白衣 single editorial frame ${index}`,
  }));
  const output = await curateBatches([
    { query: "刘学义 念无双 源仲", results: [collage, ...clean] },
  ], {
    diagnostics: true,
    promise: {
      id: "cold-jade-test",
      requiredCombinations: [{ id: "yuan-zhong", any: ["源仲"] }],
      supportingAnchors: ["白衣"],
      hardAntiAnchors: [],
      softContradictions: [],
      hero: { any: ["源仲"] },
      clusterIds: [],
      aestheticClusters: [],
    },
  });

  assert.equal(output.displayResults.length, 9);
  assert.equal(output.displayResults.some(item => item.thumbnail === collage.thumbnail), false);
  assert.equal(output.diagnostics.dropped.some(item => item.dropReason === "composite_image"), true);
  assert.equal(output.diagnostics.receipt.compositeRejectedCount, 1);
  assert.equal(output.diagnostics.strongestCompiled.promise.singleFrameRatio, 1);
});

test("a Vibe promise gate beats technically varied contradictory cards", async () => {
  const promise = {
    id: "cold-jade-test",
    requiredCombinations: [
      { id: "yuan-zhong", any: ["源仲"] },
      { id: "pale-costume", any: ["白衣", "pale robe"] },
    ],
    supportingAnchors: ["silver", "snow", "moonlight"],
    hardAntiAnchors: ["modern event", "fire truck"],
    softContradictions: ["red", "black armor", "慕容璟和"],
    hero: { any: ["源仲", "白衣"] },
    clusterIds: [],
    aestheticClusters: [],
  };
  const coldJade = Array.from({ length: 9 }, (_, index) => result(`cold-jade-${index}`, {
    source: `cold-${index % 3}.test`,
    title: `刘学义 源仲 白衣 silver moonlight frame ${index}`,
    fp: fingerprint(`cold-jade-${index}`, { ones: spreadBits(`cold-jade-${index}`, 92) }),
  }));
  const chaos = Array.from({ length: 9 }, (_, index) => result(`chaos-${index}`, {
    source: `chaos-${index}.test`,
    title: `刘学义 ${index % 2 ? "慕容璟和 red black armor" : "unrelated modern portrait"} ${index}`,
    fp: fingerprint(`chaos-${index}`, {
      ones: spreadBits(`chaos-${index}`, 128),
      quality: 270,
    }),
  }));
  const output = await curateBatches([
    { query: "刘学义 念无双 源仲", results: coldJade },
    { query: "刘学义 角色 剧照", results: chaos },
  ], { diagnostics: true, promise });

  assert.equal(output.displayResults.length, 9);
  assert.equal(output.displayResults.every(item => /源仲|白衣/.test(item.title)), true);
  assert.equal(output.diagnostics.strongestCompiled.promise.coreCount, 9);
  assert.equal(output.diagnostics.strongestCompiled.promise.heroFulfillment, 1);
  assert.equal("sourceRange" in output.diagnostics.strongestCompiled.scoreBreakdown, false);
  assert.equal("queryRange" in output.diagnostics.strongestCompiled.scoreBreakdown, false);
});

test("character query provenance cannot prove cluster membership without result evidence", async () => {
  const unrelated = Array.from({ length: 9 }, (_, index) => result(`query-prior-${index}`, {
    title: `刘学义 unrelated dark commander frame ${index}`,
  }));
  const promise = {
    id: "yuan-zhong-only",
    requiredCombinations: [{ id: "yuan-zhong", any: ["源仲"] }],
    supportingAnchors: [],
    hardAntiAnchors: [],
    softContradictions: ["dark commander"],
    hero: { any: ["源仲"] },
    clusterIds: ["yuan-zhong"],
    aestheticClusters: [{
      id: "yuan-zhong",
      work: "念无双",
      character: "源仲",
      aliases: ["Yuan Zhong"],
      vibeCompatibility: {},
    }],
  };
  const output = await curateBatches([
    { query: "刘学义 念无双 源仲", results: unrelated },
  ], { diagnostics: true, promise });

  assert.equal(output.displayResults.length, 0);
  assert.equal(output.diagnostics.strongestCompiled, null);
  assert.equal(output.diagnostics.boardDiagnostics.compiled.reasonCode, "promise_not_fulfilled");
  assert.match(output.diagnostics.boardDiagnostics.compiled.summary, /only 0 of 9 cards/i);
});

test("every required promise combination must match on each core card", async () => {
  const partial = Array.from({ length: 9 }, (_, index) => result(`partial-promise-${index}`, {
    title: `刘学义 源仲 editorial frame ${index}`,
  }));
  const output = await curateBatches([
    { query: "刘学义 念无双 源仲", results: partial },
  ], {
    diagnostics: true,
    promise: {
      id: "cold-jade-required-set",
      requiredCombinations: [
        { id: "character", any: ["源仲"] },
        { id: "pale-look", any: ["白衣", "pale robe"] },
      ],
      supportingAnchors: [],
      hardAntiAnchors: [],
      softContradictions: [],
      hero: { any: ["源仲"] },
      clusterIds: [],
      aestheticClusters: [],
    },
  });

  assert.equal(output.displayResults.length, 0);
  assert.equal(output.diagnostics.boardDiagnostics.compiled.reasonCode, "promise_not_fulfilled");
});

test("incompatible character looks are confined to secondary slots", async () => {
  const core = Array.from({ length: 7 }, (_, index) => result(`yuan-core-${index}`, {
    title: `刘学义 源仲 白衣 silver editorial frame ${index}`,
  }));
  const conflicting = Array.from({ length: 2 }, (_, index) => result(`murong-conflict-${index}`, {
    title: `刘学义 慕容璟和 black armor commander frame ${index}`,
  }));
  const promise = {
    id: "cold-jade-placement",
    requiredCombinations: [
      { id: "character", any: ["源仲"] },
      { id: "pale-look", any: ["白衣"] },
    ],
    supportingAnchors: ["silver"],
    hardAntiAnchors: [],
    softContradictions: ["慕容璟和", "black armor"],
    hero: { any: ["源仲", "白衣"] },
    clusterIds: ["yuan-zhong"],
    aestheticClusters: [
      {
        id: "yuan-zhong",
        work: "念无双",
        character: "源仲",
        wardrobeAnchors: ["白衣", "silver"],
      },
      {
        id: "murong-jinghe",
        work: "春花焰",
        character: "慕容璟和",
        wardrobeAnchors: ["black armor", "commander"],
      },
    ],
  };
  const output = await curateBatches([
    { query: "刘学义 character study", results: [...conflicting, ...core] },
  ], { diagnostics: true, promise });
  const highSalience = [1, 3, 4, 5, 7].map(index => output.displayResults[index]?.title || "");
  const secondary = [0, 2, 6, 8].map(index => output.displayResults[index]?.title || "");

  assert.equal(output.displayResults.length, 9);
  assert.equal(highSalience.every(title => title.includes("源仲")), true);
  assert.equal(secondary.filter(title => title.includes("慕容璟和")).length, 2);
  assert.equal(output.diagnostics.strongestCompiled.promise.highSalienceCoreCount, 5);
  assert.equal(output.diagnostics.strongestCompiled.promise.incompatibleClusterCount, 2);
});

test("one generic visual word cannot claim character-look membership", async () => {
  const generic = Array.from({ length: 9 }, (_, index) => result(`generic-mask-${index}`, {
    title: `unrelated actor moonlight portrait ${index}`,
  }));
  const output = await curateBatches([
    { query: "刘宇宁 书卷一梦 离十六", results: generic },
  ], {
    diagnostics: true,
    promise: {
      id: "li-shiliu-cluster",
      requiredCombinations: [],
      supportingAnchors: [],
      hardAntiAnchors: [],
      softContradictions: [],
      hero: { any: ["离十六"] },
      clusterIds: ["li-shiliu"],
      aestheticClusters: [{
        id: "li-shiliu",
        work: "书卷一梦",
        character: "离十六",
        wardrobeAnchors: ["mask", "moonlight", "hat"],
      }],
    },
  });

  assert.equal(output.displayResults.length, 0);
  assert.equal(output.diagnostics.boardDiagnostics.compiled.reasonCode, "promise_not_fulfilled");
});

test("successful non-diagnostic curation carries profile provenance", async () => {
  const frames = Array.from({ length: 9 }, (_, index) => result(`provenance-${index}`));
  const profileVersions = {
    identityProfileVersion: 2,
    aestheticClusterVersion: 1,
    promiseContractVersion: 2,
  };
  const output = await curate(frames, { profileVersions });

  assert.equal(output.curation.identityProfileVersion, 2);
  assert.equal(output.curation.aestheticClusterVersion, 1);
  assert.equal(output.curation.promiseContractVersion, 2);
});
