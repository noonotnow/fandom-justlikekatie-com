export type PublicPreviewState = 'live' | 'unpublished' | 'unavailable';

export async function fetchPublicPreviewState(
  actorId: string,
  vibeIdx: number,
  fetchImpl: typeof fetch = fetch,
): Promise<PublicPreviewState> {
  try {
    const query = new URLSearchParams({ actorId, vibeIdx: String(vibeIdx) });
    const response = await fetchImpl(`/.netlify/functions/public-preflight-preview?${query}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (response.status === 404) return 'unpublished';
    if (!response.ok) return 'unavailable';
    const preview = await response.json();
    return preview?.kind === 'vibe-atlas-preflight-three-card-preview'
      && preview.actor?.id === actorId
      && preview.vibeIdx === vibeIdx
      && Array.isArray(preview.cards)
      && preview.cards.length === 3
      ? 'live' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}