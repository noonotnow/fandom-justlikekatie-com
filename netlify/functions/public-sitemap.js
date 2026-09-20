import { getBlobStore } from "./lib/blob-store.js";
import { PUBLIC_VIBE_ATLAS_ORIGIN, publicActorDirectory, readPublicationManifests } from "./lib/publication-manifest.js";
import { PUBLIC_STATIC_PATHS } from "./lib/public-routes.js";

const xmlEscape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

export function sitemapXml(paths) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${xmlEscape(PUBLIC_VIBE_ATLAS_ORIGIN + path)}</loc></url>`).join("")}</urlset>`;
}

export function createPublicSitemapHandler({ getStore = getBlobStore } = {}) {
  return async (_request, context) => {
    const { manifests, inventory } = await readPublicationManifests(getStore("star-of-day", context));
    if (!inventory.complete) return { statusCode: 503, headers: { "Content-Type": "application/xml", "Cache-Control": "no-store" }, body: "" };
    const actors = publicActorDirectory(manifests);
    const paths = [...PUBLIC_STATIC_PATHS, ...actors.flatMap(actor => [actor.path, ...actor.editions.map(edition => edition.path)])];
    return { statusCode: 200, headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" }, body: sitemapXml([...new Set(paths)]) };
  };
}

export const handler = createPublicSitemapHandler();
export default handler;