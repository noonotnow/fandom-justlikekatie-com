import { ACTOR_PACKS } from "./actor-packs.js";
import { getEligibility, isReleaseReady } from "./actor-eligibility.js";
import {
  isGridManifest,
  readPublicationManifests,
  PUBLIC_VIBE_ATLAS_ORIGIN,
} from "./publication-manifest.js";
import { isValidMediaReference } from "./media-asset.js";

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

export function inspectReleasedPackManifest(manifest) {
  if (!manifest) return { safe: null, reasonCode: "incomplete_inventory" };
  if (!isGridManifest(manifest) || !Array.isArray(manifest.cards) || manifest.cards.length !== 9) {
    return { safe: null, reasonCode: "malformed_media" };
  }
  const copy = manifest.vibe?.supportingCopyEn || manifest.vibe?.supportingCopy;
  if (
    typeof copy !== "string"
    || copy.trim().length < 40
    || !manifest.vibe?.labelEn?.trim()
    || !manifest.vibe?.subtitleEn?.trim()
  ) {
    return { safe: null, reasonCode: "missing_editorial_copy" };
  }
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
  if (cards.some(card => !card.thumbnailUrl || !card.deliveryUrl)) {
    return { safe: null, reasonCode: "malformed_media" };
  }
  const copyEn = typeof manifest.vibe.supportingCopyEn === "string"
    ? manifest.vibe.supportingCopyEn.trim()
    : "";
  const copyZhSource = typeof manifest.vibe.supportingCopy === "string"
    ? manifest.vibe.supportingCopy.trim()
    : "";
  const copyZh = /\p{Script=Han}/u.test(copyZhSource) ? copyZhSource : "";
  return {
    safe: {
      copy: copy.trim(),
      ...(copyEn ? { copyEn } : {}),
      ...(copyZh ? { copyZh } : {}),
      cards,
    },
    reasonCode: null,
  };
}
function safeManifest(manifest) {
  return inspectReleasedPackManifest(manifest).safe;
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

export function classifyReleasedPackHealth({
  inventoryComplete,
  eligibilityAvailable = true,
  releaseReady = false,
  manifest = null,
  malformedMedia = false,
}) {
  if (!eligibilityAvailable) return "eligibility_unavailable";
  if (!releaseReady) return "revoked_eligibility";
  if (malformedMedia) return "malformed_media";
  if (!inventoryComplete || !manifest) return "incomplete_inventory";
  return inspectReleasedPackManifest(manifest).reasonCode;
}

function hasMalformedPublicationMedia(manifest) {
  if (
    !manifest
    || !Array.isArray(manifest.cards)
    || manifest.cards.length !== 9
    || typeof manifest.publicationDate !== "string"
  ) return false;
  const associationId = `vibe-atlas:daily-drop:${manifest.publicationDate}`;
  return manifest.cards.some((card, position) => !isValidMediaReference(card?.media, {
    type: "publication",
    id: associationId,
    itemId: `card-${position}`,
  }));
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
 * Release state is intentionally recomputed from strong eligibility and the
 * complete immutable publication inventory. No cached eligibility projection
 * can keep a revoked pairing public. The protected released-pack library
 * follows the exact predicate used by the
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
    eligibilityReader = getEligibility,
    getEligibilitySnapshot = eligibilityReader,
    eligibilityPredicate = isReleaseReady,
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
      // Collector refreshes belong to the approved search recipe, not to the
      // existence of a public daily snapshot or editorial record.
      collectorPackIds.add(`${actor.id}:${vibeIdx}`);
      const pairingManifests = manifests
        .filter(item => item.actor?.id === actor.id && item.vibe?.idx === vibeIdx)
        .sort((left, right) => String(right.publicationDate).localeCompare(String(left.publicationDate)));
      if (!pairingManifests.length) return;
      const manifest = pairingManifests.find(item => safeManifest(item));
      if (!manifest) return;
      const safe = safeManifest(manifest);
      const path = releasedPackPath(actor, vibe, vibeIdx);
      packs.push({
        actorId: actor.id,
        vibeIdx,
        publicationDate: manifest.publicationDate,
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
          subtitle: vibe.subtitle || vibe.subtitle_en || "",
        },
        preview: safe,
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

const CATALOG_HEALTH_SUMMARIES = {
  released: "This pairing is present in the released library.",
  revoked_eligibility: "Current eligibility is not release-ready. A prior approval may have been revoked or superseded.",
  incomplete_inventory: "Publication inventory is incomplete or has no immutable edition for this pairing.",
  missing_editorial_copy: "The latest edition is missing substantive English editorial copy or required labels.",
  malformed_media: "The latest edition or one of its nine MEDIA references is malformed.",
  eligibility_unavailable: "Current eligibility could not be read, so the catalog failed closed.",
};
export function protectedReleasedPackIds(catalog) {
  if (Array.isArray(catalog?.collectorPackIds)) {
    return new Set(catalog.collectorPackIds);
  }
  return new Set((catalog?.packs || []).map(pack => `${pack.actorId}:${pack.vibeIdx}`));
}

export const buildReleasedPackCatalog = releasedPackCatalog;
export const releasedPackPreview = publicReleasedPack;

/**
 * Private operator diagnostics. This report must only be returned by an
 * admin-authenticated endpoint; public catalog records intentionally omit it.
 */
export async function releasedPackCatalogHealth(
  eligibilityStore,
  {
    publicationStore = eligibilityStore,
    actorPacks = ACTOR_PACKS,
    eligibilityReader = getEligibility,
  } = {},
) {
  let inventory;
  try {
    inventory = await readPublicationManifests(publicationStore);
  } catch {
    inventory = { inventory: { complete: false }, manifests: [] };
  }
  const manifests = inventory.manifests || [];
  const invalidCatalogManifests = inventory.invalidCatalogManifests || [];
  const pairingInputs = actorPacks.flatMap(actor =>
    (actor.vibes || []).map((vibe, vibeIdx) => ({
      actor,
      vibeIdx,
      base: {
        actorId: actor.id,
        actorName: actor.name,
        actorShortNameEn: actor.shortName_en || actor.shortName || actor.name,
        vibeIdx,
        vibeKey: `${actor.id}:${vibeIdx}`,
        vibeLabel: vibe.label_en || vibe.label || `${actor.id}:${vibeIdx}`,
      },
    })));
  const publicationState = pairingInputs.map(({ actor, vibeIdx, base }) => {
    const pairingManifests = manifests
      .filter(item => item.actor?.id === actor.id && item.vibe?.idx === vibeIdx)
      .sort((left, right) => String(right.publicationDate).localeCompare(String(left.publicationDate)));
    const manifest = pairingManifests.find(item => safeManifest(item)) || pairingManifests[0];
    const invalidCatalogManifest = invalidCatalogManifests
      .filter(item => item.actor?.id === actor.id && item.vibe?.idx === vibeIdx)
      .sort((left, right) => String(right.publicationDate).localeCompare(String(left.publicationDate)))[0];
    return { actor, vibeIdx, base, manifest, invalidCatalogManifest };
  });
  let pairings;
  if (inventory.inventory?.complete !== true) {
    pairings = publicationState.map(({ base, invalidCatalogManifest }) => {
      const reasonCode = hasMalformedPublicationMedia(invalidCatalogManifest)
        ? "malformed_media"
        : "incomplete_inventory";
      return {
        ...base,
        status: "withheld",
        reasonCode,
        summary: CATALOG_HEALTH_SUMMARIES[reasonCode],
        publicationDate: invalidCatalogManifest?.publicationDate || null,
      };
    });
  } else {
    const eligibilityStates = await Promise.all(publicationState.map(async state => {
      try {
        return {
          ...state,
          snapshot: await eligibilityReader(eligibilityStore, state.actor, state.vibeIdx),
          available: true,
        };
      } catch {
        return { ...state, snapshot: null, available: false };
      }
    }));
    const eligibilityHealthy = eligibilityStates.every(state => state.available);
    pairings = eligibilityStates.map(({ base, snapshot, manifest }) => {
      const reasonCode = eligibilityHealthy
        ? classifyReleasedPackHealth({
          inventoryComplete: true,
          releaseReady: isReleaseReady(snapshot),
          manifest,
        })
        : "eligibility_unavailable";
      return {
        ...base,
        status: reasonCode ? "withheld" : "released",
        reasonCode,
        summary: CATALOG_HEALTH_SUMMARIES[reasonCode || "released"],
        publicationDate: manifest?.publicationDate || null,
      };
    });
  }
  return {
    schemaVersion: 1,
    readOnly: true,
    inventoryComplete: inventory.inventory?.complete === true,
    releasedCount: pairings.filter(pair => pair.status === "released").length,
    withheldCount: pairings.filter(pair => pair.status === "withheld").length,
    pairings,
  };
}
