import { getBlobStore } from "./lib/blob-store.js";
import {
  PUBLIC_VIBE_ATLAS_ORIGIN,
  publicActorDirectory,
  publicActorSlug,
  publicEditionPreview,
  readPublicationManifests,
} from "./lib/publication-manifest.js";
import {
  isIndexableReleasedPack,
  releasedPackCatalog,
  publicReleasedPack,
  releasedPackActorSlug,
  RELEASED_PACK_PATH,
} from "./lib/released-pack-catalog.js";
import { ACTOR_PACKS } from "./lib/actor-packs.js";
import { ELIGIBILITY_STORE } from "./lib/actor-eligibility.js";

const PUBLIC_CACHE = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function response(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": statusCode === 200 ? PUBLIC_CACHE : "no-store",
      ...headers,
    },
    body,
  };
}

function page({ title, description, canonical, image, robots, body }) {
  const jsonLd = JSON.stringify({ "@context": "https://schema.org", "@type": "Article", name: title, description, url: canonical, ...(image ? { image } : {}) })
    .replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="${robots}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="article"><meta property="og:site_name" content="Fandom Vibes"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}">${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ""}<script type="application/ld+json">${jsonLd}</script></head><body><main>${body}</main></body></html>`;
}

function notFound() {
  return response(404, page({
    title: "Public record not found | Fandom Vibes",
    description: "This curated public record is not available.",
    canonical: `${PUBLIC_VIBE_ATLAS_ORIGIN}/vibe-atlas/`,
    robots: "noindex,follow",
    body: "<h1>Public record not found</h1><p>This curated record is not available.</p>",
  }));
}

function renderEdition(edition, query) {
  const noindex = query !== "";
  const title = `${edition.actor.nameEn || edition.actor.name} · ${edition.vibe.labelEn} | Vibe Atlas`;
  const description = edition.vibe.copy;
  const hero = edition.previews[edition.heroPosition]?.deliveryUrl || edition.previews[0]?.deliveryUrl;
  const cards = edition.previews.map(card => (
    `<figure><img src="${escapeHtml(card.thumbnailUrl)}" alt="${escapeHtml(card.title)}" loading="lazy"><figcaption>${escapeHtml(card.title)}</figcaption></figure>`
  )).join("");
  const body = `<a href="${escapeHtml(edition.actor.path)}">All ${escapeHtml(edition.actor.nameEn || edition.actor.name)} records</a><h1>${escapeHtml(title)}</h1><p>${escapeHtml(edition.vibe.subtitleEn)}</p><p>${escapeHtml(description)}</p><section aria-label="Approved preview grid">${cards}</section>`;
  return response(200, page({
    title, description, canonical: edition.canonical, image: hero,
    robots: noindex ? "noindex,follow" : "index,follow,max-image-preview:large",
    body,
  }), noindex ? { "Cache-Control": "no-store" } : {});
}

function renderActor(actor, query) {
  const noindex = query !== "";
  const title = `${actor.nameEn || actor.name} · Curated Vibe Atlas records | Fandom Vibes`;
  const description = `Explore ${actor.editionCount} approved Vibe Atlas records for ${actor.nameEn || actor.name}, with original editorial context and materialized previews.`;
  const links = actor.editions.map(edition => `<li><a href="${escapeHtml(edition.path)}">${escapeHtml(edition.date)} edition</a></li>`).join("");
  const body = `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><p>Related curated context: ${actor.relatedContext.map(item => escapeHtml(item.labelEn || item.label)).join(", ")}.</p><ul>${links}</ul>`;
  return response(200, page({
    title, description, canonical: actor.canonical,
    robots: noindex ? "noindex,follow" : "index,follow,max-image-preview:large",
    body,
  }), noindex ? { "Cache-Control": "no-store" } : {});
}

function renderReleasedPack(pack, query) {
  const noindex = query !== "";
  const title = `${pack.actor.nameEn} · ${pack.vibe.labelEn} | Released Vibe Pack`;
  const description = pack.preview.copy;
  const cards = pack.preview.cards.map(card =>
    `<figure><img src="${escapeHtml(card.thumbnailUrl)}" alt="${escapeHtml(card.title)}" loading="lazy"><figcaption>${escapeHtml(card.title)}</figcaption></figure>`).join("");
  const body = `<a href="${escapeHtml(`${RELEASED_PACK_PATH}/${releasedPackActorSlug(pack.actor)}/`)}">All ${escapeHtml(pack.actor.nameEn)} packs</a><h1>${escapeHtml(title)}</h1><p>${escapeHtml(pack.vibe.subtitleEn)}</p><p>${escapeHtml(description)}</p><section aria-label="Released pack preview">${cards}</section><p>Full source depth is available to Fandom Collectors.</p>`;
  return response(200, page({
    title, description, canonical: pack.canonical,
    image: pack.preview.cards[0]?.deliveryUrl,
    robots: noindex ? "noindex,follow" : "index,follow,max-image-preview:large",
    body,
  }), { "Cache-Control": "no-store" });
}

function renderReleasedActor(actor, query) {
  const noindex = query !== "";
  const title = `${actor.nameEn} · Released Vibe Packs | Vibe Atlas`;
  const description = `Explore approved released Vibe Atlas packs for ${actor.nameEn}.`;
  const links = actor.packs.map(pack =>
    `<li><a href="${escapeHtml(pack.canonical)}">${escapeHtml(pack.vibe.labelEn)}</a> — ${escapeHtml(pack.vibe.subtitleEn)}</li>`).join("");
  return response(200, page({
    title, description, canonical: actor.canonical,
    robots: noindex ? "noindex,follow" : "index,follow",
    body: `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><ul>${links}</ul>`,
  }), { "Cache-Control": "no-store" });
}

export function createPublicRecordsHandler({
  getStore = getBlobStore,
  actorPacks = ACTOR_PACKS,
  eligibilityStoreName = ELIGIBILITY_STORE,
  buildReleaseCatalog = releasedPackCatalog,
} = {}) {
  return async (request, context) => {
    if (request.method && request.method !== "GET") return response(405, "<h1>Method not allowed</h1>", { Allow: "GET" });
    const url = new URL(request.url || PUBLIC_VIBE_ATLAS_ORIGIN);
    const parts = url.pathname.split("/").filter(Boolean);
    const publicationStore = getStore("star-of-day", context);
    const { manifests, inventory } = await readPublicationManifests(publicationStore);
    if (!inventory.complete) return response(503, "<h1>Public record inventory is not ready.</h1>");
    const directory = publicActorDirectory(manifests);

    if (parts[1] === "packs") {
      const releaseCatalog = await buildReleaseCatalog(
        getStore(eligibilityStoreName, context),
        { publicationStore, actorPacks },
      );
      if (!releaseCatalog.complete || !releaseCatalog.indexingComplete) {
        return response(503, "<h1>Released pack inventory is not ready.</h1>");
      }
      const packs = releaseCatalog.packs.filter(isIndexableReleasedPack);
      if (parts.length === 4) {
        const pack = packs.find(item =>
          item.canonical.endsWith(`/${parts[2]}/${parts[3]}/`));
        return pack ? renderReleasedPack(publicReleasedPack(pack), url.search) : notFound();
      }
      if (parts.length === 3) {
        const actorPacksForRoute = packs.filter(item =>
          releasedPackActorSlug(item.actor) === parts[2]);
        if (!actorPacksForRoute.length) return notFound();
        const actor = actorPacksForRoute[0].actor;
        return renderReleasedActor({
          ...actor,
          canonical: `${new URL(actorPacksForRoute[0].canonical).origin}${RELEASED_PACK_PATH}/${parts[2]}/`,
          packs: actorPacksForRoute.map(publicReleasedPack),
        }, url.search);
      }
      return notFound();
    }

    if (parts[1] === "actors" && parts.length === 3) {
      const actor = directory.find(item => publicActorSlug(item) === parts[2]);
      return actor ? renderActor(actor, url.search) : notFound();
    }
    if (parts[1] === "editions" && parts.length === 4) {
      const edition = manifests
        .filter(item => item.publicationDate === parts[2] && publicActorSlug(item.actor) === parts[3])
        .map(publicEditionPreview)
        .find(Boolean);
      return edition ? renderEdition(edition, url.search) : notFound();
    }
    return notFound();
  };
}

export const handler = createPublicRecordsHandler();
export default handler;
