import { getBlobStore } from "./lib/blob-store.js";
import { PUBLIC_VIBE_ATLAS_ORIGIN, publicActorDirectory, readPublicationManifests } from "./lib/publication-manifest.js";
import { PUBLIC_STATIC_PATHS } from "./lib/public-routes.js";
import { ACTOR_PACKS } from "./lib/actor-packs.js";
import { ELIGIBILITY_STORE } from "./lib/actor-eligibility.js";
import { isIndexableReleasedPack, releasedPackCatalog } from "./lib/released-pack-catalog.js";
import { releasedPackActorSlug, RELEASED_PACK_PATH } from "./lib/released-pack-catalog.js";

const xmlEscape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

export function sitemapXml(paths) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${xmlEscape(PUBLIC_VIBE_ATLAS_ORIGIN + path)}</loc></url>`).join("")}</urlset>`;
}

export function createPublicSitemapHandler({
  getStore = getBlobStore,
  actorPacks = ACTOR_PACKS,
  eligibilityStoreName = ELIGIBILITY_STORE,
  buildReleaseCatalog = releasedPackCatalog,
} = {}) {
  return async (_request, context) => {
    const { manifests, inventory } = await readPublicationManifests(getStore("star-of-day", context));
    if (!inventory.complete) return { statusCode: 503, headers: { "Content-Type": "application/xml", "Cache-Control": "no-store" }, body: "" };
    const releaseCatalog = await buildReleaseCatalog(
      getStore(eligibilityStoreName, context),
      { publicationStore: getStore("star-of-day", context), actorPacks },
    );
    if (!releaseCatalog.complete || !releaseCatalog.indexingComplete) return { statusCode: 503, headers: { "Content-Type": "application/xml", "Cache-Control": "no-store" }, body: "" };
    const indexablePacks = releaseCatalog.packs.filter(isIndexableReleasedPack);
    const actors = publicActorDirectory(manifests);
    const paths = [...PUBLIC_STATIC_PATHS,
      ...actors.flatMap(actor => [actor.path, ...actor.editions.map(edition => edition.path)]),
      ...[...new Set(indexablePacks.map(pack =>
        `${RELEASED_PACK_PATH}/${releasedPackActorSlug(pack.actor)}/`))],
      ...indexablePacks.map(pack => new URL(pack.canonical).pathname)];
    return { statusCode: 200, headers: { "Content-Type": "application/xml", "Cache-Control": "no-store" }, body: sitemapXml([...new Set(paths)]) };
  };
}

export const handler = createPublicSitemapHandler();
export default handler;
