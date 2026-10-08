import { localizedPath, stripLocalePath } from "./locale.js";

export const PUBLIC_ORIGIN = "https://fandom.justlikekatie.com";
export const PUBLIC_CHINESE_LOCALE = "zh-CN";

export const PUBLIC_ROUTE_PATHS = Object.freeze({
  launchpad: "/",
  vibeAtlas: "/vibe-atlas",
  vibeAtlasArchive: "/vibe-atlas/archive",
  vibeAtlasActors: "/vibe-atlas/actors",
  vibeAtlasEditions: "/vibe-atlas/editions",
  vibeAtlasPacks: "/vibe-atlas/packs",
  vibeAtlasVeteranJournal: "/vibe-atlas/veteran-journal",
  tropeDecoder: "/c-drama-fandom/trope-decoder/",
});

export const PUBLIC_LOCALIZABLE_PATHS = Object.freeze([
  PUBLIC_ROUTE_PATHS.launchpad,
  PUBLIC_ROUTE_PATHS.vibeAtlas,
  PUBLIC_ROUTE_PATHS.vibeAtlasArchive,
  PUBLIC_ROUTE_PATHS.tropeDecoder,
]);

export const PUBLIC_LOCALIZED_ROUTE_PATHS = Object.freeze({
  launchpad: localizedPath(PUBLIC_ROUTE_PATHS.launchpad, PUBLIC_CHINESE_LOCALE),
  vibeAtlas: localizedPath(PUBLIC_ROUTE_PATHS.vibeAtlas, PUBLIC_CHINESE_LOCALE),
  vibeAtlasArchive: localizedPath(PUBLIC_ROUTE_PATHS.vibeAtlasArchive, PUBLIC_CHINESE_LOCALE),
  vibeAtlasActors: localizedPath(PUBLIC_ROUTE_PATHS.vibeAtlasActors, PUBLIC_CHINESE_LOCALE),
  vibeAtlasEditions: localizedPath(PUBLIC_ROUTE_PATHS.vibeAtlasEditions, PUBLIC_CHINESE_LOCALE),
  vibeAtlasPacks: localizedPath(PUBLIC_ROUTE_PATHS.vibeAtlasPacks, PUBLIC_CHINESE_LOCALE),
});

export const VIBE_ATLAS_NETLIFY_ROUTES = Object.freeze({
  seoIndexing: Object.freeze([
    PUBLIC_ROUTE_PATHS.vibeAtlas,
    `${PUBLIC_ROUTE_PATHS.vibeAtlas}/*`,
    PUBLIC_LOCALIZED_ROUTE_PATHS.launchpad.replace(/\/+$/, ""),
    `${PUBLIC_LOCALIZED_ROUTE_PATHS.launchpad.replace(/\/+$/, "")}/*`,
  ]),
  publicRecords: Object.freeze([
    `${PUBLIC_ROUTE_PATHS.vibeAtlasActors}/*`,
    `${PUBLIC_ROUTE_PATHS.vibeAtlasEditions}/*`,
    `${PUBLIC_ROUTE_PATHS.vibeAtlasPacks}/*`,
    `${PUBLIC_LOCALIZED_ROUTE_PATHS.vibeAtlasActors}/*`,
    `${PUBLIC_LOCALIZED_ROUTE_PATHS.vibeAtlasEditions}/*`,
    `${PUBLIC_LOCALIZED_ROUTE_PATHS.vibeAtlasPacks}/*`,
  ]),
});

const editorial = (path, priority = "0.8") => ({
  path,
  changefreq: "monthly",
  priority,
  page: `public${path}index.html`,
  group: "editorial",
});

const journalRanges = [
  [1, 4], [5, 8], [9, 12], [13, 16], [17, 20], [21, 24], [25, 28],
  [29, 32], [33, 36], [37, 40], [41, 44], [45, 48], [49, 50],
];

