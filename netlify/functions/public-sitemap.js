import { getBlobStore } from "./lib/blob-store.js";
import { PUBLIC_VIBE_ATLAS_ORIGIN, publicActorDirectory, readPublicationManifests } from "./lib/publication-manifest.js";

const STATIC_PATHS = [
  "/", "/c-drama-fandom/", "/c-drama-fandom/getting-started/", "/c-drama-fandom/glossary/",
  "/c-drama-fandom/glossary/cp/", "/c-drama-fandom/glossary/cultivation/", "/c-drama-fandom/glossary/xianxia/",
  "/c-drama-fandom/glossary/jianghu/", "/c-drama-fandom/glossary/wuxia/",
  "/c-drama-fandom/glossary/wuxia-vs-xianxia-vs-xuanhuan/", "/c-drama-fandom/glossary/historical-vs-costume-drama/",
  "/c-drama-fandom/glossary/duanju-microdrama-vertical-drama/", "/c-drama-fandom/archetypes/",
  "/c-drama-fandom/archetypes/cold-male-lead-vs-tsundere/", "/c-drama-fandom/archetypes/black-bellied-vs-white-cut-black/",
  "/c-drama-fandom/archetypes/white-moonlight-vs-cinnabar-mole/", "/c-drama-fandom/trope-decoder/",
  "/c-drama-fandom/fandom-games/", "/c-drama-fandom/watch-journal/",
  ...[1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45].map(start => `/c-drama-fandom/watch-journal/episodes-${start}-${start + 3}/`),
  "/c-drama-fandom/watch-journal/episodes-49-50/", "/vibe-atlas", "/vibe-atlas/archive",
];

const xmlEscape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

export function sitemapXml(paths) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${xmlEscape(PUBLIC_VIBE_ATLAS_ORIGIN + path)}</loc></url>`).join("")}</urlset>`;
}

export function createPublicSitemapHandler({ getStore = getBlobStore } = {}) {
  return async (_request, context) => {
    const { manifests, inventory } = await readPublicationManifests(getStore("star-of-day", context));
    if (!inventory.complete) return { statusCode: 503, headers: { "Content-Type": "application/xml", "Cache-Control": "no-store" }, body: "" };
    const actors = publicActorDirectory(manifests);
    const paths = [...STATIC_PATHS, ...actors.flatMap(actor => [actor.path, ...actor.editions.map(edition => edition.path)])];
    return { statusCode: 200, headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" }, body: sitemapXml([...new Set(paths)]) };
  };
}

export const handler = createPublicSitemapHandler();
export default handler;