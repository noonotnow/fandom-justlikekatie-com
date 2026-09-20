export interface PublicStaticRoute {
  path: string;
  changefreq: string;
  priority: string;
  page?: string;
  group?: string;
}

export const PUBLIC_ORIGIN: string;
export const PUBLIC_STATIC_ROUTES: readonly PublicStaticRoute[];
export const PUBLIC_STATIC_PATHS: readonly string[];
export function staticSitemapXml(): string;