import { getBlobStore } from "./lib/blob-store.js";
import { ACTOR_PACKS } from "./lib/actor-packs.js";
import { ELIGIBILITY_STORE } from "./lib/actor-eligibility.js";
import { publicReleasedPack, releasedPackCatalog } from "./lib/released-pack-catalog.js";
import { resolveDailyPackSnapshot } from "./lib/daily-pack-snapshot.js";

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

// Only project the public catalog. A daily search result is not a publication.
export function createPublicReleasedPackPreviewHandler({
  getStore = getBlobStore,
  actorPacks = ACTOR_PACKS,
  buildCatalog = releasedPackCatalog,
  resolveSnapshot = resolveDailyPackSnapshot,
} = {}) {
  return async (request, context) => {
    if (request.method && request.method !== "GET") {
      return json(405, { error: "Method not allowed." });
    }
    const url = new URL(request.url);
    const actorId = url.searchParams.get("actorId");
    const vibeIdx = url.searchParams.get("vibeIdx");
    const actor = actorPacks.find(item => item.id === actorId);
    if (!actor || !/^(0|[1-9]\d*)$/.test(vibeIdx || "")
      || !actor.vibes?.[Number(vibeIdx)]) {
      return json(404, { status: "unpublished" });
    }
    try {
      const catalog = await buildCatalog(getStore(ELIGIBILITY_STORE, context), {
        publicationStore: getStore("star-of-day", context),
        actorPacks,
      });
      if (!catalog.complete || catalog.indexingComplete === false) {
        return json(503, { status: "unavailable" });
      }
      const pack = catalog.packs.find(item =>
        item.actorId === actorId && item.vibeIdx === Number(vibeIdx));
      const preview = publicReleasedPack(pack);
      const date = url.searchParams.get("date");
      if (!date && preview) return json(200, preview);
      if (date && pack?.publicationDate === date && preview) return json(200, preview);
      // The daily snapshot may have nine immutable MEDIA cards even when its
      // editorial record lacks enough copy to become a permanent public page.
      // Never project an unmaterialized search result into this endpoint.
      if (!date) return json(404, { status: "unpublished" });
      const snapshot = await resolveSnapshot({
        store: getStore("star-of-day", context),
        eligibilityStore: getStore(ELIGIBILITY_STORE, context),
        date,
        actorId,
        vibeIdx: Number(vibeIdx),
        packs: actorPacks,
      });
      return snapshot ? json(200, snapshot) : json(404, { status: "unpublished" });
    } catch (error) {
      console.error("[public-released-pack-preview] catalog unavailable", error);
      return json(503, { status: "unavailable" });
    }
  };
}

export default async function publicReleasedPackPreview(request, context) {
  const result = await createPublicReleasedPackPreviewHandler()(request, context);
  return new Response(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}