export const PUBLIC_STATIC_ROUTES = Object.freeze([
  { path: PUBLIC_ROUTE_PATHS.launchpad, changefreq: "weekly", priority: "0.8" },
  editorial("/c-drama-fandom/", "1.0"),
  editorial("/c-drama-fandom/getting-started/"),
  editorial("/c-drama-fandom/glossary/"),
  editorial("/c-drama-fandom/untamed-name-board/"),
  editorial("/c-drama-fandom/untamed-names-and-performers/"),
  editorial("/c-drama-fandom/place-names/"),
  editorial("/c-drama-fandom/glossary/cp/"),
  editorial("/c-drama-fandom/glossary/cultivation/"),
  editorial("/c-drama-fandom/glossary/xianxia/"),
  editorial("/c-drama-fandom/glossary/jianghu/"),
  editorial("/c-drama-fandom/glossary/wuxia/"),
  editorial("/c-drama-fandom/glossary/wuxia-vs-xianxia-vs-xuanhuan/"),
  editorial("/c-drama-fandom/glossary/historical-vs-costume-drama/"),
  editorial("/c-drama-fandom/glossary/duanju-microdrama-vertical-drama/"),
  editorial("/c-drama-fandom/archetypes/"),
  editorial("/c-drama-fandom/archetypes/cold-male-lead-vs-tsundere/"),
  editorial("/c-drama-fandom/archetypes/black-bellied-vs-white-cut-black/"),
  editorial("/c-drama-fandom/archetypes/white-moonlight-vs-cinnabar-mole/"),
  editorial("/c-drama-fandom/trope-decoder/", "0.9"),
  { ...editorial("/c-drama-fandom/fandom-games/", "0.9"), changefreq: "weekly" },
  { ...editorial("/c-drama-fandom/vibing-now/", "0.9"), changefreq: "weekly" },
  { ...editorial("/c-drama-fandom/vibing-now/against-the-current-episode-21/", "0.9"), changefreq: "weekly" },
  { ...editorial("/c-drama-fandom/vibing-now/against-the-current-episodes-22-25/", "0.9"), changefreq: "weekly" },
  { ...editorial("/c-drama-fandom/vibing-now/against-the-current-episodes-26-29/", "0.9"), changefreq: "weekly" },
  { ...editorial("/c-drama-fandom/vibing-now/against-the-current-episodes-30-31/", "0.9"), changefreq: "weekly" },
  { ...editorial("/c-drama-fandom/vibing-now/against-the-current-episodes-32-33/", "0.9"), changefreq: "weekly" },
  { ...editorial("/c-drama-fandom/vibing-now/against-the-current-episodes-34-38/", "0.9"), changefreq: "weekly" },
  { ...editorial("/c-drama-fandom/where-to-watch/against-the-current/", "0.8"), changefreq: "weekly" },
  { ...editorial("/c-drama-fandom/soundtrack/against-the-current/", "0.8"), changefreq: "weekly" },
  editorial("/c-dramas/love-between-fairy-and-devil/", "0.9"),
  editorial("/c-dramas/love-between-fairy-and-devil/cast/"),
  editorial("/c-dramas/love-between-fairy-and-devil/relationships/"),
  editorial("/c-dramas/love-between-fairy-and-devil/themes-symbolism/"),
  editorial("/c-dramas/love-between-fairy-and-devil/what-to-watch-next/"),
  {
    path: "/c-drama-fandom/watch-journal/",
    changefreq: "weekly",
    priority: "0.9",
    page: "public/c-drama-fandom/watch-journal/index.html",
    group: "journal",
  },
  ...journalRanges.map(([start, end]) => ({
    path: `/c-drama-fandom/watch-journal/episodes-${start}-${end}/`,
    changefreq: "weekly",
    priority: "0.8",
    page: `public/c-drama-fandom/watch-journal/episodes-${start}-${end}/index.html`,
    group: "journal",
  })),
  { path: PUBLIC_ROUTE_PATHS.vibeAtlas, changefreq: "daily", priority: "0.9" },
  { path: PUBLIC_ROUTE_PATHS.vibeAtlasArchive, changefreq: "daily", priority: "0.7" },
]);

export const PUBLIC_STATIC_PATHS = Object.freeze(PUBLIC_STATIC_ROUTES.map(({ path }) => path));

export const PUBLIC_LOCALIZED_STATIC_ROUTES = Object.freeze(
  PUBLIC_STATIC_ROUTES
    .filter(({ path }) => PUBLIC_LOCALIZABLE_PATHS.includes(path))
    .map(route => {
      const path = localizedPath(route.path, PUBLIC_CHINESE_LOCALE);
      return {
        ...route,
        path,
        ...(route.path === PUBLIC_ROUTE_PATHS.tropeDecoder
          ? { page: `public${path}index.html` }
          : {}),
      };
    }),
);

