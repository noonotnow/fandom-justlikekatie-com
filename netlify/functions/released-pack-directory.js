import { getBlobStore } from "./lib/blob-store.js";
import { ELIGIBILITY_STORE } from "./lib/actor-eligibility.js";
import { publicReleasedPack, releasedPackCatalog } from "./lib/released-pack-catalog.js";
import { json } from "./lib/public-auth.js";

export function createReleasedPackDirectoryHandler({
  getStore = getBlobStore,
  buildReleaseCatalog = releasedPackCatalog,
} = {}) {
  return async (request, context) => {
    if (request.method !== "GET") {
      return json(405, { error: "Method not allowed." }, { Allow: "GET" });
    }
    try {
      const catalog = await buildReleaseCatalog(
        getStore(ELIGIBILITY_STORE, context),
        { publicationStore: getStore("star-of-day", context) },
      );
      if (!catalog.complete || !catalog.indexingComplete) {
        return json(503, { error: "The public pack directory is temporarily unavailable." });
      }
      return json(200, {
        kind: "vibe-atlas-public-pack-directory",
        packs: catalog.packs.map(publicReleasedPack).filter(Boolean).map(pack => ({
          actor: pack.actor,
          vibe: pack.vibe,
          vibeIdx: pack.vibeIdx,
          canonical: pack.canonical,
          preview: {
            copy: pack.preview.copy,
            cards: pack.preview.cards.slice(0, 3).map(card => ({
              title: card.title,
              thumbnailUrl: card.thumbnailUrl,
              deliveryUrl: card.deliveryUrl,
            })),
          },
        })),
      }, { "Cache-Control": "public, max-age=300, s-maxage=3600" });
    } catch {
      return json(503, { error: "The public pack directory is temporarily unavailable." });
    }
  };
}

// Netlify Functions V2 requires a Web Request/Response default export.
export default createReleasedPackDirectoryHandler();