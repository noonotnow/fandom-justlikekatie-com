import {
  fetchImageBuffer,
  fingerprintImage,
  perceptualDistance,
} from "./image-dedup.js";

/**
 * Server-side editorial curation for the Vibe Atlas Daily Drop.
 *
 * The search pipeline deliberately keeps similar images alive until this module
 * can decide whether they are repetition (Compiled) or rhythm (Event). This is
 * intentionally heuristic: metadata and perceptual fingerprints can provide
 * evidence, but cannot prove actor identity, pose progression, or emotion.
 */
export const CURATION_VERSION = 1;
export const DEFAULT_CURATION_LIMIT = 9;
export const DEFAULT_CANDIDATE_LIMIT = 36;
export const DEFAULT_ANALYSIS_CONCURRENCY = 4;

const MIN_DIMENSION = 128;
const MIN_AREA = 24_000;
const MIN_ASPECT_RATIO = 0.4;
const MAX_ASPECT_RATIO = 2.5;
const MIN_SHARPNESS = 2;
const COMPILED_SIMILARITY_DISTANCE = 0.18;
const EVENT_COPY_DISTANCE = 0.085;
const EVENT_PAIR_DISTANCE = 0.24;
const SEARCH_PROVIDER_HOST = /(^|\.)(bing|google|baidu|yahoo|duckduckgo|brave|serpapi)\./i;
const GENERIC_SOURCE = /^(unknown|source|image|images|bing(?: images)?|google(?: images)?|baidu(?: images)?|search result)$/i;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, " ")
    .trim();
}

function titleTokens(value) {
  const normalized = normalizeText(value);
  if (!normalized) return new Set();

  const tokens = new Set(normalized.split(/\s+/).filter(Boolean));
  // Chinese entertainment titles often have no spaces. Bigrams retain Han
  // evidence without pretending a whole title is one incomparable token.
  const han = normalized.replace(/[^\u4e00-\u9fff]/g, "");
  for (let index = 0; index < han.length - 1; index += 1) {
    tokens.add(han.slice(index, index + 2));
  }
  return tokens;
}

