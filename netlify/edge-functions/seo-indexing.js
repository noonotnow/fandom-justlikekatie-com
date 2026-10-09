import {
  PUBLIC_CHINESE_LOCALE,
  PUBLIC_ORIGIN,
  PUBLIC_ROUTE_PATHS,
  publicRouteUrl,
} from "../../shared/public-routes.js";
import { localizedPath, stripLocalePath } from "../../shared/locale.js";
import { GAME_PATH, GAME_URL, incomingEnding } from "../../public/c-drama-fandom/fandom-games/sect-day/story.js";

const SITE_ORIGIN = "https://fandom.justlikekatie.com";
const VIBE_ATLAS_SOCIAL_IMAGE = `${PUBLIC_ORIGIN}/assets/c-drama-fandom/legendary-grid-liu-xueyi-2026-08-29.webp`;
const LAUNCHPAD_SOCIAL_IMAGE = `${PUBLIC_ORIGIN}/assets/c-drama-fandom/lg01-master-og.jpg`;

export function appRouteMetadata(input) {
  const url = input instanceof URL ? input : new URL(input, SITE_ORIGIN);
  const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
  const englishPath = stripLocalePath(normalizedPath).replace(/\/+$/, "") || "/";
  const isChinese = englishPath !== normalizedPath;
  const routeCopy = {
    [PUBLIC_ROUTE_PATHS.launchpad]: isChinese
      ? {
          title: "Fandom Vibes｜古装剧粉丝指南与 Vibe Atlas",
          description: "探索中国古装剧粉丝文化与 Vibe Atlas：每日精选一位演员、一个氛围主题和九张视觉证据。",
        }
      : {
          title: "Fandom Vibes | Daily C-Drama Collectibles & Fandom Guides",
          description: "Browse Vibe Atlas’s daily C-drama collectible: one star, one vibe, and nine pieces of evidence, alongside guides and fandom games.",
        },
    [PUBLIC_ROUTE_PATHS.vibeAtlas]: isChinese
      ? {
          title: "Vibe Atlas｜每日古装剧收藏卡 | Fandom Vibes",
          description: "浏览今日 Vibe Atlas 古装剧收藏卡：一位演员、一个氛围主题，以及九张精选图片。",
        }
      : {
          title: "Vibe Atlas | Daily C-Drama Collectible Cards | Fandom Vibes",
          description: "Browse today’s Vibe Atlas C-drama collectible: one star, one vibe, and nine pieces of evidence.",
        },
    [PUBLIC_ROUTE_PATHS.vibeAtlasArchive]: isChinese
      ? {
          title: "Vibe Atlas 往期典藏｜每日古装剧收藏卡 | Fandom Vibes",
          description: "浏览 Vibe Atlas 往期古装剧收藏卡，每期包含一位演员、一个氛围主题和九张精选图片。",
        }
      : {
          title: "Vibe Atlas Archive | Fandom Vibes",
          description: "Browse past Vibe Atlas C-drama collectible card drops, with one star, one vibe, and nine pieces of evidence in every edition.",
        },
  };
  const copy = routeCopy[englishPath];
  if (!copy) return null;

  const englishUrl = publicRouteUrl(englishPath);
  const chineseUrl = publicRouteUrl(localizedPath(englishPath, PUBLIC_CHINESE_LOCALE));
  return {
    ...copy,
    image: englishPath === PUBLIC_ROUTE_PATHS.launchpad
      ? LAUNCHPAD_SOCIAL_IMAGE
      : VIBE_ATLAS_SOCIAL_IMAGE,
    lang: isChinese ? PUBLIC_CHINESE_LOCALE : "en",
    url: isChinese ? chineseUrl : englishUrl,
    alternates: [
      { hreflang: "en", href: englishUrl },
      { hreflang: "zh-CN", href: chineseUrl },
      { hreflang: "x-default", href: englishUrl },
    ],
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function replaceMetadata(html, metadata) {
  let next = html
    .replace(/<html lang="[^"]*"/, `<html lang="${escapeHtml(metadata.lang)}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(metadata.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(metadata.description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${escapeHtml(metadata.url)}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${escapeHtml(metadata.title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${escapeHtml(metadata.description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${escapeHtml(metadata.url)}" />`)
    .replace(/<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${escapeHtml(metadata.image)}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${escapeHtml(metadata.title)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${escapeHtml(metadata.description)}" />`)
    .replace(/<meta name="twitter:image" content="[^"]*" \/>/, `<meta name="twitter:image" content="${escapeHtml(metadata.image)}" />`);
  for (const alternate of metadata.alternates) {
    const escaped = escapeHtml(alternate.href);
    const tag = `<link rel="alternate" hreflang="${alternate.hreflang}" href="${escaped}" />`;
    const pattern = new RegExp(`<link rel="alternate" hreflang="${alternate.hreflang}" href="[^"]*" \\/>`);
    if (pattern.test(next)) next = next.replace(pattern, tag);
    else next = next.replace("</head>", `  ${tag}\n</head>`);
  }
  return next;
}

/**
 * Query-string versions of the studio routes are account-specific views.
 * The queryless Vibe Atlas route is the public daily edition and must remain
 * indexable.
 */
export function shouldNoindexUrl(input) {
  const url = input instanceof URL ? input : new URL(input, SITE_ORIGIN);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const englishPath = stripLocalePath(pathname).replace(/\/+$/, "") || "/";
  const isChinese = pathname !== englishPath;
  if (pathname === GAME_PATH.replace(/\/$/, "") || pathname === GAME_PATH + "index.html" || pathname.startsWith(GAME_PATH + "previews/")) {
    return url.search.length > 0 || pathname.includes("/previews/");
  }

  if (englishPath === "/auth/verify" || englishPath.startsWith("/auth/")) return true;

  if (isChinese) {
    const isLocalizedPublicRecord = /^\/vibe-atlas\/actors\/[a-z0-9-]+$/.test(englishPath)
      || /^\/vibe-atlas\/editions\/\d{4}-\d{2}-\d{2}\/[a-z0-9-]+$/.test(englishPath)
      || /^\/vibe-atlas\/packs\/[a-z0-9-]+$/.test(englishPath)
      || /^\/vibe-atlas\/packs\/[a-z0-9-]+\/[a-z0-9-]+$/.test(englishPath);
    const isLocalizedPublicRoute = englishPath === PUBLIC_ROUTE_PATHS.launchpad
      || englishPath === PUBLIC_ROUTE_PATHS.vibeAtlas
      || englishPath === PUBLIC_ROUTE_PATHS.vibeAtlasArchive
      || englishPath === PUBLIC_ROUTE_PATHS.tropeDecoder.replace(/\/+$/, "")
      || isLocalizedPublicRecord;
    if (!isLocalizedPublicRoute || url.search.length > 0) return true;
  }

  const isStudioRoute = englishPath === PUBLIC_ROUTE_PATHS.launchpad
    || englishPath === PUBLIC_ROUTE_PATHS.vibeAtlas
    || englishPath === PUBLIC_ROUTE_PATHS.vibeAtlasArchive
    || englishPath === "/memeforge/middle-earth";
  const isPublicRecordRoute = englishPath.startsWith(`${PUBLIC_ROUTE_PATHS.vibeAtlasActors}/`)
    || englishPath.startsWith(`${PUBLIC_ROUTE_PATHS.vibeAtlasEditions}/`)
    || englishPath.startsWith(`${PUBLIC_ROUTE_PATHS.vibeAtlasPacks}/`);
  return (isStudioRoute || isPublicRecordRoute) && url.search.length > 0;
}

export default async function seoIndexing(request, context) {
  const response = await context.next();
  const requestUrl = new URL(request.url);
  const headers = new Headers(response.headers);
  const noindex = shouldNoindexUrl(requestUrl);
  if (noindex) headers.set("X-Robots-Tag", "noindex, follow");

  const metadata = appRouteMetadata(requestUrl);
  const isHtml = response.headers.get("content-type")?.includes("text/html");
  let body = response.body;
  if (isHtml && (metadata || noindex)) {
    let html = await response.text();
    if (metadata) html = replaceMetadata(html, metadata);
    if (noindex) html = html.replace(
      /<meta name="robots" content="[^"]*" \/>/,
      '<meta name="robots" content="noindex,follow" />',
    );
    body = html;
  }
  // Override even a duplicate-query internal redirect using one exact allowlist.
  // Never reflect unknown values or let a generated variant change the canonical.
  if (isHtml && [GAME_PATH.replace(/\/$/, ""), GAME_PATH + "index.html"].includes(requestUrl.pathname.replace(/\/+$/, ""))) {
    const ending = incomingEnding(requestUrl.search);
    let html = typeof body === "string" ? body : await response.text();
    const title = ending?.name || "Can You Survive Your First Day in a Sect?";
    const description = ending?.description || "Five decisions, six endings, no cultivation skills. An original 2–4 minute xianxia branching adventure in Quiet Bell Sect.";
    const image = `${PUBLIC_ORIGIN}/assets/c-drama-fandom/sect-day-${ending?.id || "master"}-og.jpg`;
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)} | Fandom Vibes</title>`)
      .replace(/(<meta (?:property|name)="(?:og:title|twitter:title)" content=")[^"]*"/g, `$1${escapeHtml(title)}"`)
      .replace(/(<meta (?:property|name)="(?:description|og:description|twitter:description)" content=")[^"]*"/g, `$1${escapeHtml(description)}"`)
      .replace(/(<meta (?:property|name)="(?:og:image|twitter:image)" content=")[^"]*"/g, `$1${image}"`)
      .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${GAME_URL}${ending ? "?ending=" + ending.id : ""}"`)
      .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${GAME_URL}"`)
      .replace(/(<meta name="robots" content=")[^"]*"/, `$1${noindex ? "noindex,follow" : "index,follow,max-image-preview:large"}"`);
    body = html;
  }
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}