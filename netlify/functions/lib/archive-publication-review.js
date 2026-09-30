import { createHash } from "node:crypto";
import { gridManifestKey, isGridManifest, isIndexablePublicationManifest } from "./publication-manifest.js";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
// MEDIA registration uses media.justlikekatie.com; its immutable delivery CDN
// also serves content-addressed images from images.xhs.justlikekatie.com.
const MEDIA_ORIGINS = new Set([
  "https://media.justlikekatie.com",
  "https://images.xhs.justlikekatie.com",
]);
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Private editorial view of the canonical publication record. Archive cache
 * payloads and Collection images are intentionally not accepted as evidence.
 */
export async function reviewArchivedPublication(store, date, {
  checkMedia = false,
  fetchImpl = fetch,
} = {}) {
  const manifest = await store.get(gridManifestKey(date), {
    type: "json", consistency: "strong",
  });
  if (!manifest) return { date, status: "missing_manifest" };
  if (!isGridManifest(manifest) || manifest.publicationDate !== date) {
    return { date, status: "malformed_manifest" };
  }
  const review = {
    date,
    status: isIndexablePublicationManifest(manifest) ? "indexable" : "not_indexable",
    indexable: isIndexablePublicationManifest(manifest),
    actor: { name: manifest.actor.name, nameEn: manifest.actor.nameEn },
    vibe: {
      labelEn: manifest.vibe.labelEn,
      subtitleEn: manifest.vibe.subtitleEn || "",
      supportingCopyEn: manifest.vibe.supportingCopyEn || manifest.vibe.supportingCopy || "",
    },
    cards: manifest.cards.map(card => ({
      position: card.position,
      title: card.title,
      media: {
        deliveryUrl: card.media.deliveryUrl,
        thumbnailUrl: card.media.thumbnailUrl,
      },
    })),
  };
  if (checkMedia) {
    // Bound each streamed read. Check all nine in parallel so one slow MEDIA
    // delivery cannot push the admin request beyond the function time budget.
    review.mediaChecks = await Promise.all(manifest.cards.map(card =>
      checkDelivery(card, fetchImpl)));
  }
  return review;
}

async function checkDelivery(card, fetchImpl) {
  const media = card.media;
  const result = status => ({ position: card.position, status });
  let url;
  try {
    url = new URL(media.deliveryUrl);
    const plain = /^\/images\/sha256\/([a-f0-9]{64})\.(?:jpg|jpeg|png|webp)$/i.exec(url.pathname);
    const sharded = /^\/images\/sha256\/([a-f0-9]{2})\/([a-f0-9]{2})\/([a-f0-9]{64})\.(?:jpg|jpeg|png|webp)$/i.exec(url.pathname);
    const pathChecksum = plain?.[1] || sharded?.[3];
    if (!MEDIA_ORIGINS.has(url.origin) || url.username || url.password
      || url.search || url.hash || !pathChecksum
      || pathChecksum.toLowerCase() !== media.checksum.toLowerCase()
      || (sharded && (sharded[1].toLowerCase() !== pathChecksum.slice(0, 2).toLowerCase()
        || sharded[2].toLowerCase() !== pathChecksum.slice(2, 4).toLowerCase()))) {
      return result("untrusted_delivery");
    }
  } catch {
    return result("untrusted_delivery");
  }
  try {
    const response = await fetchImpl(url.href, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok || response.status !== 200) return result("unavailable");
    const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (type !== media.mimeType || !TYPES.has(type)) return result("wrong_type");
    const length = Number(response.headers.get("content-length"));
    if (response.headers.has("content-length")
      && (!Number.isSafeInteger(length) || length > MAX_IMAGE_BYTES || length !== media.sizeBytes)) {
      return result("wrong_size");
    }
    if (!response.body) return result("unavailable");
    const reader = response.body.getReader();
    const digest = createHash("sha256");
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_IMAGE_BYTES || size > media.sizeBytes) {
          await reader.cancel();
          return result("wrong_size");
        }
        digest.update(value);
      }
    } finally {
      reader.releaseLock();
    }
    if (size !== media.sizeBytes) return result("wrong_size");
    return result(digest.digest("hex").toLowerCase() === media.checksum.toLowerCase()
      ? "verified" : "checksum_mismatch");
  } catch {
    return result("unavailable");
  }
}