function jaccard(left, right) {
  if (!left.size && !right.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union ? intersection / union : 0;
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function canonicalLinkKey(result) {
  const url = safeUrl(result.canonicalLink || result.link);
  if (!url || !url.hostname) return "";
  if (SEARCH_PROVIDER_HOST.test(url.hostname)) return "";
  const pathname = url.pathname.replace(/\/+$/, "");
  if (!pathname || pathname === "/") return "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid|ref|referrer|source)$/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  const query = url.searchParams.toString();
  return `${url.hostname.toLowerCase()}${pathname}${query ? `?${query}` : ""}`;
}

function sourceKey(result) {
  const source = normalizeText(result.source);
  if (!source || GENERIC_SOURCE.test(source) || SEARCH_PROVIDER_HOST.test(source)) return "";
  return source;
}

function batchKey(result) {
  return normalizeText(result.batchKey || "");
}

function hasGenericTitle(result) {
  const title = normalizeText(result.title);
  const batch = normalizeText(result.batchKey);
  return !title || title === batch || title.length < 6;
}

function distinctiveTitleTokens(result) {
  const title = titleTokens(result.title);
  const query = titleTokens(result.batchKey);
  for (const token of query) title.delete(token);
  return title;
}

function familyEvidence(left, right) {
  const leftResult = left.result || left;
  const rightResult = right.result || right;
  const leftLink = canonicalLinkKey(leftResult);
  const rightLink = canonicalLinkKey(rightResult);
  if (leftLink && leftLink === rightLink) {
    return { related: true, strength: 1, kind: "shared article" };
  }

  const sameSource = sourceKey(leftResult) && sourceKey(leftResult) === sourceKey(rightResult);
  const titleSimilarity = hasGenericTitle(leftResult) || hasGenericTitle(rightResult)
    ? 0
    : jaccard(distinctiveTitleTokens(leftResult), distinctiveTitleTokens(rightResult));
  const sameBatch = batchKey(leftResult) && batchKey(leftResult) === batchKey(rightResult);
  const visualDistance = left.fingerprint && right.fingerprint
    ? perceptualDistance(left.fingerprint, right.fingerprint)
    : 1;

  // Publisher/source alone is not an event. A same-source pair needs corroboration
  // from titles or an actually similar frame and shared query provenance.
  if (sameSource && sameBatch && titleSimilarity >= 0.34) {
    return { related: true, strength: 0.84, kind: "shared source, query, and title" };
  }
  if (sameSource && sameBatch && visualDistance <= EVENT_PAIR_DISTANCE && titleSimilarity >= 0.16) {
    return { related: true, strength: 0.72, kind: "shared source, query, and visual family" };
  }
  if (sameBatch && visualDistance <= EVENT_PAIR_DISTANCE && titleSimilarity >= 0.24) {
    return { related: true, strength: 0.58, kind: "shared query and visual family" };
  }

  return { related: false, strength: 0, kind: "" };
}

function usableFingerprint(fingerprint) {
  if (!fingerprint) return false;
  const { width, height } = fingerprint;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (width < MIN_DIMENSION || height < MIN_DIMENSION) return false;
  if (width * height < MIN_AREA) return false;
  const aspect = width / height;
  return (
    aspect >= MIN_ASPECT_RATIO
    && aspect <= MAX_ASPECT_RATIO
    && Number.isFinite(fingerprint.sharpness)
    && fingerprint.sharpness >= MIN_SHARPNESS
  );
}

function qualityScore(fingerprint) {
  if (!fingerprint) return 0;
  // The fingerprint quality is a deliberately broad proxy, not a confidence
  // percentage. It only helps choose a better copy of an otherwise similar image.
  return clamp((fingerprint.quality - 120) / 100);
}

function average(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const output = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(items.length, Math.max(1, concurrency));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await worker(items[index], index);
    }
  }));
  return output;
}

function boardVisualVariation(board) {
  const distances = [];
  for (let left = 0; left < board.length; left += 1) {
    for (let right = left + 1; right < board.length; right += 1) {
      distances.push(perceptualDistance(board[left].fingerprint, board[right].fingerprint));
    }
  }
  return clamp(average(distances) / 0.45);
}

function boardQuality(board) {
  return average(board.map(candidate => qualityScore(candidate.fingerprint)));
}

function uniqueCount(board, key) {
  return new Set(board.map(candidate => key(candidate)).filter(Boolean)).size;
}

function weightedBreakdown(parts) {
  const breakdown = {};
  let total = 0;
  for (const [key, value, weight] of parts) {
    const contribution = value * weight;
    total += contribution;
    breakdown[key] = {
      value: Number(value.toFixed(4)),
      weight,
      contribution: Number(contribution.toFixed(4)),
    };
  }
  return { total, breakdown };
}

function eventScoreParts(board, familyStrength) {
  const variation = boardVisualVariation(board);
  const quality = boardQuality(board);
  return weightedBreakdown([
    ["quality", quality, 0.15],
    ["completeness", board.length / DEFAULT_CURATION_LIMIT, 0.15],
    ["familyStrength", familyStrength, 0.55],
    ["visualVariation", variation, 0.15],
  ]);
}

function eventScore(board, familyStrength) {
  return eventScoreParts(board, familyStrength).total;
}

function compiledScoreParts(board) {
  const quality = boardQuality(board);
  const sources = clamp(uniqueCount(board, candidate => sourceKey(candidate.result)) / 5);
  const batches = clamp(uniqueCount(board, candidate => batchKey(candidate.result)) / 3);
  const families = clamp(uniqueCount(board, candidate => candidate.familyId) / 4);
  const variation = boardVisualVariation(board);
  return weightedBreakdown([
    ["quality", quality, 0.2],
    ["completeness", board.length / DEFAULT_CURATION_LIMIT, 0.15],
    ["sourceRange", sources, 0.2],
    ["queryRange", batches, 0.15],
    ["familyRange", families, 0.15],
    ["visualVariation", variation, 0.15],
  ]);
}

