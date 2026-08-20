export type FandomProductRoute = 'launchpad' | 'vibe-atlas' | 'middle-earth';

export function resolveFandomProductRoute(pathname: string): FandomProductRoute {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/vibe-atlas' || normalized === '/auth/verify') return 'vibe-atlas';
  if (normalized === '/memeforge/middle-earth') return 'middle-earth';
  return 'launchpad';
}

export function initialVibeAtlasView(search: string): 'daily' | 'collection' | 'plan' {
  const view = new URLSearchParams(search).get('view');
  return view === 'collection' || view === 'plan' ? view : 'daily';
}