export const PUBLIC_SITEMAP_STATIC_PATHS = Object.freeze([
  ...PUBLIC_STATIC_PATHS,
  ...PUBLIC_LOCALIZED_STATIC_ROUTES.map(({ path }) => path),
]);

function cleanRoutePath(path) {
  const withoutLocale = stripLocalePath(path);
  return withoutLocale.replace(/\/+$/, "") || "/";
}

function isLocalizedPublicRecordPath(path) {
  const clean = cleanRoutePath(path);
  return /^\/vibe-atlas\/actors\/[a-z0-9-]+$/.test(clean)
    || /^\/vibe-atlas\/editions\/\d{4}-\d{2}-\d{2}\/[a-z0-9-]+$/.test(clean)
    || /^\/vibe-atlas\/packs\/[a-z0-9-]+$/.test(clean)
    || /^\/vibe-atlas\/packs\/[a-z0-9-]+\/[a-z0-9-]+$/.test(clean);
}

export function localizedPublicPath(path, locale) {
  const englishPath = stripLocalePath(path);
  const actorPackPath = englishPath.match(/^\/vibe-atlas\/packs\/([a-z0-9-]+)\/?$/);
  if (actorPackPath && locale === PUBLIC_CHINESE_LOCALE) {
    const localizedPackRoot = localizedPath(PUBLIC_ROUTE_PATHS.vibeAtlasPacks, locale);
    return `${localizedPackRoot}/${actorPackPath[1]}/`;
  }
  return localizedPath(englishPath, locale);
}

export function publicAlternatePaths(path) {
  const originalEnglishPath = stripLocalePath(path);
  const routeIdentity = cleanRoutePath(originalEnglishPath);
  const registeredPath = PUBLIC_LOCALIZABLE_PATHS.find(route => cleanRoutePath(route) === routeIdentity);
  const isLocalizable = Boolean(registeredPath)
    || isLocalizedPublicRecordPath(path);
  if (!isLocalizable) return [];

  const englishPath = registeredPath || originalEnglishPath;
  const zhPath = localizedPublicPath(englishPath, PUBLIC_CHINESE_LOCALE);
  return [
    { hreflang: "en", path: englishPath },
    { hreflang: "zh-CN", path: zhPath },
    { hreflang: "x-default", path: englishPath },
  ];
}

// Select every installment, not a hand-maintained list of currently published slugs.
// The shelf itself is not an episode-bounded article.
export function vibingNowArticleRoutes(routes = PUBLIC_STATIC_ROUTES) {
  const shelf = "/c-drama-fandom/vibing-now/";
  return routes.filter(({ path }) => path.startsWith(shelf) && path !== shelf);
}

// Retired URLs are redirects, never additional public article/sitemap records.
export const PUBLIC_EDITORIAL_REDIRECTS = Object.freeze([
  "/c-drama-fandom/vibing-now/against-the-current-episodes-26-30",
  "/c-drama-fandom/vibing-now/against-the-current-episodes-26-30/",
  "/c-drama-fandom/vibing-now/against-the-current-episodes-26-30/index.html",
].map(from => Object.freeze({
  from, to: "/c-drama-fandom/vibing-now/against-the-current-episodes-26-29/", status: 301,
})));

export function publicStaticPreviewRoutes(routes = [
  ...PUBLIC_STATIC_ROUTES,
  ...PUBLIC_LOCALIZED_STATIC_ROUTES,
]) {
  return routes
    .filter(({ group, page }) => (group === "editorial" || group === "journal") && page)
    .map(({ path, page }) => [
      path.replace(/\/+$/, "") || "/",
      `/${page.replace(/^public\//, "")}`,
    ]);
}

export function publicRouteUrl(path) {
  if (!PUBLIC_SITEMAP_STATIC_PATHS.includes(path)) {
    throw new Error(`Unknown public route: ${path}`);
  }
  return `${PUBLIC_ORIGIN}${path}`;
}

export function staticSitemapXml() {
  const routes = [
    ...PUBLIC_STATIC_ROUTES,
    ...PUBLIC_LOCALIZED_STATIC_ROUTES,
  ];
  const entries = routes.map(({ path, changefreq, priority }) => {
    const alternates = publicAlternatePaths(path)
      .map(({ hreflang, path: alternatePath }) => (
        `\n    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${PUBLIC_ORIGIN}${alternatePath}" />`
      ))
      .join("");
    return `  <url>\n    <loc>${publicRouteUrl(path)}</loc>${alternates}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join("\n")}\n</urlset>\n`;
}
