import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  candidateIdForResult,
  CURATION_VERSION,
  curateDisplayResults,
  MIN_RUNNER_UP_CARD_DIFFERENCE,
} from "./grid-curation.js";
import { vibePromiseFor } from "./actor-identity-profiles.js";
import { fingerprintImage } from "./image-dedup.js";

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

test("pairwise ranking evidence can change a close proposal without query or source signals", async () => {
  const candidates = Array.from({ length: 10 }, (_, index) => result(`ranking-${index}`, {
    source: `publisher-${index}.test`,
    title: `刘宇宁 ranking portrait ${index}`,
    fp: fingerprint(`ranking-${index}`, {
      ones: spreadBits(`ranking-${index}`, 96),
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
  assert.ok(omitted);

  const calibrated = await curate(candidates, {
    diagnostics: true,
    calibrationProfile: {
      calibrationVersion: 1,
      evidenceCount: 1,
      sourceReceiptIds: ["rescue-ranking"],
      sourceEvidenceCandidateIds: [omitted.candidateId, "historical-omitted"],
      positiveCandidateIds: [],
      negativeCandidateIds: [],
      heroCandidateIds: [],
      positiveQueries: [],
      negativeQueries: [],
      positiveSources: [],
      negativeSources: [],
      positiveClusters: [],
      negativeClusters: [],
      positiveAntiAnchors: [],
      negativeAntiAnchors: [],
      rankingContrasts: [{
        preferredCandidateId: omitted.candidateId,
        omittedCandidateId: "historical-omitted",
      }],
      rankingWins: { [omitted.candidateId]: 8 },
      rankingLosses: {},
      preferredPositions: { [omitted.candidateId]: 2 },
    },
  });
  const selected = calibrated.diagnostics.strongestCompiled.candidates;
  const preferred = selected.find(candidate => candidate.candidateId === omitted.candidateId);
  assert.ok(preferred);
  assert.equal(preferred.calibration.rankingScore, 1);
  assert.equal(preferred.calibration.preferredPosition, 2);
  assert.ok(preferred.calibration.positive.includes("pairwise-ranking-win"));
  assert.equal(calibrated.diagnostics.calibrationSignals.rankingContrastCount, 1);
});

test("calibrated and control selection share one frozen image analysis", async () => {
  const candidates = Array.from({ length: 10 }, (_, index) => result(`frozen-${index}`, {
    source: `publisher-${index}.test`,
    fp: fingerprint(`frozen-${index}`, { ones: spreadBits(`frozen-${index}`, 96) }),
  }));
  const seen = new Set();
  const calibrated = await curateDisplayResults(
    [{ query: "刘宇宁 frozen comparison", results: candidates }],
    {
      diagnostics: true,
      loadBuffer: async (url, item) => {
        if (seen.has(url)) throw new Error("image was fetched twice");
        seen.add(url);
        return item;
      },
      fingerprint: async (_buffer, item) => item.fp,
      calibrationProfile: {
        calibrationVersion: 1,
        evidenceCount: 1,
        sourceReceiptIds: ["rescue-frozen"],
        sourceEvidenceCandidateIds: [],
        positiveCandidateIds: [],
        negativeCandidateIds: [],
        heroCandidateIds: [],
        positiveQueries: [],
        negativeQueries: [],
        positiveSources: [candidates[0].source],
        negativeSources: [],
        positiveClusters: [],
        negativeClusters: [],
        positiveAntiAnchors: [],
        negativeAntiAnchors: [],
        rankingContrasts: [],
        rankingWins: {},
        rankingLosses: {},
        preferredPositions: {},
      },
      calibrationControl: {
        preferredCandidateIds: [],
        batchRanks: { "刘宇宁 frozen comparison": 0 },
      },
    },
  );
  assert.equal(seen.size, candidates.length);
  assert.ok(calibrated.controlDiagnostics);
  assert.deepEqual(
    calibrated.diagnostics.rawCandidates.map(candidate => candidate.imageDigest).sort(),
    calibrated.controlDiagnostics.rawCandidates.map(candidate => candidate.imageDigest).sort(),
  );
  assert.deepEqual(
    calibrated.diagnostics.rawCandidates.map(candidate => candidate.dropReason).sort(),
    calibrated.controlDiagnostics.rawCandidates.map(candidate => candidate.dropReason).sort(),
  );
});

test("confirmed rescue calibration transfers source and hero preferences beyond exact saved candidates", async () => {
  const candidates = Array.from({ length: 10 }, (_, index) => result(`calibration-${index}`, {
    source: `publisher-${index}.test`,
    title: `刘宇宁 calibrated portrait ${index}`,
    fp: fingerprint(`calibration-${index}`, {
      ones: spreadBits(`calibration-${index}`, 96),
      quality: 220,
      sharpness: 12,
    }),
  }));
  const baseline = await curate(candidates, { diagnostics: true });
  const baselineBoard = baseline.diagnostics.strongestCompiled.candidates;
  const heroEvidence = baselineBoard[0];
  const transferableSourceEvidence = baselineBoard[1];
  const transferCandidate = result("calibration-transfer", {
    source: transferableSourceEvidence.source,
    title: "刘宇宁 newly retrieved calibrated portrait",
    fp: fingerprint("calibration-transfer", {
      ones: spreadBits("calibration-transfer", 96),
      quality: 220,
      sharpness: 12,
    }),
  });

  const calibrated = await curate([...candidates, transferCandidate], {
    diagnostics: true,
    calibrationProfile: {
      calibrationVersion: 1,
      evidenceCount: 1,
      sourceReceiptIds: ["rescue-1"],
      sourceEvidenceCandidateIds: baseline.diagnostics.rawCandidates
        .map(candidate => candidate.candidateId),
      positiveCandidateIds: [heroEvidence.candidateId],
      negativeCandidateIds: [],
      heroCandidateIds: [heroEvidence.candidateId],
      positiveQueries: [],
      negativeQueries: [],
      positiveSources: [transferableSourceEvidence.source],
      negativeSources: [],
      positiveClusters: [],
      negativeClusters: [],
      positiveAntiAnchors: [],
      negativeAntiAnchors: [],
    },
  });
  const board = calibrated.diagnostics.strongestCompiled.candidates;
  assert.equal(
    board[4].candidateId,
    heroEvidence.candidateId,
    JSON.stringify(board.map(candidate => ({
      candidateId: candidate.candidateId,
      calibration: candidate.calibration,
    }))),
  );
  assert.equal(board[4].calibration.hero, true);
  assert.equal(board[4].calibration.exactSavedCandidate, true);
  assert.ok(board.some(candidate =>
    candidate.calibration.exactSavedCandidate === false
    && candidate.calibration.positive.some(signal => signal.startsWith("source:"))));
  assert.ok(calibrated.diagnostics.calibrationSignals.scoreDelta > 0);
  assert.ok(calibrated.diagnostics.calibrationSignals.beyondExactSavedNineCount > 0);
  assert.deepEqual(
    calibrated.diagnostics.calibrationSignals.preferredSources,
    [transferableSourceEvidence.source],
  );
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
  description = "",
  fp = fingerprint(id, { ones: spreadBits(id) }),
} = {}) {
  return {
    title,
    description,
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

test("runner-ups cannot disguise a repeated board as a new editorial choice", async () => {
  const candidates = Array.from({ length: 12 }, (_, index) => result(`same-thesis-${index}`, {
    source: `publisher-${index}.test`,
    title: `刘学义 varied editorial portrait ${index}`,
    fp: fingerprint(`same-thesis-${index}`, { ones: spreadBits(`same-thesis-${index}`, 104) }),
  }));

  const curated = await curateBatches([
    { query: "刘学义 西装 写真", results: candidates },
  ], { diagnostics: true });

  assert.equal(curated.diagnostics.compiledAlternatives.length, 0);
  assert.equal(curated.diagnostics.runnerUpDiagnostics.compiled.available, false);
  assert.equal(
    curated.diagnostics.runnerUpDiagnostics.compiled.minimumCardDifference,
    MIN_RUNNER_UP_CARD_DIFFERENCE,
  );
  assert.match(curated.diagnostics.runnerUpDiagnostics.compiled.summary, /no meaningful compiled runner-up/i);
});

test("every published runner-up changes enough cards and states its distinct argument", async () => {
  const promise = {
    id: "two-cluster-runner-ups",
    requiredCombinations: [],
    supportingAnchors: [],
    hardAntiAnchors: [],
    softContradictions: [],
    hero: { any: [] },
    clusterIds: ["moonlight", "armor"],
    aestheticClusters: [
      { id: "moonlight", work: "moonlight", look: ["silver robe"], vibeCompatibility: {} },
      { id: "armor", work: "armor", look: ["black armor"], vibeCompatibility: {} },
    ],
  };
  const moonlight = Array.from({ length: 9 }, (_, index) => result(`runner-moon-${index}`, {
    title: `刘学义 silver robe moonlight portrait ${index}`,
    fp: fingerprint(`runner-moon-${index}`, { ones: spreadBits(`runner-moon-${index}`, 104) }),
  }));
  const armor = Array.from({ length: 9 }, (_, index) => result(`runner-armor-${index}`, {
    title: `刘学义 black armor portrait ${index}`,
    fp: fingerprint(`runner-armor-${index}`, { ones: spreadBits(`runner-armor-${index}`, 104) }),
  }));

  const curated = await curateBatches([
    { query: "刘学义 silver robe", results: moonlight },
    { query: "刘学义 black armor", results: armor },
  ], { diagnostics: true, promise });

  const primaryIds = new Set(
    curated.diagnostics.strongestCompiled.candidates.map(candidate => candidate.candidateId),
  );
  assert.ok(curated.diagnostics.compiledAlternatives.length > 0);
  for (const runnerUp of curated.diagnostics.compiledAlternatives) {
    const changed = runnerUp.candidates.filter(candidate => !primaryIds.has(candidate.candidateId));
    assert.ok(changed.length >= MIN_RUNNER_UP_CARD_DIFFERENCE);
    assert.equal(runnerUp.editorialArgument.changedCardCount, changed.length);
    assert.match(runnerUp.editorialArgument.thesis, /\S/);
    assert.match(runnerUp.editorialArgument.explanation, /cards change/i);
  }
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

test("diagnostics retain a compact identity ledger beyond the 36-card display cap", async () => {
  const candidates = Array.from({ length: 50 }, (_, index) => result(`ledger-${index}`, {
    source: `publisher-${index % 5}.test`,
    title: index === 49
      ? "刘宇宁 unrelated business suit evidence"
      : `刘宇宁 evidence ledger portrait ${index}`,
    description: `Sanitized evidence description ${index}`,
    fp: fingerprint(`ledger-${index}`, {
      ones: spreadBits(`ledger-${index}`, 96),
      quality: 220,
      sharpness: 12,
    }),
  }));

  const output = await curate(candidates, {
    diagnostics: true,
    candidateLimit: 50,
    promise: {
      id: "complete-source-ledger",
      requiredCombinations: [],
      supportingAnchors: ["portrait"],
      hardAntiAnchors: ["business suit"],
      softContradictions: [],
      hero: { any: ["portrait"] },
      clusterIds: [],
      aestheticClusters: [],
    },
  });

  assert.equal(output.diagnostics.rawCandidates.length, 36);
  assert.equal(output.diagnostics.sourceEvidenceCandidates.length, 50);
  assert.equal(new Set(output.diagnostics.sourceEvidenceCandidates
    .map(candidate => candidate.candidateId)).size, 50);
  const omitted = output.diagnostics.sourceEvidenceCandidates.find(candidate =>
    candidate.title.includes("business suit"));
  assert.equal(omitted.description, "Sanitized evidence description 49");
  assert.deepEqual(omitted.promise.hardAntiMatches, ["business suit"]);
  assert.equal(omitted.dropReason, "hard_anti_anchor");
  assert.match(omitted.dropDetail, /business suit/i);
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

test("a mass same-byte retrieval response does not declare distinct URLs exact duplicates", async () => {
  const retrievalFingerprint = fingerprint("shared-fetch-response", {
    ones: spreadBits(2),
    digest: "shared-fetch-response",
  });
  const collisionGroup = Array.from({ length: 4 }, (_, index) => result(`collision-${index}`, {
    source: `publisher-${index}.test`,
    link: `https://publisher-${index}.test/story/${index}`,
    fp: retrievalFingerprint,
  }));
  const clean = Array.from({ length: 9 }, (_, index) => result(`collision-clean-${index}`, {
    source: `clean-${index}.test`,
    fp: fingerprint(`collision-clean-${index}`, { ones: spreadBits(index + 30) }),
  }));

  const output = await curate([...collisionGroup, ...clean], { diagnostics: true });
  const collisionThumbnails = new Set(collisionGroup.map(item => item.thumbnail));
  const collisionCandidates = output.diagnostics.rawCandidates.filter(item =>
    collisionThumbnails.has(item.thumbnail));

  assert.equal(new Set(collisionCandidates.map(item => item.candidateId)).size, 4);
  assert.equal(collisionCandidates.every(item => item.retrievalDigestCollision === true), true);
  assert.equal(output.diagnostics.dropped.some(item =>
    collisionThumbnails.has(item.thumbnail) && item.dropReason === "exact_duplicate"), false);
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
  assert.match(output.diagnostics.boardDiagnostics.compiled.summary, /visual overlap/i);
  assert.equal(output.diagnostics.dropped.some(item => item.dropReason === "exact_duplicate"), false);
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

test("captured composite shapes fail image safety before promise scoring", async () => {
  const fixtureCases = [
    ["collage", "../../../attached_assets/images_(10)_1787247161232.jpeg"],
    ["split-panel", "../../../attached_assets/images_(2)_1787247161228.jpeg"],
    ["contact-sheet", "../../../attached_assets/images_(9)_1787247161231.jpeg"],
    ["text-heavy-composite", "../../../attached_assets/images_(16)_1787247161233.jpeg"],
  ];
  const promise = {
    id: "captured-composite-gate",
    requiredCombinations: [{ id: "actor", any: ["刘学义"] }],
    supportingAnchors: ["源仲"],
    hardAntiAnchors: [],
    softContradictions: [],
    hero: { any: ["刘学义"] },
    clusterIds: [],
    aestheticClusters: [],
  };
  const clean = Array.from({ length: 8 }, (_, index) => result(`fixture-clean-${index}`, {
    title: `刘学义 源仲 clean single frame ${index}`,
    fp: fingerprint(`fixture-clean-${index}`, {
      ones: spreadBits(`fixture-clean-${index}`, 92),
    }),
  }));

  for (const [shape, file] of fixtureCases) {
    const composite = result(`captured-${shape}`, {
      title: "刘学义 源仲 on-promise evidence",
      fp: null,
    });
    const fixtureBuffers = new Map([
      [composite.thumbnail, await readFile(new URL(file, import.meta.url))],
    ]);
    const output = await curateDisplayResults(
      [{ query: "刘学义 念无双 源仲", results: [composite, ...clean] }],
      {
        diagnostics: true,
        promise,
        loadBuffer: async (_url, item) => fixtureBuffers.get(item.thumbnail) || item,
        fingerprint: async (buffer, item) =>
          Buffer.isBuffer(buffer) ? fingerprintImage(buffer) : item.fp,
      },
    );

    const rejection = output.diagnostics.rawCandidates.find(candidate =>
      candidate.thumbnail === composite.thumbnail);
    assert.equal(output.displayResults.length, 0, shape);
    assert.equal(rejection.dropReason, "composite_image", shape);
    assert.equal(rejection.promise, null, `${shape} must be rejected before promise analysis`);
    assert.equal(output.diagnostics.receipt.compositeRejectedCount, 1, shape);
    assert.equal(output.diagnostics.boardDiagnostics.compiled.reasonCode, "too_few_usable_images", shape);
    assert.equal(
      output.diagnostics.boardDiagnostics.compiled.reasonCodes.includes("promise_not_fulfilled"),
      false,
      shape,
    );
  }
});

test("a captured clean single frame remains eligible for promise scoring", async () => {
  const captured = result("captured-clean-control", {
    title: "刘学义 源仲 clean single frame",
    fp: null,
  });
  const capturedBuffer = await readFile(
    new URL("../../../attached_assets/images_(6)_1787247161230.jpeg", import.meta.url),
  );
  const clean = Array.from({ length: 8 }, (_, index) => result(`control-clean-${index}`, {
    title: `刘学义 源仲 clean single frame ${index}`,
    fp: fingerprint(`control-clean-${index}`, {
      ones: spreadBits(`control-clean-${index}`, 92),
    }),
  }));
  const output = await curateDisplayResults(
    [{ query: "刘学义 念无双 源仲", results: [captured, ...clean] }],
    {
      diagnostics: true,
      promise: {
        id: "captured-clean-control",
        requiredCombinations: [{ id: "actor", any: ["刘学义"] }],
        supportingAnchors: ["源仲"],
        hardAntiAnchors: [],
        softContradictions: [],
        hero: { any: ["刘学义"] },
        clusterIds: [],
        aestheticClusters: [],
      },
      loadBuffer: async (_url, item) =>
        item.thumbnail === captured.thumbnail ? capturedBuffer : item,
      fingerprint: async (buffer, item) =>
        Buffer.isBuffer(buffer) ? fingerprintImage(buffer) : item.fp,
    },
  );

  const accepted = output.diagnostics.rawCandidates.find(candidate =>
    candidate.thumbnail === captured.thumbnail);
  assert.equal(output.displayResults.length, 9);
  assert.equal(accepted.dropReason, null);
  assert.equal(accepted.promise.coreSatisfied, true);
  assert.equal(accepted.promise.composite.visualScore, 0);
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

test("Cold Jade recognizes a restrained Yuan Zhong character study without admitting warm or devastated lookalikes", async () => {
  const actor = {
    id: "liu-xueyi",
    name: "刘学义",
    shortName_en: "Liu Xueyi",
    vibes: [{ label: "仙门冷玉", label_en: "Cold Jade Immortal" }],
  };
  const promise = vibePromiseFor(actor, 0);
  const coldJade = Array.from({ length: 9 }, (_, index) => result(`cold-jade-note-${index}`, {
    source: `cold-jade-note-${index % 3}.test`,
    title: `刘学义 念无双 源仲 白衣 silver controlled aloof celestial character study ${index}`,
    fp: fingerprint(`cold-jade-note-${index}`, { ones: spreadBits(`cold-jade-note-${index}`, 92) }),
  }));
  const falseFriends = Array.from({ length: 9 }, (_, index) => result(`cold-jade-false-${index}`, {
    source: `cold-jade-false-${index}.test`,
    title: `刘学义 源仲 ${index % 2 ? "warm gold smiling playful court portrait" : "bloodied devastated emotional collapse"} ${index}`,
    fp: fingerprint(`cold-jade-false-${index}`, {
      ones: spreadBits(`cold-jade-false-${index}`, 124),
      quality: 280,
    }),
  }));

  const output = await curateBatches([
    { query: "刘学义 念无双 源仲 白衣", results: coldJade },
    { query: "刘学义 源仲 角色 剧照", results: falseFriends },
  ], { diagnostics: true, promise });

  assert.equal(output.displayResults.length, 9);
  assert.equal(output.displayResults.every(item => /controlled aloof celestial/.test(item.title)), true);
  assert.equal(output.diagnostics.strongestCompiled.promise.coreCount, 9);
  assert.equal(output.diagnostics.strongestCompiled.promise.heroFulfillment, 1);
});

test("Court Menace requires institutional threat instead of accepting assorted historical costumes", async () => {
  const actor = {
    id: "liu-xueyi",
    name: "刘学义",
    shortName_en: "Liu Xueyi",
    vibes: [{}, { label: "权臣压迫感", label_en: "Court Menace" }],
  };
  const promise = vibePromiseFor(actor, 1);
  const court = Array.from({ length: 9 }, (_, index) => result(`court-menace-${index}`, {
    source: `court-${index % 4}.test`,
    title: `刘学义 court official styling deep green ornate collar calculating political threat ${index}`,
    fp: fingerprint(`court-menace-${index}`, { ones: spreadBits(`court-menace-${index}`, 90) }),
  }));
  const assortedCostumes = Array.from({ length: 9 }, (_, index) => result(`assorted-costume-${index}`, {
    source: `assorted-${index}.test`,
    title: `刘学义 historical costume ${index % 3 ? "soft white immortal" : "generic black costume"} ${index}`,
    fp: fingerprint(`assorted-costume-${index}`, {
      ones: spreadBits(`assorted-costume-${index}`, 128),
      quality: 280,
    }),
  }));

  const output = await curateBatches([
    { query: "刘学义 权臣 朝堂 剧照", results: court },
    { query: "刘学义 古装 剧照", results: assortedCostumes },
  ], { diagnostics: true, promise });

  assert.equal(output.displayResults.length, 9);
  assert.equal(output.displayResults.every(item => /official styling deep green ornate collar calculating political threat/.test(item.title)), true);
  assert.equal(output.diagnostics.strongestCompiled.promise.coreCount, 9);
  assert.equal(output.diagnostics.strongestCompiled.promise.heroFulfillment, 1);
});

test("Court Menace permits contextual weapons, romantic proximity, and divine styling as supporting evidence", async () => {
  const actor = {
    id: "liu-xueyi",
    name: "刘学义",
    shortName_en: "Liu Xueyi",
    vibes: [{}, { label: "权臣压迫感", label_en: "Court Menace" }],
  };
  const promise = vibePromiseFor(actor, 1);
  const contextualSupports = [
    "sword used while exercising princely authority",
    "intimidating romantic proximity during political command",
    "divine styling with official rank and institutional consequence",
  ];
  const candidates = Array.from({ length: 9 }, (_, index) => result(`court-support-${index}`, {
    source: `court-support-${index % 3}.test`,
    title: `刘学义 court official styling ornate collar calculating political threat ${contextualSupports[index % 3]} ${index}`,
    fp: fingerprint(`court-support-${index}`, { ones: spreadBits(`court-support-${index}`, 94) }),
  }));

  const output = await curateBatches([
    { query: "刘学义 权臣 朝堂 剧照", results: candidates },
  ], { diagnostics: true, promise });

  assert.equal(output.displayResults.length, 9);
  assert.equal(output.diagnostics.strongestCompiled.promise.coreCount, 9);
  assert.equal(output.diagnostics.dropped.some(item => item.dropReason === "hard_anti_anchor"), false);
});

test("a bounded Shen Zaiye political arc can qualify as a Court Menace Event", async () => {
  const actor = {
    id: "liu-xueyi",
    name: "刘学义",
    shortName_en: "Liu Xueyi",
    vibes: [{}, { label: "权臣压迫感", label_en: "Court Menace" }],
  };
  const promise = vibePromiseFor(actor, 1);
  const shenZaiye = Array.from({ length: 9 }, (_, index) => result(`shen-zaiye-court-${index}`, {
    source: `shen-zaiye-publisher-${index}.test`,
    link: `https://shen-zaiye-publisher-${index}.test/桃花映江山/沈在野/${index}`,
    title: `刘学义 桃花映江山 沈在野 court official robes calculating strategic command institutional consequence ${index}`,
    fp: fingerprint(`shen-zaiye-court-${index}`, { ones: spreadBits(`shen-zaiye-court-${index}`, 96) }),
  }));

  const output = await curateBatches([
    { query: "刘学义 沈在野 桃花映江山 权谋", results: shenZaiye },
  ], { diagnostics: true, promise });

  assert.equal(output.diagnostics.strongestEvent.candidates.length, 9);
  assert.equal(output.diagnostics.strongestEvent.promise.coreCount, 9);
  assert.equal(output.diagnostics.strongestEvent.promise.heroFulfillment, 1);
});

test("professionally-devastated-but-make-it-corporate-networking rejects a random technically complete board", async () => {
  const actor = {
    id: "liu-xueyi",
    name: "刘学义",
    shortName_en: "Liu Xueyi",
    vibes: [{}, {}, {}, { queries: ["刘学义 慕容璟和 春花焰 受伤"] }],
  };
  const promise = vibePromiseFor(actor, 3);
  const valid = Array.from({ length: 4 }, (_, index) => result(`shattered-valid-${index}`, {
    source: `wounded-${index}.test`,
    title: `刘学义 慕容璟和 wounded bloodied tearful grief close-up frame ${index}`,
    fp: fingerprint(`shattered-valid-${index}`, { ones: spreadBits(`shattered-valid-${index}`, 92) }),
  }));
  const contaminated = [
    result("shattered-women", {
      title: "women-centered thumbnail with Liu Xueyi article reference",
      fp: fingerprint("shattered-women", { ones: spreadBits("shattered-women", 110) }),
    }),
    result("shattered-business", {
      title: "刘学义 modern businessman business suit glasses office portrait",
      fp: fingerprint("shattered-business", { ones: spreadBits("shattered-business", 110) }),
    }),
    result("shattered-unrelated", {
      title: "成毅 unrelated actor clean costume frame",
      fp: fingerprint("shattered-unrelated", { ones: spreadBits("shattered-unrelated", 110) }),
    }),
    result("shattered-collage", {
      title: "刘学义 shattered beauty collage contact sheet",
      fp: fingerprint("shattered-collage", {
        ones: spreadBits("shattered-collage", 128),
        compositeScore: 0.91,
        singleFrameRatio: 0.09,
      }),
    }),
    result("shattered-neutral", {
      title: "刘学义 clean neutral costume portrait with no damage signal",
      fp: fingerprint("shattered-neutral", { ones: spreadBits("shattered-neutral", 110) }),
    }),
  ];

  const output = await curateBatches([
    { query: "刘学义 慕容璟和 春花焰 受伤", results: [...contaminated, ...valid] },
  ], { diagnostics: true, promise });

  assert.equal(promise.id, "liu-xueyi-professionally-devastated");
  assert.equal(output.displayResults.length, 0);
  assert.equal(output.diagnostics.boardDiagnostics.compiled.reasonCode, "too_few_usable_images");
  assert.equal(output.diagnostics.dropped.filter(item =>
    ["hard_anti_anchor", "composite_image"].includes(item.dropReason)).length, 5);
  assert.equal(output.diagnostics.dropped.some(item =>
    item.dropReason === "hard_anti_anchor" && /business|office|suit/i.test(item.dropDetail)), true);
  assert.equal(output.diagnostics.dropped.some(item =>
    item.dropReason === "hard_anti_anchor" && /women|woman/i.test(item.dropDetail)), true);
  assert.equal(output.diagnostics.dropped.some(item =>
    item.dropReason === "hard_anti_anchor" && /neutral|clean/i.test(item.dropDetail)), true);
});

test("generic distress cannot fulfill Professionally Devastated without a named character state", async () => {
  const actor = {
    id: "liu-xueyi",
    name: "刘学义",
    shortName_en: "Liu Xueyi",
    vibes: [{}, {}, {}, { queries: ["刘学义 emotional costume portrait"] }],
  };
  const promise = vibePromiseFor(actor, 3);
  const genericDistress = Array.from({ length: 9 }, (_, index) => result(`generic-distress-${index}`, {
    title: `刘学义 wounded tearful grief costume portrait ${index}`,
    fp: fingerprint(`generic-distress-${index}`, { ones: spreadBits(`generic-distress-${index}`, 92) }),
  }));
  const output = await curateBatches([
    { query: "刘学义 emotional costume portrait", results: genericDistress },
  ], { diagnostics: true, promise });

  assert.equal(output.displayResults.length, 0);
  assert.equal(output.diagnostics.strongestCompiled, null);
  assert.equal(output.diagnostics.boardDiagnostics.compiled.reasonCode, "promise_not_fulfilled");
  assert.match(output.diagnostics.boardDiagnostics.compiled.summary, /only 0 of 9 cards/i);
});

test("a named heartbreak cluster still needs an emotionally legible hero", async () => {
  const actor = {
    id: "liu-xueyi",
    name: "刘学义",
    shortName_en: "Liu Xueyi",
    vibes: [{}, {}, {}, { queries: ["刘学义 慕容璟和 春花焰 悲痛"] }],
  };
  const promise = vibePromiseFor(actor, 3);
  const mutedGrief = Array.from({ length: 9 }, (_, index) => result(`muted-grief-${index}`, {
    title: `刘学义 慕容璟和 grief romantic devastation dark robes frame ${index}`,
    fp: fingerprint(`muted-grief-${index}`, { ones: spreadBits(`muted-grief-${index}`, 92) }),
  }));
  const output = await curateBatches([
    { query: "刘学义 慕容璟和 春花焰 悲痛", results: mutedGrief },
  ], { diagnostics: true, promise });

  assert.equal(output.displayResults.length, 0);
  assert.equal(output.proposalResults.length, 9);
  assert.ok(["event", "compiled"].includes(output.proposalCuration.mode));
  assert.equal(output.proposalCuration.publicationEligible, false);
  assert.equal(output.proposalCuration.publicationBlockReason, "hero_not_fulfilled");
  assert.equal(output.diagnostics.boardDiagnostics.compiled.reasonCode, "hero_not_fulfilled");
  assert.equal(output.diagnostics.boardDiagnostics.compiled.coreAnchorCount, 9);
  assert.equal(output.diagnostics.boardDiagnostics.compiled.completeProposalAvailable, true);
  assert.equal(output.diagnostics.boardDiagnostics.compiled.proposal.candidates.length, 9);
  assert.match(output.diagnostics.boardDiagnostics.compiled.summary, /proposed hero was not recognized/i);
  assert.match(output.diagnostics.runnerUpDiagnostics.compiled.summary, /publication gate/i);
});

test("Jinxiu qualifies by emotional state instead of one permanent Vibe", async () => {
  const actor = {
    id: "liu-xueyi",
    name: "刘学义",
    shortName_en: "Liu Xueyi",
    vibes: [{ queries: ["刘学义 锦绣 白衣"] }, {}, {}, { queries: ["刘学义 锦绣 红凝 受伤"] }],
  };
  const coldJade = vibePromiseFor(actor, 0);
  const professionallyDevastated = vibePromiseFor(actor, 3);
  const devastatedJinxiu = Array.from({ length: 9 }, (_, index) => result(`devastated-jinxiu-${index}`, {
    title: `刘学义 锦绣 carrying Hongning romantic devastation tearful pale robes frame ${index}`,
    fp: fingerprint(`devastated-jinxiu-${index}`, { ones: spreadBits(`devastated-jinxiu-${index}`, 92) }),
  }));
  const aloofJinxiu = Array.from({ length: 9 }, (_, index) => result(`aloof-jinxiu-${index}`, {
    title: `刘学义 锦绣 controlled aloof flower deity pale robes celestial frame ${index}`,
    fp: fingerprint(`aloof-jinxiu-${index}`, { ones: spreadBits(`aloof-jinxiu-${index}`, 92) }),
  }));

  const devastatedAsHeartbreak = await curateBatches([
    { query: "刘学义 锦绣 红凝 受伤", results: devastatedJinxiu },
  ], { diagnostics: true, promise: professionallyDevastated });
  const devastatedAsColdJade = await curateBatches([
    { query: "刘学义 锦绣 白衣", results: devastatedJinxiu },
  ], { diagnostics: true, promise: coldJade });
  const aloofAsColdJade = await curateBatches([
    { query: "刘学义 锦绣 白衣", results: aloofJinxiu },
  ], { diagnostics: true, promise: coldJade });
  const aloofAsHeartbreak = await curateBatches([
    { query: "刘学义 锦绣 红凝 受伤", results: aloofJinxiu },
  ], { diagnostics: true, promise: professionallyDevastated });

  assert.equal(devastatedAsHeartbreak.displayResults.length, 9);
  assert.equal(devastatedAsColdJade.displayResults.length, 0);
  assert.equal(aloofAsColdJade.displayResults.length, 9);
  assert.equal(aloofAsHeartbreak.displayResults.length, 0);
});

test("Professionally Devastated recognizes fresh role-grounded tragedy without repeating the actor name", async () => {
  const actor = {
    id: "liu-xueyi",
    name: "刘学义",
    shortName_en: "Liu Xueyi",
    vibes: [{}, {}, {}, { queries: ["刘学义 慕容璟和 春花焰 受伤"] }],
  };
  const promise = vibePromiseFor(actor, 3);
  const freshScenes = [
    "慕容璟和 bloodied collapse wedding aftermath frame",
    "慕容璟和 injured carrying 眉林 frame",
    "慕容璟和 heartbroken shattered romantic devastation frame",
    "沈在野 exhausted desperate protection frame",
    "沈在野 bloodied carrying 姜桃花 frame",
    "沈在野 exhausted grief aftermath frame",
    "锦绣 carrying 红凝 across lifetimes frame",
    "锦绣 devastated romantic aftermath frame",
    "锦绣 tearful sacrifice frame",
  ].map((title, index) => result(`fresh-devastation-${index}`, {
    source: `fresh-scene-${index}.test`,
    title,
    fp: fingerprint(`fresh-devastation-${index}`, { ones: spreadBits(`fresh-devastation-${index}`, 92) }),
  }));

  const output = await curateBatches([{
    query: "刘学义 角色 受伤",
    results: freshScenes,
  }], { diagnostics: true, promise });

  assert.equal(output.displayResults.length, 9);
  assert.equal(output.diagnostics.strongestCompiled.promise.coreCount, 9);
  assert.equal(output.diagnostics.strongestCompiled.promise.heroFulfillment, 1);
  assert.ok(output.diagnostics.rawCandidates.every(candidate =>
    candidate.promise.narrativeSatisfied === true));
  assert.ok(output.displayResults.every(item =>
    !item.title.includes("刘学义") && /慕容璟和|沈在野|锦绣/.test(item.title)));
});

test("confirmed calibration admits identity-confirmed handsome costume supports behind a devastated hero", async () => {
  const actor = {
    id: "liu-xueyi",
    name: "刘学义",
    shortName_en: "Liu Xueyi",
    vibes: [{}, {}, {}, { queries: ["刘学义 慕容璟和 受伤"] }],
  };
  const promise = vibePromiseFor(actor, 3);
  const hero = result("calibrated-devastated-hero", {
    source: "operator-approved-editorial.test",
    title: "刘学义 慕容璟和 bloodied devastated carrying her wedding aftermath frame",
    fp: fingerprint("calibrated-devastated-hero", { ones: spreadBits("calibrated-devastated-hero", 92) }),
  });
  const supports = Array.from({ length: 8 }, (_, index) => result(`calibrated-costume-${index}`, {
    source: "operator-approved-editorial.test",
    title: `刘学义 handsome historical costume courtyard location frame ${index + 1}`,
    fp: fingerprint(`calibrated-costume-${index}`, { ones: spreadBits(`calibrated-costume-${index}`, 92) }),
  }));

  const output = await curateBatches([{
    query: "刘学义 handsome costume location",
    results: [hero, ...supports],
  }], {
    diagnostics: true,
    promise,
    calibrationProfile: {
      calibrationVersion: 1,
      evidenceCount: 1,
      sourceReceiptIds: ["rescue-costume-support"],
      sourceEvidenceCandidateIds: ["saved-hero", "saved-support"],
      positiveCandidateIds: ["saved-hero"],
      negativeCandidateIds: [],
      heroCandidateIds: ["saved-hero"],
      positiveQueries: ["刘学义 handsome costume location"],
      negativeQueries: [],
      positiveSources: ["operator-approved-editorial.test"],
      negativeSources: [],
      positiveClusters: [],
      negativeClusters: [],
      positiveAntiAnchors: [],
      negativeAntiAnchors: [],
      positiveCompositions: ["handsome"],
      negativeCompositions: [],
      rankingContrasts: [],
      rankingWins: {},
      rankingLosses: {},
      preferredPositions: {},
    },
  });

  assert.equal(output.displayResults.length, 9);
  assert.equal(output.diagnostics.strongestCompiled.promise.heroFulfillment, 1);
  assert.equal(output.diagnostics.strongestCompiled.promise.supportingCount, 8);
  assert.equal(output.diagnostics.strongestCompiled.promise.admittedCount, 9);
  assert.equal(output.displayResults[4].title.includes("bloodied"), true);
  assert.ok(output.diagnostics.rawCandidates
    .filter(candidate => candidate.title.includes("handsome"))
    .every(candidate => candidate.calibration.supportingAdmission === true));
  assert.ok(output.diagnostics.rawCandidates
    .filter(candidate => candidate.title.includes("handsome"))
    .every(candidate =>
      candidate.calibration.supportingAdmissionEvidence?.signals
        .some(signal => signal.startsWith("source:"))));
});

test("Professionally Devastated does not mistake query state, costume color, or generic beauty for tragedy", async () => {
  const actor = {
    id: "liu-xueyi",
    name: "刘学义",
    shortName_en: "Liu Xueyi",
    vibes: [{}, {}, {}, { queries: ["刘学义 慕容璟和 受伤"] }],
  };
  const promise = vibePromiseFor(actor, 3);
  const genericBeauty = Array.from({ length: 9 }, (_, index) => result(`generic-beauty-${index}`, {
    source: `generic-beauty-${index}.test`,
    title: `${index % 2 ? "慕容璟和 red black" : "沈在野 pale gold white"} beautiful handsome costume portrait frame ${index}`,
    fp: fingerprint(`generic-beauty-${index}`, { ones: spreadBits(`generic-beauty-${index}`, 92) }),
  }));

  const output = await curateBatches([{
    query: "刘学义 慕容璟和 受伤",
    results: genericBeauty,
  }], { diagnostics: true, promise });

  assert.equal(output.displayResults.length, 0);
  assert.equal(output.diagnostics.strongestCompiled, null);
  assert.equal(output.diagnostics.boardDiagnostics.compiled.reasonCode, "promise_not_fulfilled");
  assert.equal(output.diagnostics.boardDiagnostics.compiled.coreAnchorCount, 0);
  assert.ok(output.diagnostics.rawCandidates.every(candidate =>
    candidate.promise.narrativeSatisfied === false));
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

test("a coherent five-card state cluster becomes targeted searches, never a padded board", async () => {
  const partialCluster = Array.from({ length: 5 }, (_, index) => result(`partial-cluster-${index}`, {
    title: `刘学义 慕容璟和 grief editorial frame ${index}`,
  }));
  const filler = Array.from({ length: 4 }, (_, index) => result(`partial-filler-${index}`, {
    title: `刘学义 unrelated formal editorial frame ${index}`,
  }));
  const output = await curateBatches([{
    query: "刘学义 character stills",
    results: [...partialCluster, ...filler],
  }], {
    diagnostics: true,
    promise: {
      id: "partial-romantic-ruin",
      actorTerms: ["刘学义"],
      requiredCombinations: [
        { id: "character", any: ["慕容璟和"] },
        { id: "emotion", any: ["grief"] },
      ],
      supportingAnchors: [],
      hardAntiAnchors: [],
      softContradictions: [],
      hero: { any: ["grief"], requireExplicit: true },
      clusterIds: ["murong-romantic-ruin"],
      aestheticClusters: [{
        id: "murong-romantic-ruin",
        work: "春花焰",
        character: "慕容璟和",
        emotionalStates: ["grief"],
        relationshipAnchors: ["眉林", "Mei Lin"],
        sceneAnchors: ["wedding aftermath"],
      }],
    },
  });

  assert.equal(output.displayResults.length, 0);
  assert.equal(output.curation, null);
  assert.equal(output.diagnostics.boardDiagnostics.compiled.reasonCode, "promise_not_fulfilled");
  assert.equal(output.diagnostics.partialClusters.length, 1);
  assert.equal(output.diagnostics.partialClusters[0].cardCount, 5);
  assert.match(output.diagnostics.partialClusters[0].summary, /5 clean frames/i);
  assert.deepEqual(
    output.diagnostics.partialClusters[0].missingEvidence.map(item => item.kind),
    ["character", "relationship", "scene", "emotional_state"],
  );
  assert.equal(
    output.diagnostics.partialClusters[0].missingEvidence
      .find(item => item.kind === "relationship").neededCardCount,
    9,
  );
  assert.ok(output.diagnostics.partialClusters[0].suggestedSearches.some(item =>
    item.kind === "relationship"
    && item.query.includes("慕容璟和")
    && item.query.includes("眉林")));
  assert.ok(output.diagnostics.partialClusters[0].suggestedSearches.some(item =>
    item.kind === "scene"
    && item.query.includes("wedding aftermath")));
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
