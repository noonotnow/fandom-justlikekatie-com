export const PUBLIC_ORIGIN = "https://fandom.justlikekatie.com";

export const PUBLIC_ROUTE_PATHS = Object.freeze({
  launchpad: "/",
  vibeAtlas: "/vibe-atlas",
  vibeAtlasArchive: "/vibe-atlas/archive",
  vibeAtlasActors: "/vibe-atlas/actors",
  vibeAtlasEditions: "/vibe-atlas/editions",
  vibeAtlasVeteranJournal: "/vibe-atlas/veteran-journal",
});

export const VIBE_ATLAS_NETLIFY_ROUTES = Object.freeze({
  seoIndexing: Object.freeze([
    PUBLIC_ROUTE_PATHS.vibeAtlas,
    `${PUBLIC_ROUTE_PATHS.vibeAtlas}/*`,
  ]),
  publicRecords: Object.freeze([
    `${PUBLIC_ROUTE_PATHS.vibeAtlasActors}/*`,
    `${PUBLIC_ROUTE_PATHS.vibeAtlasEditions}/*`,
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

export function publicRouteUrl(path) {
  if (!PUBLIC_STATIC_PATHS.includes(path)) {
    throw new Error(`Unknown public route: ${path}`);
  }
  return `${PUBLIC_ORIGIN}${path}`;
}

export function staticSitemapXml() {
  const entries = PUBLIC_STATIC_ROUTES.map(({ path, changefreq, priority }) => (
    `  <url>\n    <loc>${publicRouteUrl(path)}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
  ));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}
