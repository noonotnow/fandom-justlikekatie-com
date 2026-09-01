import { createHash } from "node:crypto";
import sharp from "sharp";
import { fetchSafeImage } from "./canonical-render.js";

const HASH_WIDTH = 17;
const HASH_HEIGHT = 16;
const SAMPLE_SIZE = HASH_HEIGHT * (HASH_WIDTH - 1);
const COMPOSITE_SAMPLE_SIZE = 96;
const DEFAULT_CANDIDATE_LIMIT = 18;
export const VISUAL_COMPOSITE_SCORE_THRESHOLD = 0.68;
export const MIN_SINGLE_FRAME_RATIO = 0.32;

function separatedPeaks(values, threshold) {
  const peaks = [];
  for (let index = 1; index < values.length - 1; index += 1) {
    if (
      values[index] >= threshold
      && values[index] >= values[index - 1]
      && values[index] >= values[index + 1]
      && peaks.every(previous => Math.abs(previous - index) > 1)
    ) peaks.push(index);
  }
  return peaks;
}

function axisTransitions(data, info, axis) {
  const length = axis === "vertical" ? info.width : info.height;
  const span = axis === "vertical" ? info.height : info.width;
  const transitions = [];
  for (let position = 1; position < length; position += 1) {
    let total = 0;
    let strongPixels = 0;
    for (let offset = 0; offset < span; offset += 1) {
      const current = axis === "vertical"
        ? (offset * info.width + position) * info.channels
        : (position * info.width + offset) * info.channels;
      const previous = axis === "vertical"
        ? current - info.channels
        : current - info.width * info.channels;
      let difference = 0;
      for (let channel = 0; channel < Math.min(3, info.channels); channel += 1) {
        difference += Math.abs(data[current + channel] - data[previous + channel]);
      }
      difference /= Math.min(3, info.channels);
      total += difference;
      if (difference >= 30) strongPixels += 1;
    }
    transitions.push({
      position,
      mean: total / span,
      coverage: strongPixels / span,
    });
  }
  return transitions;
}

function axisDetail(data, info, axis) {
  const length = axis === "vertical" ? info.width : info.height;
  const span = axis === "vertical" ? info.height : info.width;
  const detail = [];
  for (let position = 0; position < length; position += 1) {
    let total = 0;
    for (let offset = 1; offset < span; offset += 1) {
      const current = axis === "vertical"
        ? (offset * info.width + position) * info.channels
        : (position * info.width + offset) * info.channels;
      const previous = axis === "vertical"
        ? current - info.width * info.channels
        : current - info.channels;
      total += Math.abs(data[current] - data[previous]);
    }
    detail.push(total / Math.max(1, span - 1));
  }
  return detail;
}

function averageRange(values, start, end) {
  const range = values.slice(Math.max(0, start), Math.min(values.length, end));
  return range.reduce((total, value) => total + value, 0) / Math.max(1, range.length);
}

function layoutSeams(data, info, axis) {
  const transitions = axisTransitions(data, info, axis);
  const detail = axisDetail(data, info, axis);
  const baseline = transitions.reduce((total, item) => total + item.mean, 0)
    / Math.max(1, transitions.length);
  const window = Math.max(3, Math.round(detail.length * 0.08));
  const candidates = transitions.filter(item => {
    const ratio = item.position / detail.length;
    if (ratio < 0.12 || ratio > 0.88) return false;
    if (item.mean < Math.max(25, baseline * 1.65) || item.coverage < 0.35) return false;
    const before = averageRange(detail, item.position - window, item.position);
    const after = averageRange(detail, item.position, item.position + window);
    item.sideDetail = Math.min(before, after);
    return item.sideDetail >= 5;
  });
  const peaks = candidates.filter(item => {
    const transitionIndex = item.position - 1;
    return item.mean >= (transitions[transitionIndex - 1]?.mean || 0)
      && item.mean >= (transitions[transitionIndex + 1]?.mean || 0);
  });
  return peaks.map(item => ({
    ...item,
    strongSceneJoin: item.mean >= 35
      && item.coverage >= 0.55
      && item.sideDetail >= 9.5,
  }));
}

