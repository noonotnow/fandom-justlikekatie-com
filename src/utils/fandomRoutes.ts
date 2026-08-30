export type FandomProductRoute = 'launchpad' | 'vibe-atlas' | 'middle-earth';

export function resolveFandomProductRoute(pathname: string): FandomProductRoute {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/vibe-atlas' || normalized === '/auth/verify') return 'vibe-atlas';
  if (normalized === '/memeforge/middle-earth') return 'middle-earth';
  return 'launchpad';
}

export function initialVibeAtlasView(search: string): 'daily' | 'collection' | 'plan' | 'membership' {
  const view = new URLSearchParams(search).get('view');
  if (view === 'collection' || view === 'results' || view === 'builder') return 'collection';
  return view === 'plan' || view === 'membership' ? view : 'daily';
}

export function initialCollectionType(search: string): 'grids' | 'results' | 'builder' {
  const view = new URLSearchParams(search).get('view');
  if (view === 'results' || view === 'builder') return view;
  return 'grids';
}

export function initialVibeAtlasPacketId(search: string): string | null {
  const packetId = new URLSearchParams(search).get('packet')?.trim();
  return packetId || null;
}

export function vibeAtlasPacketPath(packetId: string): string {
  return `/vibe-atlas?view=plan&packet=${encodeURIComponent(packetId)}`;
}