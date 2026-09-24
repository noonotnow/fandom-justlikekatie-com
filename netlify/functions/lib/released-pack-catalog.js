import { ACTOR_PACKS } from "./actor-packs.js";
import { getEligibility, isApproved } from "./actor-eligibility.js";
import {
  isGridManifest,
  readPublicationManifests,
  PUBLIC_VIBE_ATLAS_ORIGIN,
} from "./publication-manifest.js";

export const RELEASED_PACK_PATH = "/vibe-atlas/packs";

function slug(value) {
  return String(value || "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "vibe";
}

export function releasedPackActorSlug(actor) {
  return slug(actor?.shortName_en || actor?.nameEn || actor?.shortName || actor?.name || actor?.id);
}

export function releasedPackVibeSlug(actor, vibe, vibeIdx) {
  return `${slug(vibe?.label_en || vibe?.label || `${actor?.id}-${vibeIdx}`)}-${vibeIdx}`;
}

export function releasedPackPath(actor, vibe, vibeIdx) {
  return `${RELEASED_PACK_PATH}/${releasedPackActorSlug(actor)}/${releasedPackVibeSlug(actor, vibe, vibeIdx)}/`;
}

function safeManifest(manifest) {
  if (!isGridManifest(manifest) || !Array.isArray(manifest.cards) || manifest.cards.length !== 9) return null;
  const copy = manifest.vibe?.supportingCopyEn || manifest.vibe?.supportingCopy;
  if (typeof copy !== "string" || copy.trim().length < 40) return null;
  if (!manifest.vibe?.labelEn?.trim() || !manifest.vibe?.subtitleEn?.trim()) return null;
  const cards = manifest.cards.map(card => ({
    position: card.position,
    title: typeof card.title === "string" ? card.title : "",
    source: typeof card.source === "string" ? card.source : "",
    link: typeof card.link === "string" && card.link.startsWith("https://") ? card.link : null,
    thumbnailUrl: card.media?.thumbnailUrl || null,
    deliveryUrl: card.media?.deliveryUrl || null,
    mimeType: card.media?.mimeType || null,
    dimensions: card.media?.dimensions || null,
  }));
  if (cards.some(card => !card.thumbnailUrl || !card.deliveryUrl)) return null;
  return { copy: copy.trim(), cards };
}

export function isIndexableReleasedPack(pack) {
  return Boolean(
    pack?.canonical
    && pack?.preview
    && typeof pack.preview.copy === "string"
    && Array.isArray(pack.preview.cards)
    && pack.preview.cards.length === 9,
  );
}

export function publicReleasedPack(pack) {
  if (!isIndexableReleasedPack(pack)) return null;
  return {
    kind: "vibe-atlas-released-pack",
    actor: pack.actor,
    vibe: pack.vibe,
    vibeIdx: pack.vibeIdx,
    canonical: pack.canonical,
    preview: pack.preview,
    publishedAt: pack.publishedAt,
  };
}

/**
 * The protected released-pack library follows the exact predicate used by the
 * Star of the Day scheduler. Public indexing is a narrower projection: a pack
 * is indexable only when an immutable publication manifest supplies verified
 * MEDIA previews. This keeps an unavailable or not-yet-published preview from
 * hiding an otherwise eligible pack from Collectors.
 */
export async function releasedPackCatalog(
  eligibilityStore,
  {
    publicationStore = eligibilityStore,
    actorPacks = ACTOR_PACKS,
    origin = PUBLIC_VIBE_ATLAS_ORIGIN,
    getEligibilitySnapshot = getEligibility,
    eligibilityPredicate = isApproved,
    readPublications = readPublicationManifests,
  } = {},
) {
  let manifests = [];
  let indexingComplete = false;
  let indexingFailureReason = null;
  try {
    const inventory = await readPublications(publicationStore);
    if (inventory.inventory.complete) {
      manifests = inventory.manifests.filter(isGridManifest);
      indexingComplete = true;
    } else {
      indexingFailureReason = "publication_inventory_incomplete";
    }
  } catch {
    indexingFailureReason = "publication_inventory_unavailable";
  }

  const packs = [];
  const collectorPackIds = new Set();
  let eligibilityHealthy = true;
  await Promise.all(actorPacks.map(async actor => {
    await Promise.all((actor.vibes || []).map(async (vibe, vibeIdx) => {
      let snapshot;
      try {
        snapshot = await getEligibilitySnapshot(eligibilityStore, actor, vibeIdx);
      } catch {
        eligibilityHealthy = false;
        return;
      }
      if (!eligibilityPredicate(snapshot)) return;
      collectorPackIds.add(`${actor.id}:${vibeIdx}`);
      const manifest = manifests
        .filter(item => item.actor?.id === actor.id && item.vibe?.idx === vibeIdx)
        .sort((left, right) => String(right.publicationDate).localeCompare(String(left.publicationDate)))[0];
      const preview = safeManifest(manifest);
      if (!preview) return;
      const path = releasedPackPath(actor, vibe, vibeIdx);
      packs.push({
        actorId: actor.id,
        vibeIdx,
        canonical: `${origin}${path}`,
        actor: {
          id: actor.id,
          name: actor.name,
          nameEn: actor.shortName_en || actor.shortName || actor.name,
          accentColor: actor.accentColor || null,
        },
        vibe: {
          key: `${actor.id}:${vibeIdx}`,
          label: vibe.label || vibe.label_en || "",
          labelEn: vibe.label_en || vibe.label || "",
          emoji: vibe.emoji || null,
          subtitleEn: vibe.subtitle_en || vibe.subtitle || "",
        },
        preview,
        publishedAt: manifest.publishedAt || null,
        runId: snapshot.runId,
      });
    }));
  }));
  if (!eligibilityHealthy) {
    return {
      schemaVersion: 1,
      complete: false,
      failureReason: "eligibility_unavailable",
      indexingComplete,
      indexingFailureReason,
      packs: [],
    };
  }
  packs.sort((a, b) => a.canonical.localeCompare(b.canonical));
  return {
    schemaVersion: 1,
    complete: true,
    indexingComplete,
    indexingFailureReason,
    collectorPackIds: [...collectorPackIds].sort(),
    packs,
  };
}

export function protectedReleasedPackIds(catalog) {
  if (Array.isArray(catalog?.collectorPackIds)) {
    return new Set(catalog.collectorPackIds);
  }
  return new Set((catalog?.packs || []).map(pack => `${pack.actorId}:${pack.vibeIdx}`));
}

export const buildReleasedPackCatalog = releasedPackCatalog;
export const releasedPackPreview = publicReleasedPack;
