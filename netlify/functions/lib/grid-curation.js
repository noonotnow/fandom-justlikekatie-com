import { createHash } from "node:crypto";
import {
  fetchImageBuffer,
  fingerprintImage,
  hasCompositeVisualSignals,
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
export const CURATION_VERSION = 7;
export const DEFAULT_CURATION_LIMIT = 9;
export const DEFAULT_CANDIDATE_LIMIT = 36;
export const DEFAULT_ANALYSIS_CONCURRENCY = 4;
export const MIN_PROMISE_CARDS = 7;

const MIN_DIMENSION = 128;
const MIN_AREA = 24_000;
const MIN_ASPECT_RATIO = 0.4;
const MAX_ASPECT_RATIO = 2.5;
const MIN_SHARPNESS = 2;
const COMPILED_SIMILARITY_DISTANCE = 0.18;
const EVENT_COPY_DISTANCE = 0.085;
const EVENT_PAIR_DISTANCE = 0.24;
const HIGH_SALIENCE_SLOTS = [1, 3, 4, 5, 7];
const SECONDARY_SLOTS = [0, 2, 6, 8];
const MAX_TRUSTED_DIGEST_URLS = 3;
const SEARCH_PROVIDER_HOST = /(^|\.)(bing|google|baidu|yahoo|duckduckgo|brave|serpapi)\./i;
const GENERIC_SOURCE = /^(unknown|source|image|images|bing(?: images)?|google(?: images)?|baidu(?: images)?|search result)$/i;
const GENERIC_QUERY_TERMS = new Set([
  "写真", "造型", "剧照", "古装", "现代", "西装", "白衣", "黑衣", "眼镜",
  "采访", "情绪", "角色", "帅气", "特写", "近景", "近照", "日常", "随拍",
  "温柔", "单人", "个人", "大片", "活动", "现场",
]);
const COMPOSITE_TEXT = /(?:collage|contact\s*sheet|mood\s*board|multi[-\s]?panel|multiple\s+(?:photos?|looks?)|拼图|九宫格|组图|多图|合集|拼接|(?:介绍|盘点)\s*\+\s*\d+)/i;
const BTS_TEXT = /(?:behind\s+the\s+scenes|\bbts\b|production\s+(?:equipment|set)|片场|幕后|花絮|路透)/i;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, " ")
    .trim();
}

function resultText(result, includeQuery = false) {
  return normalizeText([
    result.title,
    result.description,
    includeQuery ? result.batchKey : "",
  ].filter(Boolean).join(" "));
}

function containsTerm(text, term) {
  const normalized = normalizeText(term);
  return Boolean(normalized && text.includes(normalized));
}

function matchingTerms(text, terms = []) {
  return terms.filter(term => containsTerm(text, term));
}

function matchesCombination(text, combination) {
  const all = combination?.all || [];
  const any = combination?.any || [];
  return all.every(term => containsTerm(text, term))
    && (!any.length || any.some(term => containsTerm(text, term)));
}

function declaredImageCount(result) {
  const values = [
    result.imageCount,
    result.mediaCount,
    result.photoCount,
    Array.isArray(result.images) ? result.images.length : null,
  ].map(Number).filter(Number.isFinite);
  return values.length ? Math.max(...values) : 1;
}

function compositeEvidence(result, fingerprint) {
  const text = `${result.title || ""} ${result.description || ""}`;
  const declaredCount = declaredImageCount(result);
  const visualScore = Number(fingerprint?.compositeScore) || 0;
  const singleFrameRatio = Number.isFinite(fingerprint?.singleFrameRatio)
    ? Number(fingerprint.singleFrameRatio)
    : 1 - visualScore;
  const metadataSignal = declaredCount > 1 || COMPOSITE_TEXT.test(text);
  return {
    composite: metadataSignal || hasCompositeVisualSignals(fingerprint),
    metadataSignal,
    declaredCount,
    visualScore,
    singleFrameRatio: clamp(singleFrameRatio),
  };
}

function clusterEvidence(result, promise) {
  const metadata = resultText(result, false);
  const query = normalizeText(result.batchKey);
  return (promise?.aestheticClusters || []).map(cluster => {
    const identityTerms = [
      cluster.work,
      cluster.character,
      ...(cluster.aliases || []),
    ].filter(Boolean);
    const stateTerms = [
      ...(cluster.emotionalStates || []),
      ...(cluster.relationshipAnchors || []),
      ...(cluster.sceneAnchors || []),
    ].filter(Boolean);
    const appearanceTerms = [
      ...(cluster.look || []),
      ...(cluster.mood || []),
      ...(cluster.palette || []),
      ...(cluster.wardrobeAnchors || []),
      ...(cluster.propAnchors || []),
      ...(cluster.settingAnchors || []),
    ].filter(Boolean);
    const visualTerms = [...stateTerms, ...appearanceTerms];
    const identityMetadataMatches = matchingTerms(metadata, identityTerms);
    const visualMetadataMatches = matchingTerms(metadata, visualTerms);
    const stateMetadataMatches = matchingTerms(metadata, stateTerms);
    const queryIdentityMatches = matchingTerms(query, identityTerms);
    // Generic styling words cannot claim a character look by themselves.
    // Query identity is only a bounded prior and needs two independent visual
    // anchors from the result itself before it can establish membership.
    // Stateful clusters also cannot claim a character merely because the
    // character name appeared: the result must evidence that emotional/scene
    // state, otherwise one character's compatible states contradict each other.
    const stateQualified = stateTerms.length > 0;
    const confidence = identityMetadataMatches.length
      ? stateQualified
        ? stateMetadataMatches.length
          ? 1
          : visualMetadataMatches.length >= 2
            ? 0.65
            : 0.5
        : visualMetadataMatches.length
          ? 1
          : 0.8
      : queryIdentityMatches.length
        && visualMetadataMatches.length >= 2
        && (!stateQualified || stateMetadataMatches.length)
        ? 0.7
        : 0;
    return {
      id: cluster.id,
      confidence,
      compatible: !promise.clusterIds?.length || promise.clusterIds.includes(cluster.id),
      metadataMatches: [...identityMetadataMatches, ...visualMetadataMatches],
      identityMetadataMatches,
      visualMetadataMatches,
      stateMetadataMatches,
      queryMatches: queryIdentityMatches,
      compatibility: cluster.vibeCompatibility || {},
    };
  }).filter(item => item.confidence > 0);
}

