import { createHash } from "node:crypto";
import sharp from "sharp";
import { fetchSafeImage } from "./canonical-render.js";

const HASH_WIDTH = 17;
const HASH_HEIGHT = 16;
const SAMPLE_SIZE = HASH_HEIGHT * (HASH_WIDTH - 1);
const DEFAULT_CANDIDATE_LIMIT = 18;

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
  return {
    digest: createHash("sha256").update(buffer).digest("hex"),
    differences,
    sharpness,
    quality: Math.log2(area + 1) * 10 + sharpness,
    width: metadata.width || 0,
    height: metadata.height || 0,
  };
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