function compiledScore(board) {
  return compiledScoreParts(board).total;
}

function stableSerialize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (ArrayBuffer.isView(value)) return `[${[...value].join(",")}]`;
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

function stableResultKey(result) {
  return [
    batchKey(result),
    sourceKey(result),
    canonicalLinkKey(result),
    String(result.link || ""),
    normalizeText(result.title),
    result.thumbnail || "",
    stableSerialize(result),
  ].join("\u0000");
}

function candidateOrder(left, right) {
  return stableResultKey(left.result).localeCompare(stableResultKey(right.result))
    || right.fingerprint.quality - left.fingerprint.quality
    || left.order - right.order;
}

function rawCandidateOrder(left, right) {
  return left.batchRank - right.batchRank
    || stableResultKey(left.result).localeCompare(stableResultKey(right.result))
    || left.order - right.order;
}

function replaceExactCopies(candidates) {
  const selected = [];
  const seenUrls = new Map();
  const seenDigests = new Map();

  for (const candidate of candidates) {
    const url = candidate.result.thumbnail || "";
    const digest = candidate.fingerprint.digest;
    const duplicateIndex = seenUrls.get(url) ?? seenDigests.get(digest);
    if (duplicateIndex === undefined) {
      seenUrls.set(url, selected.length);
      seenDigests.set(digest, selected.length);
      selected.push(candidate);
      continue;
    }

    const existing = selected[duplicateIndex];
    if (candidate.fingerprint.quality > existing.fingerprint.quality) {
      seenUrls.delete(existing.result.thumbnail);
      seenDigests.delete(existing.fingerprint.digest);
      selected[duplicateIndex] = candidate;
      seenUrls.set(candidate.result.thumbnail, duplicateIndex);
      seenDigests.set(candidate.fingerprint.digest, duplicateIndex);
    }
  }
  return selected;
}

function collapseCopies(board, distanceThreshold) {
  const selected = [];
  for (const candidate of board) {
    const duplicateIndex = selected.findIndex(existing =>
      perceptualDistance(existing.fingerprint, candidate.fingerprint) <= distanceThreshold);
    if (duplicateIndex < 0) {
      selected.push(candidate);
      continue;
    }
    if (candidate.fingerprint.quality > selected[duplicateIndex].fingerprint.quality) {
      selected[duplicateIndex] = candidate;
    }
  }
  return selected.sort(candidateOrder);
}

function buildFamilies(candidates) {
  const signatures = new Set();
  const families = [];
  for (const anchor of candidates) {
    const group = [anchor];
    const strengths = [];
    for (const candidate of candidates) {
      if (candidate === anchor) continue;
      const evidence = familyEvidence(anchor, candidate);
      if (evidence.related) {
        group.push(candidate);
        strengths.push(evidence.strength);
      }
    }
    if (!strengths.length) continue;
    const ordered = group.sort(candidateOrder);
    const signature = ordered.map(candidate => candidate.result.thumbnail).join("\u0000");
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    families.push({
      familyStrength: average(strengths),
      candidates: ordered,
    });
  }
  return families;
}

function familyLabeledCandidates(candidates, families) {
  const familyByThumbnail = new Map();
  [...families]
    .sort((left, right) =>
      right.familyStrength - left.familyStrength
      || right.candidates.length - left.candidates.length)
    .forEach((family, index) => {
      for (const candidate of family.candidates) {
        if (!familyByThumbnail.has(candidate.result.thumbnail)) {
          familyByThumbnail.set(candidate.result.thumbnail, `event-family-${index + 1}`);
        }
      }
    });
  return candidates.map(candidate => ({
    ...candidate,
    familyId: familyByThumbnail.get(candidate.result.thumbnail) || "",
  }));
}

