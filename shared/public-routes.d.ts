export type PublicStaticRoute = {
  path: string;
  changefreq: string;
  priority: string;
  page?: string;
  group?: string;
};

export const PUBLIC_ORIGIN: string;

export const PUBLIC_CHINESE_LOCALE: "zh-CN";
export const PUBLIC_ROUTE_PATHS: Readonly<{
  launchpad: "/";
  vibeAtlas: "/vibe-atlas";
  vibeAtlasArchive: "/vibe-atlas/archive";
  vibeAtlasPacks: "/vibe-atlas/packs";
  vibeAtlasActors: "/vibe-atlas/actors";
  vibeAtlasEditions: "/vibe-atlas/editions";
  vibeAtlasPacks: "/vibe-atlas/packs";
  vibeAtlasVeteranJournal: "/vibe-atlas/veteran-journal";
  tropeDecoder: "/c-drama-fandom/trope-decoder/";
  sectDay: "/c-drama-fandom/fandom-games/sect-day/";
}>;

export const PUBLIC_LOCALIZABLE_PATHS: readonly string[];
export const PUBLIC_STATIC_ROUTES: readonly PublicStaticRoute[];
export const PUBLIC_EDITORIAL_REDIRECTS: readonly {
  readonly from: string;
  readonly to: string;
  readonly status: 301;
}[];
export const PUBLIC_STATIC_PATHS: readonly string[];

export const PUBLIC_LOCALIZED_STATIC_ROUTES: readonly PublicStaticRoute[];
export function localizedPublicPath(path: string, locale: "en" | "zh-CN"): string;
export function publicAlternatePaths(path: string): { hreflang: string; path: string }[];
export function publicStaticPreviewRoutes(
  routes?: readonly PublicStaticRoute[],
): [string, string][];
export function publicRouteUrl(path: string): string;
export function staticSitemapXml(): string;

export const VIBE_ATLAS_NETLIFY_ROUTES: Readonly<{
  seoIndexing: readonly string[];
  publicRecords: readonly string[];
}>;

export const PUBLIC_SITEMAP_STATIC_PATHS: readonly string[];

export const PUBLIC_LOCALIZED_ROUTE_PATHS: Readonly<{
  launchpad: string;
  vibeAtlas: string;
  vibeAtlasArchive: string;
  vibeAtlasActors: string;
  vibeAtlasEditions: string;
  vibeAtlasPacks: string;
}>;
