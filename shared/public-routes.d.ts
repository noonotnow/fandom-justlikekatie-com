export type PublicStaticRoute = {
  path: string;
  changefreq: string;
  priority: string;
  page?: string;
  group?: string;
};

export const PUBLIC_ORIGIN: string;
export const PUBLIC_ROUTE_PATHS: Readonly<{
  launchpad: "/";
  vibeAtlas: "/vibe-atlas";
  vibeAtlasArchive: "/vibe-atlas/archive";
  vibeAtlasActors: "/vibe-atlas/actors";
  vibeAtlasEditions: "/vibe-atlas/editions";
  vibeAtlasVeteranJournal: "/vibe-atlas/veteran-journal";
}>;
export const PUBLIC_STATIC_ROUTES: readonly PublicStaticRoute[];
export const PUBLIC_STATIC_PATHS: readonly string[];
export function publicRouteUrl(path: string): string;
export function staticSitemapXml(): string;