function boardKey(board) {
  return [...board]
    .sort(candidateOrder)
    .map(candidate => stableResultKey(candidate.result))
    .join("\u0001");
}

function greedyBoard(candidates, limit, score, incompatible) {
  const alternatives = [];
  for (const seed of candidates) {
    const board = [seed];
    while (board.length < limit) {
      const choices = candidates
        .filter(candidate =>
          !board.includes(candidate)
          && !board.some(existing => incompatible(existing, candidate)))
        .map(candidate => ({
          candidate,
          score: score([...board, candidate]),
        }))
        .sort((left, right) =>
          right.score - left.score
          || candidateOrder(left.candidate, right.candidate));
      if (!choices.length) break;
      board.push(choices[0].candidate);
    }
    if (board.length === limit) {
      const ordered = board.sort(candidateOrder);
      alternatives.push({ board: ordered, score: score(ordered) });
    }
  }
  return alternatives.sort((left, right) =>
    right.score - left.score
    || boardKey(left.board).localeCompare(boardKey(right.board)))[0] || null;
}

function selectEventBoard(families, limit) {
  const alternatives = families.flatMap(family => {
    const candidates = collapseCopies(
      [...family.candidates].sort(candidateOrder),
      EVENT_COPY_DISTANCE,
    );
    if (candidates.length < limit) return [];
    const selected = greedyBoard(
      candidates,
      limit,
      board => eventScore(board, family.familyStrength),
      () => false,
    );
    return selected
      ? [{ ...selected, familyStrength: family.familyStrength }]
      : [];
  });
  return alternatives.sort((left, right) =>
    right.score - left.score
    || boardKey(left.board).localeCompare(boardKey(right.board)))[0] || null;
}

function selectCompiledBoard(candidates, limit) {
  return greedyBoard(
    candidates,
    limit,
    compiledScore,
    (left, right) =>
      perceptualDistance(left.fingerprint, right.fingerprint) <= COMPILED_SIMILARITY_DISTANCE,
  );
}

function rationaleFor(mode, eventCandidate, compiledCandidate) {
  if (mode === "event") {
    const signals = ["shared editorial family", "meaningful frame variation"];
    if (eventCandidate.familyStrength >= 0.9) signals.unshift("shared article or editorial source");
    return {
      mode,
      version: CURATION_VERSION,
      rationale: "One coherent editorial produced the strongest board.",
      signals,
      comparedAgainst: "compiled",
    };
  }

  const signals = ["Vibe Pack cohesion", "varied visual evidence"];
  if (compiledCandidate && uniqueCount(compiledCandidate.board, candidate => sourceKey(candidate.result)) >= 3) {
    signals.push("source range");
  }
  return {
    mode,
    version: CURATION_VERSION,
    rationale: "A varied set produced the strongest visual argument.",
    signals,
    comparedAgainst: eventCandidate ? "event" : null,
  };
}

/**
 * Curate the visible Daily Drop board. `fingerprint` is injectable so the
 * editorial decision can be tested without network images.
 */
