import { json } from "./public-auth.js";
import { getBlobStore } from "./blob-store.js";
import { ACTOR_PACKS } from "./actor-packs.js";
import { ELIGIBILITY_STORE, getEligibility, isReleaseReady } from "./actor-eligibility.js";
import { publicReleasedPack, releasedPackCatalog } from "./released-pack-catalog.js";

const PUBLIC_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

function projectPreviewCard(card) {
  return {
    position: card.position,
    title: card.title,
    source: card.source,
    thumbnailUrl: card.thumbnailUrl,
    deliveryUrl: card.deliveryUrl,
    link: card.link,
  };
}

function releasedFallbackPack(actorPacks, actorId, vibeIdx) {
  const actor = actorPacks.find(item => item?.id === actorId);
  const vibe = actor?.vibes?.find(item => item?.vibeIdx === vibeIdx);
  if (!actor || !vibe) return null;
  return {
    actor: {
      id: actor.id,
      name: actor.name || actor.shortName_en || actor.id,
      nameEn: actor.shortName_en || actor.name || actor.id,
    },
    vibe: {
      emoji: vibe.emoji || null,
      label: vibe.label || vibe.label_en || "",
      labelEn: vibe.label_en || vibe.label || "",
      subtitle: vibe.subtitle || vibe.subtitle_en || "",
      subtitleEn: vibe.subtitle_en || vibe.subtitle || "",
    },
    vibeIdx,
    preview: {
      copy: "This released Vibe Pack is available to Collectors now. Public teaser images are being prepared.",
      cards: [],
    },
  };
}

export function createReleasedPackPreviewHandler({
  getStore = getBlobStore,
  actorPacks = ACTOR_PACKS,
  eligibilityStoreName = ELIGIBILITY_STORE,
  buildReleaseCatalog = releasedPackCatalog,
  getEligibilitySnapshot = getEligibility,
  releaseEligibilityPredicate = isReleaseReady,
} = {}) {
  return async (req, context) => {
    if (req.method !== "GET") {
      return json(405, { error: "Method not allowed." }, { Allow: "GET", ...NO_STORE_HEADERS });
    }

    const url = new URL(req.url);
    const actorId = url.searchParams.get("actorId");
    const vibeValue = url.searchParams.get("vibeIdx");
    const vibeIdx = Number(vibeValue);
    if (!actorId || vibeValue === null || !Number.isInteger(vibeIdx) || vibeIdx < 0) {
      return json(400, { error: "Valid actorId and vibeIdx are required." }, NO_STORE_HEADERS);
    }

    const catalog = await buildReleaseCatalog(
      getStore(eligibilityStoreName, context),
      { publicationStore: getStore("star-of-day", context), actorPacks },
    );
    if (!catalog.complete) {
      return json(503, {
        error: "Released pack preview is temporarily unavailable.",
        reasonCode: catalog.failureReason || "catalog_unavailable",
      }, NO_STORE_HEADERS);
    }

    const pack = catalog.packs.find(item => item.actorId === actorId && item.vibeIdx === vibeIdx);
    const publicPack = pack ? publicReleasedPack(pack) : null;
    if (publicPack) {
      return json(200, {
        schemaVersion: 1,
        kind: "vibe-atlas-released-pack-preview",
        pack: {
          ...publicPack,
          preview: {
            copy: publicPack.preview.copy,
            cards: publicPack.preview.cards.slice(0, 3).map(projectPreviewCard),
          },
        },
      }, PUBLIC_HEADERS);
    }

    const actor = actorPacks.find(item => item?.id === actorId);
    const vibe = actor?.vibes?.find(item => item?.vibeIdx === vibeIdx);
    if (!actor || !vibe) {
      return json(404, { error: "Released pack preview not found." }, NO_STORE_HEADERS);
    }

    let snapshot;
    try {
      snapshot = await getEligibilitySnapshot(getStore(eligibilityStoreName, context), actor, vibeIdx);
    } catch {
      return json(503, {
        error: "Released pack preview is temporarily unavailable.",
        reasonCode: "eligibility_unavailable",
      }, NO_STORE_HEADERS);
    }
    if (!releaseEligibilityPredicate(snapshot)) {
      return json(404, { error: "Released pack preview not found." }, NO_STORE_HEADERS);
    }

    const responsePack = releasedFallbackPack(actorPacks, actorId, vibeIdx);
    if (!responsePack) {
      return json(404, { error: "Released pack preview not found." }, NO_STORE_HEADERS);
    }
    return json(200, {
      schemaVersion: 1,
      kind: "vibe-atlas-released-pack-preview",
      pack: {
        ...responsePack,
        preview: {
          copy: responsePack.preview.copy,
          cards: responsePack.preview.cards.slice(0, 3).map(projectPreviewCard),
        },
      },
    }, PUBLIC_HEADERS);
  };
}
