import { PUBLIC_ORIGIN, PUBLIC_ROUTE_PATHS, publicRouteUrl } from "../../shared/public-routes.js";

const SITE_ORIGIN = "https://fandom.justlikekatie.com";
const VIBE_ATLAS_SOCIAL_IMAGE = `${PUBLIC_ORIGIN}/assets/c-drama-fandom/legendary-grid-liu-xueyi-2026-08-29.webp`;

export function appRouteMetadata(input) {
  const url = input instanceof URL ? input : new URL(input, SITE_ORIGIN);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  if (pathname === PUBLIC_ROUTE_PATHS.vibeAtlas) {
    return {
      title: "Vibe Atlas | Daily C-Drama Collectible Cards | Fandom Vibes",
      description: "Browse today’s Vibe Atlas C-drama collectible: one star, one vibe, and nine pieces of evidence.",
      url: publicRouteUrl(PUBLIC_ROUTE_PATHS.vibeAtlas),
    };
  }
  if (pathname === PUBLIC_ROUTE_PATHS.vibeAtlasArchive) {
    return {
      title: "Vibe Atlas Archive | Fandom Vibes",
      description: "Browse past Vibe Atlas C-drama collectible card drops, with one star, one vibe, and nine pieces of evidence in every edition.",
      url: publicRouteUrl(PUBLIC_ROUTE_PATHS.vibeAtlasArchive),
    };
  }
  return null;
}

function replaceMetadata(html, metadata) {
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${metadata.title}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${metadata.description}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${metadata.url}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${metadata.title}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${metadata.description}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${metadata.url}" />`)
    .replace(/<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${VIBE_ATLAS_SOCIAL_IMAGE}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${metadata.title}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${metadata.description}" />`)
    .replace(/<meta name="twitter:image" content="[^"]*" \/>/, `<meta name="twitter:image" content="${VIBE_ATLAS_SOCIAL_IMAGE}" />`);
}

/**
 * Query-string versions of the studio routes are account-specific views.
 * The queryless Vibe Atlas route is the public daily edition and must remain
 * indexable.
 */
export function shouldNoindexUrl(input) {
  const url = input instanceof URL ? input : new URL(input, SITE_ORIGIN);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/auth/verify" || pathname.startsWith("/auth/")) return true;

  const isStudioRoute = pathname === PUBLIC_ROUTE_PATHS.vibeAtlas
    || pathname === PUBLIC_ROUTE_PATHS.vibeAtlasArchive
    || pathname === "/memeforge/middle-earth";
  const isPublicRecordRoute = pathname.startsWith(`${PUBLIC_ROUTE_PATHS.vibeAtlasActors}/`)
    || pathname.startsWith(`${PUBLIC_ROUTE_PATHS.vibeAtlasEditions}/`);
  return (isStudioRoute || isPublicRecordRoute) && url.search.length > 0;
}

export default async function seoIndexing(request, context) {
  const response = await context.next();
  const requestUrl = new URL(request.url);
  const headers = new Headers(response.headers);
  if (shouldNoindexUrl(requestUrl)) headers.set("X-Robots-Tag", "noindex, follow");

  const metadata = appRouteMetadata(requestUrl);
  const isHtml = response.headers.get("content-type")?.includes("text/html");
  const body = metadata && isHtml
    ? replaceMetadata(await response.text(), metadata)
    : response.body;
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}