export async function curateDisplayResults(
  rankedBatches,
  {
    limit = DEFAULT_CURATION_LIMIT,
    candidateLimit = DEFAULT_CANDIDATE_LIMIT,
    loadBuffer = fetchImageBuffer,
    fingerprint = fingerprintImage,
    diagnostics = false,
    analysisConcurrency = DEFAULT_ANALYSIS_CONCURRENCY,
  } = {},
) {
  const rawCandidates = [];
  for (const [batchRank, batch] of (rankedBatches || []).entries()) {
    for (const result of batch.results || []) {
      if (!result.thumbnail) continue;
      rawCandidates.push({
        result: { ...result, batchKey: result.batchKey || batch.query },
        batchRank,
        order: rawCandidates.length,
      });
    }
  }
  rawCandidates.sort(rawCandidateOrder);
  rawCandidates.length = Math.min(rawCandidates.length, candidateLimit);

  const analyzedStates = await mapWithConcurrency(rawCandidates, analysisConcurrency, async candidate => {
    try {
      const buffer = await loadBuffer(candidate.result.thumbnail, candidate.result);
      const imageFingerprint = await fingerprint(buffer, candidate.result);
      if (!usableFingerprint(imageFingerprint)) return { candidate, dropReason: "unusable_image" };
      return { candidate: { ...candidate, fingerprint: imageFingerprint }, dropReason: null };
    } catch (error) {
      return {
        candidate,
        dropReason: "image_load_failed",
        dropDetail: String(error?.message || "unknown image analysis failure").slice(0, 160),
      };
    }
  });
  const analyzed = analyzedStates.filter(state => state.candidate.fingerprint).map(state => state.candidate);

  const candidates = replaceExactCopies(analyzed).sort(candidateOrder);
  const families = buildFamilies(candidates);
  const withFamilies = familyLabeledCandidates(candidates, families);
  const eventCandidate = selectEventBoard(families, limit);
  const compiledCandidate = selectCompiledBoard(withFamilies, limit);

  if (!eventCandidate && !compiledCandidate) {
    return diagnostics
      ? { displayResults: [], curation: null, diagnostics: diagnosticReceipt(rawCandidates, analyzedStates, candidates, families, eventCandidate, compiledCandidate, null) }
      : { displayResults: [], curation: null };
  }

  const useEvent = Boolean(eventCandidate)
    && (!compiledCandidate || eventCandidate.score >= compiledCandidate.score);
  const winner = useEvent ? eventCandidate : compiledCandidate;
  const result = {
    displayResults: winner.board.map(candidate => candidate.result),
    curation: rationaleFor(useEvent ? "event" : "compiled", eventCandidate, compiledCandidate),
  };
  if (diagnostics) result.diagnostics = diagnosticReceipt(rawCandidates, analyzedStates, candidates, families, eventCandidate, compiledCandidate, useEvent ? "event" : "compiled");
  return result;
}

function diagnosticReceipt(rawCandidates, states, selectedCandidates, families, eventCandidate, compiledCandidate, winner) {
  const summarize = candidate => ({
    thumbnail: String(candidate.result.thumbnail || "").slice(0, 500),
    title: String(candidate.result.title || "").slice(0, 240),
    source: String(candidate.result.source || "").slice(0, 120),
    batchRank: candidate.batchRank,
  });
  const board = (selection, mode) => selection ? {
    score: Number(selection.score.toFixed(4)),
    scoreBreakdown: (mode === "event"
      ? eventScoreParts(selection.board, selection.familyStrength)
      : compiledScoreParts(selection.board)).breakdown,
    candidates: selection.board.slice(0, DEFAULT_CURATION_LIMIT).map(summarize),
  } : null;
  return {
    version: CURATION_VERSION,
    rawCandidates: states.slice(0, DEFAULT_CANDIDATE_LIMIT).map(state => ({
      ...summarize(state.candidate),
      dropReason: state.dropReason,
      dropDetail: state.dropDetail || null,
    })),
    dropped: states
      .filter(state => state.dropReason || !selectedCandidates.includes(state.candidate))
      .slice(0, DEFAULT_CANDIDATE_LIMIT)
      .map(state => ({
        ...summarize(state.candidate),
        dropReason: state.dropReason || "exact_duplicate",
        dropDetail: state.dropDetail || null,
      })),
    eventFamilies: families.slice(0, 12).map((family, index) => ({
      id: `event-family-${index + 1}`, strength: Number(family.familyStrength.toFixed(4)),
      size: family.candidates.length, candidates: family.candidates.slice(0, 9).map(summarize),
    })),
    strongestEvent: board(eventCandidate, "event"),
    strongestCompiled: board(compiledCandidate, "compiled"),
    winner,
    alternate: winner === "event" ? "compiled" : winner === "compiled" ? "event" : null,
    receipt: { rawCount: rawCandidates.length, analyzedCount: states.filter(state => !state.dropReason).length, curationVersion: CURATION_VERSION },
  };
}