function halfHashDistance(data, info, axis) {
  const width = axis === "vertical" ? Math.floor(info.width / 2) : info.width;
  const height = axis === "horizontal" ? Math.floor(info.height / 2) : info.height;
  const bits = [[], []];
  for (let half = 0; half < 2; half += 1) {
    const startX = axis === "vertical" ? half * width : 0;
    const startY = axis === "horizontal" ? half * height : 0;
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const sampleX = startX + Math.min(width - 1, Math.floor((x + 0.5) * width / 8));
        const nextX = startX + Math.min(width - 1, Math.floor((x + 1.5) * width / 8));
        const sampleY = startY + Math.min(height - 1, Math.floor((y + 0.5) * height / 8));
        const nextY = startY + Math.min(height - 1, Math.floor((y + 1.5) * height / 8));
        const current = (sampleY * info.width + sampleX) * info.channels;
        const next = axis === "vertical"
          ? (sampleY * info.width + nextX) * info.channels
          : (nextY * info.width + sampleX) * info.channels;
        bits[half].push(data[current] > data[next] ? 1 : 0);
      }
    }
  }
  let mismatches = 0;
  for (let index = 0; index < bits[0].length; index += 1) {
    if (bits[0][index] !== bits[1][index]) mismatches += 1;
  }
  return mismatches / bits[0].length;
}

function compositeSignals(hashData, hashInfo, layoutData, layoutInfo) {
  const vertical = [];
  const horizontal = [];
  for (let x = 1; x < hashInfo.width; x += 1) {
    let total = 0;
    for (let y = 0; y < hashInfo.height; y += 1) {
      total += Math.abs(
        hashData[(y * hashInfo.width + x) * hashInfo.channels]
        - hashData[(y * hashInfo.width + x - 1) * hashInfo.channels],
      );
    }
    vertical.push(total / hashInfo.height);
  }
  for (let y = 1; y < hashInfo.height; y += 1) {
    let total = 0;
    for (let x = 0; x < hashInfo.width; x += 1) {
      total += Math.abs(
        hashData[(y * hashInfo.width + x) * hashInfo.channels]
        - hashData[((y - 1) * hashInfo.width + x) * hashInfo.channels],
      );
    }
    horizontal.push(total / hashInfo.width);
  }
  const edges = [...vertical, ...horizontal];
  const baseline = edges.reduce((total, value) => total + value, 0) / Math.max(1, edges.length);
  const threshold = Math.max(34, baseline * 2.6);
  const seamCount = separatedPeaks(vertical, threshold).length
    + separatedPeaks(horizontal, threshold).length;
  const maximum = Math.max(0, ...edges);
  const dominance = maximum / Math.max(1, baseline);
  const legacyScore = Math.max(0, Math.min(1,
    (Math.max(0, seamCount - 1) * 0.24)
    + (Math.max(0, dominance - 2.5) * 0.12),
  ));
  const verticalLayoutSeams = layoutSeams(layoutData, layoutInfo, "vertical");
  const horizontalLayoutSeams = layoutSeams(layoutData, layoutInfo, "horizontal");
  const verticalSceneJoins = verticalLayoutSeams.filter(item => item.strongSceneJoin);
  const horizontalSceneJoins = horizontalLayoutSeams.filter(item => item.strongSceneJoin);
  const sceneJoinCount = verticalSceneJoins.length + horizontalSceneJoins.length;
  const horizontalSceneJoinGroups = horizontalSceneJoins
    .filter(item => item.position / layoutInfo.height >= 0.15
      && item.position / layoutInfo.height <= 0.85)
    .reduce((groups, item) => {
      const position = item.position / layoutInfo.height;
      if (!groups.length || position - groups[groups.length - 1] > 0.08) groups.push(position);
      return groups;
    }, []);
  const repeatedPanelDistance = Math.min(
    halfHashDistance(layoutData, layoutInfo, "horizontal"),
    halfHashDistance(layoutData, layoutInfo, "vertical"),
  );
  const repeatedPanelLayout = seamCount >= 2 && repeatedPanelDistance <= 0.42;
  const layoutScore = verticalSceneJoins.length > 0 || horizontalSceneJoinGroups.length >= 2
    ? 0.86
    : repeatedPanelLayout
      ? 0.72
      : 0;
  const score = Math.max(legacyScore, layoutScore);
  return {
    compositeScore: Number(score.toFixed(4)),
    singleFrameRatio: Number((1 - score).toFixed(4)),
    seamCount,
    layoutSeamCount: verticalLayoutSeams.length + horizontalLayoutSeams.length,
    sceneJoinCount,
    verticalSceneJoinPositions: verticalSceneJoins.map(item =>
      Number((item.position / layoutInfo.width).toFixed(3))),
    horizontalSceneJoinPositions: horizontalSceneJoins.map(item =>
      Number((item.position / layoutInfo.height).toFixed(3))),
    repeatedPanelDistance: Number(repeatedPanelDistance.toFixed(4)),
  };
}

export async function fetchImageBuffer(url) {
  return fetchSafeImage(url);
}

