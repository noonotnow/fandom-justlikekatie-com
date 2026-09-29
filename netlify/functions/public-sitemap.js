import { getBlobStore } from "./lib/blob-store.js";
import { PUBLIC_VIBE_ATLAS_ORIGIN, publicActorDirectory, readPublicationManifests, readPublicationReleaseDates, verifyPublicationReleaseEvidence } from "./lib/publication-manifest.js";
import { PUBLIC_STATIC_PATHS } from "./lib/public-routes.js";
import { ACTOR_PACKS } from "./lib/actor-packs.js";
import { ELIGIBILITY_STORE } from "./lib/actor-eligibility.js";
import { isIndexableReleasedPack, releasedPackCatalog } from "./lib/released-pack-catalog.js";
import { releasedPackActorSlug, RELEASED_PACK_PATH } from "./lib/released-pack-catalog.js";

const xmlEscape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

export function sitemapXml(paths) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${xmlEscape(PUBLIC_VIBE_ATLAS_ORIGIN + path)}</loc></url>`).join("")}</urlset>`;
}

function sitemapResponse(paths, inventoryStatus = "complete") {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "no-store",
      "X-Public-Sitemap-Inventory": inventoryStatus,
    },
    body: sitemapXml([...new Set(paths)]),
  };
}

export function createPublicSitemapHandler({
  getStore = getBlobStore,
  actorPacks = ACTOR_PACKS,
  eligibilityStoreName = ELIGIBILITY_STORE,
  buildReleaseCatalog = releasedPackCatalog,
  logError = console.error,
} = {}) {
  return async (_request, context) => {
    try {
      const publicationStore = getStore("star-of-day", context);
      const { manifests, catalogDates, inventory } = await readPublicationManifests(publicationStore);
      if (!inventory.complete) return sitemapResponse(PUBLIC_STATIC_PATHS, "publication-incomplete");
      const releaseHistory = await readPublicationReleaseDates(publicationStore);
      if (!releaseHistory?.verifiedBaseline) {
        return sitemapResponse(PUBLIC_STATIC_PATHS, "release-history-unavailable");
      }
      const currentDates = new Set(catalogDates);
      if (releaseHistory?.dates.some(date => !currentDates.has(date))) {
        return sitemapResponse(PUBLIC_STATIC_PATHS, "publication-history-mismatch");
      }
      if (!await verifyPublicationReleaseEvidence(
        publicationStore, releaseHistory, catalogDates, manifests,
      )) {
        return sitemapResponse(PUBLIC_STATIC_PATHS, "release-history-unavailable");
      }

      const releaseCatalog = await buildReleaseCatalog(
        getStore(eligibilityStoreName, context),
        { publicationStore, actorPacks },
      );
      if (!releaseCatalog.complete || releaseCatalog.indexingComplete === false) {
        return sitemapResponse(PUBLIC_STATIC_PATHS, "release-catalog-incomplete");
      }

      const indexablePacks = releaseCatalog.packs.filter(isIndexableReleasedPack);
      const actors = publicActorDirectory(manifests);
      const paths = [
        ...PUBLIC_STATIC_PATHS,
        ...actors.flatMap(actor => [actor.path, ...actor.editions.map(edition => edition.path)]),
        ...[...new Set(indexablePacks.map(pack =>
          `${RELEASED_PACK_PATH}/${releasedPackActorSlug(pack.actor)}/`))],
        ...indexablePacks.map(pack => new URL(pack.canonical).pathname),
      ];
      return sitemapResponse(paths);
    } catch (error) {
      logError("Dynamic sitemap inventory unavailable; serving static routes", error);
      return sitemapResponse(PUBLIC_STATIC_PATHS, "unavailable");
    }
  };
}
// Use the V2 entrypoint so Netlify injects context.blobs. A named `handler`
// selects the classic runtime, which has no automatic Blobs credentials.
export default async function publicSitemap(request, context) {
  const result = await createPublicSitemapHandler()(request, context);
  return new Response(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}