function promiseEvidence(result, promise) {
  if (!promise) {
    return {
      coreSatisfied: true,
      supportingMatches: [],
      hardAntiMatches: [],
      softContradictionMatches: [],
      heroSatisfied: true,
      clusters: [],
      promiseScore: 1,
    };
  }
  const metadata = resultText(result, false);
  const required = promise.requiredCombinations || [];
  const requiredMatches = required.filter(combination => matchesCombination(metadata, combination));
  const supportingMatches = matchingTerms(metadata, promise.supportingAnchors);
  const hardAntiMatches = matchingTerms(metadata, promise.hardAntiAnchors);
  if (BTS_TEXT.test(metadata) && !hardAntiMatches.includes("bts")) hardAntiMatches.push("behind_the_scenes");
  const softContradictionMatches = matchingTerms(metadata, promise.softContradictions);
  const clusters = clusterEvidence(result, promise);
  const recognizedCluster = clusters.some(cluster =>
    cluster.compatible && cluster.confidence >= 0.7);
  const incompatibleCluster = clusters.some(cluster =>
    !cluster.compatible && cluster.confidence >= 0.7);
  const coreSatisfied = required.length === 0
    ? (!promise.clusterIds?.length || recognizedCluster)
    : requiredMatches.length === required.length
      && (!promise.clusterIds?.length || recognizedCluster);
  const heroTerms = promise.hero?.any || [];
  const explicitHeroMatch = heroTerms.some(term => containsTerm(metadata, term));
  const heroSatisfied = (heroTerms.length === 0
    || explicitHeroMatch
    || (!promise.hero?.requireExplicit && recognizedCluster))
    && softContradictionMatches.length === 0
    && !incompatibleCluster;
  const promiseScore = clamp(
    (coreSatisfied ? 0.7 : 0)
    + Math.min(0.2, supportingMatches.length * 0.04)
    + Math.min(0.1, clusters.length * 0.05)
    - Math.min(0.5, softContradictionMatches.length * 0.18),
  );
  return {
    coreSatisfied,
    requiredMatches: requiredMatches.map(item => item.id),
    supportingMatches,
    hardAntiMatches,
    softContradictionMatches,
    heroSatisfied,
    incompatibleCluster,
    clusters,
    promiseScore,
  };
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

function boundedRoleTerms(result) {
  const raw = String(result.batchKey || "").trim();
  const terms = raw.split(/\s+/).filter(Boolean);
  if (terms.length < 3) return null;

  // Actor-pack searches are actor-first. The remaining terms need either a
  // work + character/role pair, or one named role explicitly anchored as a
  // drama still. Generic mood/style terms alone are not an editorial boundary.
  const boundaryTerms = terms.slice(1)
    .map(normalizeText)
    .filter(term => term && !GENERIC_QUERY_TERMS.has(term));
  const hasStillAnchor = terms.some(term => normalizeText(term) === "剧照");
  if (boundaryTerms.length < 2 && !(boundaryTerms.length === 1 && hasStillAnchor)) return null;
  return { actor: normalizeText(terms[0]), boundaryTerms };
}

function boundedRoleBatchKey(result) {
  const details = boundedRoleTerms(result);
  return details ? batchKey(result) : "";
}

function boundedRoleAnchorKeys(result) {
  const details = boundedRoleTerms(result);
  if (!details) return new Set();
  const title = normalizeText(result.title);
  const anchors = details.boundaryTerms.filter((term, index) => {
    if (!title.includes(term)) return false;
    const trailingTerms = details.boundaryTerms.slice(index + 1);
    return index === details.boundaryTerms.length - 1
      || trailingTerms.every(trailingTerm => !title.includes(trailingTerm));
  });
  return new Set(anchors.map(anchor => `${details.actor}:${anchor}`));
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
  const leftRoleAnchors = boundedRoleAnchorKeys(leftResult);
  const rightRoleAnchors = boundedRoleAnchorKeys(rightResult);
  const sameRoleAcrossQueries = [...leftRoleAnchors]
    .some(anchor => rightRoleAnchors.has(anchor));
  const visualDistance = left.fingerprint && right.fingerprint
    ? perceptualDistance(left.fingerprint, right.fingerprint)
    : 1;

  // A character mood board is a bounded Event even when its varied frames were
  // published by different sources. A specific work/character query supplies
  // that boundary; generic actor + style searches deliberately do not.
  if (sameRoleAcrossQueries) {
    return { related: true, strength: 0.76, kind: "shared character or role boundary" };
  }

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

function boardPromiseMetrics(board, promise) {
  if (!promise) {
    return {
      coreCount: board.length,
      coreCoverage: 1,
      promiseFulfillment: 1,
      heroFulfillment: 1,
      clusterCoherence: 1,
      contradictionRate: 0,
      singleFrameRatio: 1,
    };
  }
  const coreCount = board.filter(candidate => candidate.editorial?.coreSatisfied).length;
  const promiseFulfillment = average(board.map(candidate => candidate.editorial?.promiseScore || 0));
  const hero = board[Math.min(4, Math.max(0, board.length - 1))];
  const highSalience = HIGH_SALIENCE_SLOTS
    .filter(index => index < board.length)
    .map(index => board[index]);
  const clusterIds = board.flatMap(candidate =>
    (candidate.editorial?.clusters || [])
      .filter(cluster => cluster.compatible && cluster.confidence >= 0.7)
      .map(cluster => cluster.id));
  const clusterCounts = new Map();
  for (const id of clusterIds) clusterCounts.set(id, (clusterCounts.get(id) || 0) + 1);
  const dominantCount = Math.max(0, ...clusterCounts.values());
  const contradictionCount = board.filter(candidate =>
    candidate.editorial?.softContradictionMatches?.length).length;
  return {
    coreCount,
    coreCoverage: coreCount / Math.max(1, board.length),
    promiseFulfillment,
    heroFulfillment: hero?.editorial?.heroSatisfied ? 1 : 0,
    highSalienceCoreCount: highSalience.filter(candidate =>
      candidate?.editorial?.coreSatisfied && !candidate?.editorial?.incompatibleCluster).length,
    highSalienceCount: highSalience.length,
    incompatibleClusterCount: board.filter(candidate =>
      candidate.editorial?.incompatibleCluster).length,
    clusterCoherence: clusterIds.length ? dominantCount / clusterIds.length : 0.5,
    contradictionRate: contradictionCount / Math.max(1, board.length),
    singleFrameRatio: average(board.map(candidate => candidate.singleFrameRatio ?? 1)),
  };
}

function promiseQualified(board, promise, limit) {
  if (!promise) return true;
  const metrics = boardPromiseMetrics(board, promise);
  return metrics.coreCount >= Math.min(MIN_PROMISE_CARDS, limit)
    && metrics.heroFulfillment === 1
    && metrics.highSalienceCoreCount === metrics.highSalienceCount
    && metrics.singleFrameRatio >= 0.99;
}

function eventScoreParts(board, familyStrength, promise) {
  const variation = boardVisualVariation(board);
  const quality = boardQuality(board);
  const promiseMetrics = boardPromiseMetrics(board, promise);
  return weightedBreakdown([
    ["promiseFulfillment", promiseMetrics.promiseFulfillment, 0.3],
    ["coreAnchorCoverage", promiseMetrics.coreCoverage, 0.15],
    ["heroSlotFulfillment", promiseMetrics.heroFulfillment, 0.15],
    ["clusterContinuity", promiseMetrics.clusterCoherence, 0.1],
    ["familyStrength", familyStrength, 0.3],
    ["visualVariation", variation, 0.05],
    ["quality", quality, 0.05],
    ["contradictionPenalty", -promiseMetrics.contradictionRate, 0.1],
  ]);
}

function eventScore(board, familyStrength, promise) {
  return eventScoreParts(board, familyStrength, promise).total;
}

function compiledScoreParts(board, promise) {
  const quality = boardQuality(board);
  const variation = boardVisualVariation(board);
  const promiseMetrics = boardPromiseMetrics(board, promise);
  const coherentRange = clamp(
    (promiseMetrics.clusterCoherence * 0.65)
    + (variation * 0.35)
    - promiseMetrics.contradictionRate,
  );
  return weightedBreakdown([
    ["promiseFulfillment", promiseMetrics.promiseFulfillment, 0.3],
    ["coreAnchorCoverage", promiseMetrics.coreCoverage, 0.2],
    ["heroSlotFulfillment", promiseMetrics.heroFulfillment, 0.15],
    ["coherentRange", coherentRange, 0.15],
    ["visualVariation", variation, 0.05],
    ["quality", quality, 0.15],
    ["contradictionPenalty", -promiseMetrics.contradictionRate, 0.1],
  ]);
}

function compiledScore(board, promise) {
  return compiledScoreParts(board, promise).total;
}

function stableSerialize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (ArrayBuffer.isView(value)) return `[${[...value].join(",")}]`;
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

export function candidateIdForResult(result) {
  const digest = String(result?.digest || result?.imageDigest || "").slice(0, 256);
  const identity = digest
    ? { imageDigest: digest }
    : {
      source: sourceKey(result),
      canonicalLink: canonicalLinkKey(result),
      thumbnail: String(result?.thumbnail || ""),
      title: normalizeText(result?.title),
    };
  return createHash("sha256").update(stableSerialize(identity)).digest("hex").slice(0, 24);
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

function boardRangeTieBreak(board) {
  return uniqueCount(board, candidate => sourceKey(candidate.result))
    + uniqueCount(board, candidate => batchKey(candidate.result)) * 0.1;
}

function calibrationSet(profile, key) {
  return new Set((profile?.[key] || []).map(value => normalizeText(value)).filter(Boolean));
}
function arrangeBoard(candidates, _promise) {
  const ordered = [...candidates].sort(candidateOrder);
  if (ordered.length < 5) return ordered;
  const rankedForHero = [...ordered].sort((left, right) =>
    Number(right.calibration?.hero) - Number(left.calibration?.hero)
    || (right.calibration?.score || 0) - (left.calibration?.score || 0)
    || Number(right.editorial?.heroSatisfied) - Number(left.editorial?.heroSatisfied)
    || Number(right.editorial?.coreSatisfied) - Number(left.editorial?.coreSatisfied)
    || Number(left.editorial?.incompatibleCluster) - Number(right.editorial?.incompatibleCluster)
    || (right.editorial?.promiseScore || 0) - (left.editorial?.promiseScore || 0)
    || candidateOrder(left, right));
  const hero = rankedForHero[0];
  const rest = ordered
    .filter(candidate => candidate !== hero)
    .sort((left, right) =>
      Number(left.editorial?.incompatibleCluster) - Number(right.editorial?.incompatibleCluster)
      || Number(Boolean(left.editorial?.softContradictionMatches?.length))
        - Number(Boolean(right.editorial?.softContradictionMatches?.length))
      || Number(right.editorial?.coreSatisfied) - Number(left.editorial?.coreSatisfied)
      || (right.editorial?.promiseScore || 0) - (left.editorial?.promiseScore || 0)
      || candidateOrder(left, right));
  const arranged = Array(ordered.length);
  arranged[4] = hero;
  const positioned = rest
    .filter(candidate =>
      Number.isInteger(candidate.calibration?.preferredPosition)
      && candidate.calibration.preferredPosition >= 0
      && candidate.calibration.preferredPosition < ordered.length
      && candidate.calibration.preferredPosition !== 4)
    .sort((left, right) =>
      (right.calibration?.rankingScore || 0) - (left.calibration?.rankingScore || 0)
      || candidateOrder(left, right));
  for (const candidate of positioned) {
    const slot = candidate.calibration.preferredPosition;
    if (!arranged[slot]) {
      arranged[slot] = candidate;
      rest.splice(rest.indexOf(candidate), 1);
    }
  }
  const supportingSlots = HIGH_SALIENCE_SLOTS.filter(index => index !== 4 && index < ordered.length);
  for (const slot of supportingSlots) {
    if (!arranged[slot]) arranged[slot] = rest.shift();
  }
  for (const slot of SECONDARY_SLOTS.filter(index => index < ordered.length)) {
    if (!arranged[slot]) arranged[slot] = rest.shift();
  }
  for (let index = 0; index < arranged.length; index += 1) {
    if (!arranged[index]) arranged[index] = rest.shift();
  }
  return arranged;
}

function greedyBoards(candidates, limit, score, incompatible, promise) {
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
      const ordered = arrangeBoard(board, promise);
      alternatives.push({ board: ordered, score: score(ordered) });
    }
  }
  const unique = new Map();
  for (const alternative of alternatives) {
    const key = boardKey(alternative.board);
    if (!unique.has(key) || alternative.score > unique.get(key).score) unique.set(key, alternative);
  }
  return [...unique.values()].sort((left, right) =>
    right.score - left.score
    || boardRangeTieBreak(right.board) - boardRangeTieBreak(left.board)
    || boardKey(left.board).localeCompare(boardKey(right.board))).slice(0, 6);
}

function preferredBoardBonus(board, preferredCandidateIds) {
  if (!preferredCandidateIds?.size) return 0;
  const preferredCount = board.filter(candidate => {
    const digestId = candidateIdForResult({
      ...candidate.result,
      digest: candidate.fingerprint?.digest,
    });
    const provenanceId = candidateIdForResult({
      ...candidate.result,
      imageDigest: "",
      digest: "",
    });
    return preferredCandidateIds.has(digestId) || preferredCandidateIds.has(provenanceId);
  }).length;
  // Preference is deliberately small: it can break a close editorial tie, but
  // cannot make an otherwise invalid board pass the promise or safety gates.
  return preferredCount * 0.02;
}

function selectEventBoards(families, limit, promise, preferredCandidateIds) {
  const alternatives = families.flatMap(family => {
    const candidates = collapseCopies(
      [...family.candidates].sort(candidateOrder),
      EVENT_COPY_DISTANCE,
    );
    if (candidates.length < limit) return [];
    const selected = greedyBoards(
      candidates,
      limit,
      board => eventScore(board, family.familyStrength, promise)
        + preferredBoardBonus(board, preferredCandidateIds)
        + operatorCalibrationBonus(board),
      () => false,
      promise,
    );
    return selected.map(item => ({ ...item, familyStrength: family.familyStrength }));
  });
  return alternatives.sort((left, right) =>
    right.score - left.score
    || boardKey(left.board).localeCompare(boardKey(right.board))).slice(0, 6);
}

function selectCompiledBoards(candidates, limit, promise, preferredCandidateIds) {
  return greedyBoards(
    candidates,
    limit,
    board => compiledScore(board, promise)
      + preferredBoardBonus(board, preferredCandidateIds)
      + operatorCalibrationBonus(board),
    (left, right) =>
      perceptualDistance(left.fingerprint, right.fingerprint) <= COMPILED_SIMILARITY_DISTANCE,
    promise,
  );
}

function boardDiagnosticSummary(mode, reasonCode, metrics) {
  const label = mode === "event" ? "Event" : "Compiled";
  if (reasonCode === "too_few_usable_images") {
    return `${label} had ${metrics.usableCount} usable image${metrics.usableCount === 1 ? "" : "s"}; ${metrics.requiredCount} are required.`;
  }
  if (reasonCode === "too_much_visual_duplication") {
    if (mode === "event" && metrics.largestFamilyCount > 0) {
      return `The strongest Event family had ${metrics.largestFamilyCount} usable images, but only ${metrics.largestDistinctFamilyCount} distinct frames remained after visual duplicates were collapsed; ${metrics.requiredCount} are required.`;
    }
    if (metrics.distinctUsableCount < metrics.requiredCount) {
      return `${label} had ${metrics.usableCount} usable images, but only ${metrics.distinctUsableCount} distinct frames remained after exact duplicates were collapsed; ${metrics.requiredCount} are required.`;
    }
    return `${label} had enough usable images, but visual overlap prevented ${metrics.requiredCount} sufficiently distinct frames from forming one varied board.`;
  }
  if (reasonCode === "no_bounded_role_family") {
    return "No bounded work or role family produced enough distinct frames for an Event board. Make the query more specific.";
  }
  if (reasonCode === "event_family_too_small") {
    return `The strongest Event family had ${metrics.largestFamilyCount} frames (${metrics.largestDistinctFamilyCount} after copy collapse); ${metrics.requiredCount} distinct frames are required.`;
  }
  if (reasonCode === "promise_not_fulfilled") {
    return `${label} formed a complete proposal, but only ${metrics.coreAnchorCount} of ${metrics.requiredCount} cards fulfilled the Vibe Pack's required anchors; at least ${Math.min(MIN_PROMISE_CARDS, metrics.requiredCount)} plus an on-promise hero are required.`;
  }
  return `${label} did not reach the ${metrics.requiredCount}-card qualification gate.`;
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

function selectFromFrozenAnalysis(rawCandidates, frozenStates, {
  limit,
  diagnostics,
  promise,
  profileVersions,
  preferredCandidateIds,
  calibrationProfile,
  batchRanks = null,
}) {
  const rankFor = candidate => {
    const query = candidate.result?.batchKey;
    return Number.isInteger(batchRanks?.[query]) ? batchRanks[query] : candidate.batchRank;
  };
  const analyzedStates = frozenStates.map(state => {
    const candidate = {
      ...state.candidate,
      batchRank: rankFor(state.candidate),
    };
    candidate.calibration = candidateCalibration(candidate, calibrationProfile);
    return { ...state, candidate };
  });
  const rankedRawCandidates = rawCandidates.map(candidate => ({
    ...candidate,
    batchRank: rankFor(candidate),
  })).sort(rawCandidateOrder);
  const analyzed = analyzedStates
    .filter(state => state.candidate.fingerprint && !state.dropReason)
    .map(state => state.candidate);
  const candidates = replaceExactCopies(analyzed).sort(candidateOrder);
  const families = buildFamilies(candidates);
  const withFamilies = familyLabeledCandidates(candidates, families);
  const preferredIds = new Set(preferredCandidateIds.filter(Boolean));
  const eventProposals = selectEventBoards(families, limit, promise, preferredIds);
  const compiledProposals = selectCompiledBoards(withFamilies, limit, promise, preferredIds);
  const eventAlternatives = eventProposals.filter(item => promiseQualified(item.board, promise, limit));
  const compiledAlternatives = compiledProposals.filter(item => promiseQualified(item.board, promise, limit));
  const eventCandidate = eventAlternatives[0] || null;
  const compiledCandidate = compiledAlternatives[0] || null;
  const boardDiagnostics = {
    event: boardDiagnostic("event", eventCandidate, {
      limit,
      usableCount: analyzed.length,
      distinctUsableCount: candidates.length,
      families,
      proposals: eventProposals,
      promise,
    }),
    compiled: boardDiagnostic("compiled", compiledCandidate, {
      limit,
      usableCount: analyzed.length,
      distinctUsableCount: candidates.length,
      families,
      proposals: compiledProposals,
      promise,
    }),
  };
  if (!eventCandidate && !compiledCandidate) {
    return diagnostics
      ? { displayResults: [], curation: null, diagnostics: diagnosticReceipt(rankedRawCandidates, analyzedStates, candidates, families, eventCandidate, compiledCandidate, eventAlternatives, compiledAlternatives, null, boardDiagnostics, promise, profileVersions, calibrationProfile) }
      : { displayResults: [], curation: null };
  }
  const useEvent = Boolean(eventCandidate)
    && (!compiledCandidate || eventCandidate.score >= compiledCandidate.score);
  const winner = useEvent ? eventCandidate : compiledCandidate;
  const result = {
    displayResults: winner.board.map(candidate => candidate.result),
    curation: {
      ...rationaleFor(useEvent ? "event" : "compiled", eventCandidate, compiledCandidate),
      ...(profileVersions || {}),
      calibrationProfileVersion: calibrationProfile?.calibrationVersion || null,
      calibrationEvidenceCount: calibrationProfile?.evidenceCount || 0,
    },
  };
  if (diagnostics) {
    result.diagnostics = diagnosticReceipt(
      rankedRawCandidates,
      analyzedStates,
      candidates,
      families,
      eventCandidate,
      compiledCandidate,
      eventAlternatives,
      compiledAlternatives,
      useEvent ? "event" : "compiled",
      boardDiagnostics,
      promise,
      profileVersions,
      calibrationProfile,
    );
  }
  return result;
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
    promise = null,
    profileVersions = null,
    preferredCandidateIds = [],
    calibrationProfile = null,
    calibrationControl = null,
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

  let analyzedStates = await mapWithConcurrency(rawCandidates, analysisConcurrency, async candidate => {
    try {
      const buffer = await loadBuffer(candidate.result.thumbnail, candidate.result);
      const imageFingerprint = await fingerprint(buffer, candidate.result);
      if (!usableFingerprint(imageFingerprint)) return { candidate, dropReason: "unusable_image" };
      const composite = compositeEvidence(candidate.result, imageFingerprint);
      const imageSafeCandidate = {
        ...candidate,
        fingerprint: imageFingerprint,
        singleFrameRatio: composite.singleFrameRatio,
        composite,
      };
      if (composite.composite) {
        return {
          candidate: imageSafeCandidate,
          dropReason: "composite_image",
          dropDetail: composite.metadataSignal
            ? `Result metadata indicates ${composite.declaredCount} images or a composite format.`
            : `Image seam analysis produced composite score ${composite.visualScore.toFixed(2)}.`,
        };
      }
      const editorial = promiseEvidence(candidate.result, promise);
      const enriched = {
        ...imageSafeCandidate,
        editorial,
      };
      if (editorial.hardAntiMatches.length) {
        return {
          candidate: enriched,
          dropReason: "hard_anti_anchor",
          dropDetail: editorial.hardAntiMatches.join(", ").slice(0, 160),
        };
      }
      return { candidate: enriched, dropReason: null };
    } catch (error) {
      return {
        candidate,
        dropReason: "image_load_failed",
        dropDetail: String(error?.message || "unknown image analysis failure").slice(0, 160),
      };
    }
  });
  analyzedStates = disambiguateMassDigestCollisions(analyzedStates);
  const result = selectFromFrozenAnalysis(rawCandidates, analyzedStates, {
    limit,
    diagnostics,
    promise,
    profileVersions,
    preferredCandidateIds,
    calibrationProfile,
  });
  if (calibrationControl) {
    const control = selectFromFrozenAnalysis(rawCandidates, analyzedStates, {
      limit,
      diagnostics: true,
      promise,
      profileVersions,
      preferredCandidateIds: calibrationControl.preferredCandidateIds || [],
      calibrationProfile: null,
      batchRanks: calibrationControl.batchRanks || null,
    });
    result.controlDiagnostics = control.diagnostics;
  }
  return result;
}

function disambiguateMassDigestCollisions(states) {
  const urlsByDigest = new Map();
  for (const state of states) {
    if (state.dropReason || !state.candidate?.fingerprint?.digest) continue;
    const digest = state.candidate.fingerprint.digest;
    const urls = urlsByDigest.get(digest) || new Set();
    urls.add(String(state.candidate.result?.thumbnail || ""));
    urlsByDigest.set(digest, urls);
  }
  const suspicious = new Set([...urlsByDigest.entries()]
    .filter(([, urls]) => urls.size > MAX_TRUSTED_DIGEST_URLS)
    .map(([digest]) => digest));
  if (!suspicious.size) return states;
  return states.map(state => {
    const fingerprint = state.candidate?.fingerprint;
    if (state.dropReason || !fingerprint || !suspicious.has(fingerprint.digest)) return state;
    const retrievalDigest = fingerprint.digest;
    const thumbnail = String(state.candidate.result?.thumbnail || "");
    return {
      ...state,
      candidate: {
        ...state.candidate,
        fingerprint: {
          ...fingerprint,
          digest: createHash("sha256")
            .update(`retrieval-collision:${retrievalDigest}\0${thumbnail}`)
            .digest("hex"),
          retrievalDigest,
          digestCollision: true,
        },
      },
    };
  });
}

function calibrationDiagnostics(profile, board = [], states = []) {
  if (!profile?.evidenceCount) {
    return {
      calibrationVersion: null,
      evidenceCount: 0,
      affected: false,
      selectedSignalCount: 0,
      beyondExactSavedNineCount: 0,
      messages: [],
    };
  }
  const affectedCandidates = board.filter(candidate =>
    candidate.calibration?.positive?.length || candidate.calibration?.negative?.length);
  const sourceEvidenceIds = new Set(profile.sourceEvidenceCandidateIds || [
    ...(profile.positiveCandidateIds || []),
    ...(profile.negativeCandidateIds || []),
  ]);
  const beyondExactSavedNine = affectedCandidates.filter(candidate =>
    !sourceEvidenceIds.has(candidate.calibration?.candidateId)
    && candidate.calibration?.positive?.some(signal =>
      /^(query|source|cluster):/.test(signal)));
  const gateSignals = states
    .filter(state =>
      state.dropReason
      && (state.candidate?.calibration?.positive?.length || state.candidate?.calibration?.negative?.length))
    .map(state => ({
      candidateId: state.candidate.calibration.candidateId,
      dropReason: state.dropReason,
      positive: state.candidate.calibration.positive,
      negative: state.candidate.calibration.negative,
    }));
  const messages = [];
  if (affectedCandidates.length) {
    messages.push(`${affectedCandidates.length} board candidate${affectedCandidates.length === 1 ? "" : "s"} matched confirmed operator signals.`);
  }
  if (beyondExactSavedNine.length) {
    messages.push(`${beyondExactSavedNine.length} matched candidate${beyondExactSavedNine.length === 1 ? "" : "s"} transferred a reusable signal onto evidence absent from the source audit.`);
  }
  if (gateSignals.length) {
    messages.push(`${gateSignals.length} calibrated candidate${gateSignals.length === 1 ? "" : "s"} still met an image or anti-anchor gate; calibration did not bypass the gate.`);
  }
  return {
    calibrationVersion: profile.calibrationVersion,
    evidenceCount: profile.evidenceCount,
    sourceReceiptIds: profile.sourceReceiptIds || [],
    affected: affectedCandidates.length > 0 || gateSignals.length > 0,
    selectedSignalCount: affectedCandidates.length,
    beyondExactSavedNineCount: beyondExactSavedNine.length,
    sourceEvidenceCandidateCount: sourceEvidenceIds.size,
    exactSavedCandidateCount: affectedCandidates.length - beyondExactSavedNine.length,
    scoreDelta: Number(operatorCalibrationBonus(board).toFixed(4)),
    affectedCandidates: affectedCandidates.map(candidate => ({
      candidateId: candidate.calibration.candidateId,
      exactSavedCandidate: candidate.calibration.exactSavedCandidate,
      hero: candidate.calibration.hero,
      rankingScore: candidate.calibration.rankingScore,
      rankingPairCount: candidate.calibration.rankingPairCount,
      preferredPosition: candidate.calibration.preferredPosition,
      positive: candidate.calibration.positive,
      negative: candidate.calibration.negative,
    })),
    gateSignals,
    preferredQueries: profile.positiveQueries || [],
    discouragedQueries: profile.negativeQueries || [],
    preferredSources: profile.positiveSources || [],
    discouragedSources: profile.negativeSources || [],
    preferredClusters: profile.positiveClusters || [],
    discouragedClusters: profile.negativeClusters || [],
    positiveAntiAnchors: profile.positiveAntiAnchors || [],
    negativeAntiAnchors: profile.negativeAntiAnchors || [],
    rankingContrastCount: profile.rankingContrasts?.length || 0,
    messages,
  };
}
function diagnosticReceipt(rawCandidates, states, selectedCandidates, families, eventCandidate, compiledCandidate, eventAlternatives, compiledAlternatives, winner, boardDiagnostics, promise, profileVersions, calibrationProfile) {
  const summarize = candidate => ({
    candidateId: candidateIdForResult({ ...candidate.result, digest: candidate.fingerprint?.digest }),
    provisionalCandidateId: candidateIdForResult({ ...candidate.result, digest: "" }),
    imageDigest: String(candidate.fingerprint?.digest || "").slice(0, 256) || null,
    retrievalDigestCollision: candidate.fingerprint?.digestCollision === true,
    query: String(candidate.result.batchKey || "").slice(0, 500),
    link: String(candidate.result.link || "").slice(0, 700),
    thumbnail: String(candidate.result.thumbnail || "").slice(0, 500),
    title: String(candidate.result.title || "").slice(0, 240),
    description: String(candidate.result.description || "").slice(0, 400),
    source: String(candidate.result.source || "").slice(0, 120),
    batchRank: candidate.batchRank,
    promise: candidate.editorial ? {
      coreSatisfied: candidate.editorial.coreSatisfied,
      heroSatisfied: candidate.editorial.heroSatisfied,
      incompatibleCluster: candidate.editorial.incompatibleCluster === true,
      requiredMatches: candidate.editorial.requiredMatches || [],
      supportingMatches: candidate.editorial.supportingMatches || [],
      hardAntiMatches: candidate.editorial.hardAntiMatches || [],
      softContradictionMatches: candidate.editorial.softContradictionMatches || [],
      clusters: (candidate.editorial.clusters || []).map(cluster => ({
        id: cluster.id,
        confidence: Number(cluster.confidence.toFixed(3)),
      })),
      singleFrameRatio: Number((candidate.singleFrameRatio ?? 1).toFixed(3)),
      composite: candidate.composite ? {
        metadataSignal: candidate.composite.metadataSignal === true,
        visualScore: Number((candidate.composite.visualScore || 0).toFixed(3)),
      } : null,
    } : null,
    calibration: candidate.calibration ? {
      score: Number((candidate.calibration.score || 0).toFixed(3)),
      hero: candidate.calibration.hero === true,
      exactSavedCandidate: candidate.calibration.exactSavedCandidate === true,
      rankingScore: Number((candidate.calibration.rankingScore || 0).toFixed(3)),
      rankingPairCount: candidate.calibration.rankingPairCount || 0,
      preferredPosition: candidate.calibration.preferredPosition,
      positive: candidate.calibration.positive || [],
      negative: candidate.calibration.negative || [],
    } : null,
  });
  const board = (selection, mode) => selection ? {
    score: Number(selection.score.toFixed(4)),
    scoreBreakdown: {
      ...(mode === "event"
      ? eventScoreParts(selection.board, selection.familyStrength, promise)
      : compiledScoreParts(selection.board, promise)).breakdown,
      ...(calibrationProfile?.evidenceCount ? { operatorCalibration: {
        value: Number(operatorCalibrationBonus(selection.board).toFixed(4)),
        weight: 1,
        contribution: Number(operatorCalibrationBonus(selection.board).toFixed(4)),
      } } : {}),
    },
    promise: boardPromiseMetrics(selection.board, promise),
    candidates: selection.board.slice(0, DEFAULT_CURATION_LIMIT).map(summarize),
  } : null;
  const sourceEvidenceCandidates = states.map(state => ({
    ...summarize(state.candidate),
    dropReason: state.dropReason || null,
    dropDetail: state.dropDetail || null,
  }));
  return {
    version: CURATION_VERSION,
    sourceEvidenceCandidates,
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
    eventAlternatives: eventAlternatives.slice(1, 4).map(item => board(item, "event")),
    compiledAlternatives: compiledAlternatives.slice(1, 4).map(item => board(item, "compiled")),
    boardDiagnostics,
    winner,
    alternate: winner === "event" ? "compiled" : winner === "compiled" ? "event" : null,
    calibrationSignals: calibrationDiagnostics(
      calibrationProfile,
      winner === "event" ? eventCandidate?.board : winner === "compiled" ? compiledCandidate?.board : [],
      states,
    ),
    receipt: {
      rawCount: rawCandidates.length,
      analyzedCount: states.filter(state => !state.dropReason).length,
      curationVersion: CURATION_VERSION,
      promiseContractId: promise?.id || null,
      singleFrameCount: states.filter(state => !state.dropReason && (state.candidate.singleFrameRatio ?? 1) >= 0.99).length,
      compositeRejectedCount: states.filter(state => state.dropReason === "composite_image").length,
      calibrationProfileVersion: calibrationProfile?.calibrationVersion || null,
      calibrationEvidenceCount: calibrationProfile?.evidenceCount || 0,
      ...(profileVersions || {}),
    },
  };
}

function boardDiagnostic(mode, selection, {
  limit,
  usableCount,
  distinctUsableCount,
  families,
  proposals = [],
  promise = null,
}) {
  const largestFamilyCount = families.reduce(
    (largest, family) => Math.max(largest, family.candidates.length),
    0,
  );
  const largestDistinctFamilyCount = families.reduce(
    (largest, family) => Math.max(
      largest,
      collapseCopies(
        [...family.candidates].sort(candidateOrder),
        EVENT_COPY_DISTANCE,
      ).length,
    ),
    0,
  );
  const metrics = {
    requiredCount: limit,
    usableCount,
    distinctUsableCount,
    largestFamilyCount,
    largestDistinctFamilyCount,
    coreAnchorCount: proposals[0]?.board
      ? boardPromiseMetrics(proposals[0].board, promise).coreCount
      : 0,
  };
  const reasonCodes = [];

  if (!selection && usableCount < limit) {
    reasonCodes.push("too_few_usable_images");
  } else if (!selection && distinctUsableCount < limit) {
    reasonCodes.push("too_much_visual_duplication");
  }

  if (
    !selection
    && mode === "compiled"
    && usableCount >= limit
    && distinctUsableCount >= limit
  ) {
    reasonCodes.push("too_much_visual_duplication");
  }

  if (!selection && mode === "event") {
    const hasBoundedRoleFamily = families.some(family =>
      family.candidates.some(candidate => boundedRoleBatchKey(candidate.result)),
    );
    if (largestFamilyCount >= limit && largestDistinctFamilyCount < limit) {
      reasonCodes.push("too_much_visual_duplication");
    } else if (!hasBoundedRoleFamily && largestDistinctFamilyCount < limit) {
      reasonCodes.push("no_bounded_role_family");
    } else if (largestFamilyCount < limit || largestDistinctFamilyCount < limit) {
      reasonCodes.push("event_family_too_small");
    }
  }

  if (!selection && proposals.length && promise) {
    reasonCodes.unshift("promise_not_fulfilled");
  }

  if (!selection && !reasonCodes.length) reasonCodes.push("board_not_selected");
  const uniqueReasonCodes = [...new Set(reasonCodes)];
  const reasonCode = uniqueReasonCodes[0] || null;
  return {
    available: Boolean(selection),
    requiredCount: limit,
    candidateCount: selection?.board.length || 0,
    usableCount,
    distinctUsableCount,
    largestFamilyCount,
    largestDistinctFamilyCount,
    coreAnchorCount: metrics.coreAnchorCount,
    reasonCodes: uniqueReasonCodes,
    reasonCode,
    summary: reasonCode
      ? boardDiagnosticSummary(mode, reasonCode, metrics)
      : `A complete ${limit}-card ${mode === "event" ? "Event" : "Compiled"} board qualified.`,
  };
}

function operatorCalibrationBonus(board) {
  if (!board.some(candidate => candidate.calibration?.positive?.length || candidate.calibration?.negative?.length)) {
    return 0;
  }
  const averageSignal = average(board.map(candidate => candidate.calibration?.score || 0));
  const heroSignal = board[4]?.calibration?.hero ? 0.03 : 0;
  // Operator evidence can reorder close proposals, but cannot satisfy promise,
  // image-safety, or diversity gates by itself.
  return clamp(averageSignal * 0.65 + heroSignal, -0.12, 0.12);
}

function candidateCalibration(candidate, profile) {
  if (!profile?.evidenceCount) {
    return { score: 0, hero: false, exactSavedCandidate: false, positive: [], negative: [] };
  }
  const candidateId = candidateIdForResult({
    ...candidate.result,
    digest: candidate.fingerprint?.digest,
  });
  const query = batchKey(candidate.result);
  const source = sourceKey(candidate.result);
  const clusters = (candidate.editorial?.clusters || []).map(cluster => normalizeText(cluster.id));
  const antiAnchors = (candidate.editorial?.hardAntiMatches || []).map(normalizeText);
  const positive = [];
  const negative = [];
  const positiveIds = new Set(profile.positiveCandidateIds || []);
  const heroIds = new Set(profile.heroCandidateIds || []);
  const negativeIds = new Set(profile.negativeCandidateIds || []);
  const match = (value, positiveKey, negativeKey, label) => {
    if (!value) return;
    if (calibrationSet(profile, positiveKey).has(normalizeText(value))) positive.push(label);
    if (calibrationSet(profile, negativeKey).has(normalizeText(value))) negative.push(label);
  };
  match(query, "positiveQueries", "negativeQueries", `query:${query}`);
  match(source, "positiveSources", "negativeSources", `source:${source}`);
  for (const cluster of clusters) {
    match(cluster, "positiveClusters", "negativeClusters", `cluster:${cluster}`);
  }
  for (const anchor of antiAnchors) {
    match(anchor, "positiveAntiAnchors", "negativeAntiAnchors", `anti-anchor:${anchor}`);
  }
  const exactSavedCandidate = positiveIds.has(candidateId);
  if (exactSavedCandidate) positive.push("exact-saved-candidate");
  if (negativeIds.has(candidateId)) negative.push("omitted-candidate");
  const rankingWins = Number(profile.rankingWins?.[candidateId]) || 0;
  const rankingLosses = Number(profile.rankingLosses?.[candidateId]) || 0;
  const rankingScore = clamp(
    (rankingWins - rankingLosses) / Math.max(1, rankingWins, rankingLosses),
    -1,
    1,
  );
  if (rankingScore > 0) positive.push("pairwise-ranking-win");
  if (rankingScore < 0) negative.push("pairwise-ranking-loss");
  const score = clamp(
    positive.length * 0.28 - negative.length * 0.22 + rankingScore * 0.3,
    -1,
    1,
  );
  return {
    score,
    hero: heroIds.has(candidateId),
    exactSavedCandidate,
    rankingScore,
    rankingPairCount: rankingWins + rankingLosses,
    preferredPosition: Number.isInteger(profile.preferredPositions?.[candidateId])
      ? profile.preferredPositions[candidateId]
      : null,
    candidateId,
    positive: [...new Set(positive)],
    negative: [...new Set(negative)],
  };
}
