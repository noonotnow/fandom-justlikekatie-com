/**
 * Preserves the search-provider order while excluding thumbnails that cannot
 * back an image preview or exported card. Callers should pass the same image
 * loader used by the visible renderer.
 */
export async function loadableReactionAssets<T extends { thumbnail: string }>(
  candidates: T[],
  loadImage: (url: string) => Promise<boolean>,
  limit = 6,
): Promise<T[]> {
  const loadResults = await Promise.all(candidates.map((candidate) => loadImage(candidate.thumbnail)));
  return candidates.filter((_, index) => loadResults[index]).slice(0, limit);
}