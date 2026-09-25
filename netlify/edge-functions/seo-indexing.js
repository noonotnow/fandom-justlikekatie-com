import { PUBLIC_ROUTE_PATHS } from "../../shared/public-routes.js";

const SITE_ORIGIN = "https://fandom.justlikekatie.com";

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
  if (!shouldNoindexUrl(new URL(request.url))) return response;

  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, follow");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}