export async function fingerprintImage(buffer) {
  const image = sharp(buffer, { failOn: "error" }).rotate();
  const metadata = await image.metadata();
  const { data, info } = await image
    .clone()
    .grayscale()
    .resize(HASH_WIDTH, HASH_HEIGHT, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const layoutWidth = metadata.width >= metadata.height
    ? COMPOSITE_SAMPLE_SIZE
    : Math.max(48, Math.round(COMPOSITE_SAMPLE_SIZE * metadata.width / metadata.height));
  const layoutHeight = metadata.height > metadata.width
    ? COMPOSITE_SAMPLE_SIZE
    : Math.max(48, Math.round(COMPOSITE_SAMPLE_SIZE * metadata.height / metadata.width));
  const { data: layoutData, info: layoutInfo } = await image
    .clone()
    .resize(layoutWidth, layoutHeight, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const differences = new Uint8Array(SAMPLE_SIZE);
  let edgeDetail = 0;
  let offset = 0;
  for (let y = 0; y < HASH_HEIGHT; y += 1) {
    for (let x = 0; x < HASH_WIDTH - 1; x += 1) {
      const left = data[(y * info.width + x) * info.channels];
      const right = data[(y * info.width + x + 1) * info.channels];
      edgeDetail += Math.abs(left - right);
      differences[offset] = left > right ? 1 : 0;
      offset += 1;
    }
  }

  const area = (metadata.width || 0) * (metadata.height || 0);
  const sharpness = edgeDetail / SAMPLE_SIZE;
  const composite = compositeSignals(data, info, layoutData, layoutInfo);
  return {
    digest: createHash("sha256").update(buffer).digest("hex"),
    differences,
    sharpness,
    quality: Math.log2(area + 1) * 10 + sharpness,
    width: metadata.width || 0,
    height: metadata.height || 0,
    ...composite,
  };
}

export function hasCompositeVisualSignals(fingerprint) {
  const visualScore = Number(fingerprint?.compositeScore) || 0;
  const singleFrameRatio = Number.isFinite(fingerprint?.singleFrameRatio)
    ? Number(fingerprint.singleFrameRatio)
    : 1 - visualScore;
  return visualScore >= VISUAL_COMPOSITE_SCORE_THRESHOLD
    || singleFrameRatio < MIN_SINGLE_FRAME_RATIO;
}

export function perceptualDistance(left, right) {
  if (left.digest === right.digest) return 0;
  let mismatches = 0;
  for (let i = 0; i < left.differences.length; i += 1) {
    if (left.differences[i] !== right.differences[i]) mismatches += 1;
  }
  return mismatches / left.differences.length;
}

export function isNearDuplicate(left, right) {
  return perceptualDistance(left, right) <= 0.085;
}

/**
 * Legacy display selector retained for older callers. Daily Vibe Atlas selection now
 * uses grid-curation.js, which keeps perceptual relationships available until it has
 * classified the board as Event or Compiled.
 *
 * Candidates are considered in ranked order, but a later higher-quality copy replaces
 * a blurrier copy in-place. Pixel comparison failures fail open for this compatibility
 * helper; the Daily Drop's server-side curation path fails closed for unusable images.
 */
export async function selectDisplayResults(
  rankedBatches,
  {
    limit = 9,
    candidateLimit = DEFAULT_CANDIDATE_LIMIT,
    loadBuffer = fetchImageBuffer,
  } = {},
) {
  const candidates = [];
  for (const batch of rankedBatches || []) {
    for (const result of batch.results || []) {
      if (!result.thumbnail) continue;
      candidates.push({ ...result, batchKey: result.batchKey || batch.query });
      if (candidates.length >= candidateLimit) break;
    }
    if (candidates.length >= candidateLimit) break;
  }

  const analyzed = await Promise.all(candidates.map(async (result) => {
    try {
      const buffer = await loadBuffer(result.thumbnail, result);
      return { result, fingerprint: await fingerprintImage(buffer) };
    } catch {
      return { result, fingerprint: null };
    }
  }));

  const selected = [];
  const seenUrls = new Map();
  for (const candidate of analyzed) {
    const exactIndex = seenUrls.get(candidate.result.thumbnail);
    let duplicateIndex = exactIndex;

    if (duplicateIndex === undefined && candidate.fingerprint) {
      duplicateIndex = selected.findIndex(
        (existing) => existing.fingerprint
          && isNearDuplicate(existing.fingerprint, candidate.fingerprint),
      );
      if (duplicateIndex < 0) duplicateIndex = undefined;
    }

    if (duplicateIndex === undefined) {
      seenUrls.set(candidate.result.thumbnail, selected.length);
      selected.push(candidate);
      continue;
    }

    const existing = selected[duplicateIndex];
    if (
      candidate.fingerprint
      && (!existing.fingerprint || candidate.fingerprint.quality > existing.fingerprint.quality)
    ) {
      seenUrls.delete(existing.result.thumbnail);
      selected[duplicateIndex] = candidate;
      seenUrls.set(candidate.result.thumbnail, duplicateIndex);
    }
  }

  return selected.slice(0, limit).map(({ result }) => result);
}
