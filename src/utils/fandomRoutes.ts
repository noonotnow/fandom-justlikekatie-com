export type FandomProductRoute = 'launchpad' | 'vibe-atlas' | 'middle-earth' | 'veteran-journal';

const EDITION_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveFandomProductRoute(pathname: string): FandomProductRoute {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/vibe-atlas' || normalized === '/auth/verify') return 'vibe-atlas';
  if (normalized === '/vibe-atlas/veteran-journal') return 'veteran-journal';
  if (normalized === '/memeforge/middle-earth') return 'middle-earth';
  return 'launchpad';
}

export function initialVibeAtlasView(search: string): 'daily' | 'collection' | 'plan' | 'membership' {
  const view = new URLSearchParams(search).get('view');
  if (view === 'collection' || view === 'results' || view === 'builder') return 'collection';
  return view === 'plan' || view === 'membership' ? view : 'daily';
}

export function isValidVibeAtlasEditionDate(value: string): boolean {
  if (!EDITION_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function initialVibeAtlasEditionDate(search: string): string | null {
  const date = new URLSearchParams(search).get('date');
  return date && isValidVibeAtlasEditionDate(date) ? date : null;
}

export function hasInvalidVibeAtlasEditionDate(search: string): boolean {
  const date = new URLSearchParams(search).get('date');
  return date !== null && !isValidVibeAtlasEditionDate(date);
}

export function initialCollectionType(search: string): 'grids' | 'results' | 'builder' {
  const view = new URLSearchParams(search).get('view');
  if (view === 'results' || view === 'builder') return view;
  return 'grids';
}
