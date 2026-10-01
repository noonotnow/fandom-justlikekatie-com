import { gridManifestKey, isGridManifest } from "./publication-manifest.js";
import { publicArchiveGrid } from "./public-archive-inventory.js";

/**
 * Individual acquisition follows the immutable public Daily Drop board, not
 * editorial indexability. Only the publication namespace can grant access:
 * caches, private audit boards, pending receipts and client URLs are not proof.
 * This is a bounded, read-only lookup; missing evidence never triggers recovery.
 */
export async function readDailyAcquisitionManifest(store, date) {
  let manifest;
  try {
    manifest = await store.get(gridManifestKey(date), {
      type: "json",
      consistency: "strong",
    });
  } catch {
    return { status: "unavailable" };
  }
  if (!manifest) return { status: "missing" };
  if (manifest.publicationDate !== date || !isGridManifest(manifest)) {
    return { status: "invalid" };
  }
  return {
    status: "available",
    manifest,
    // Optional and still subject to the unchanged editorial publication gate.
    edition: publicArchiveGrid(manifest),
  };
}