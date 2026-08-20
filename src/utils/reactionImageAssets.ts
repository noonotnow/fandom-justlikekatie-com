export type ReactionQueryTier =
  | 'Social use'
  | 'Character + emotion'
  | 'Iconic scene'
  | 'Broad fallback';

export interface ReactionImageBriefQueryInput {
  socialUseQuery: string;
  characterEmotionQueries: string[];
  iconicSceneQueries: string[];
  broadFallbackQueries: string[];
}

export interface ReactionSearchQuery {
  query: string;
  tier: ReactionQueryTier;
}

export interface RankedReactionCandidate<T> {
  candidate: T;
  queryTier: ReactionQueryTier;
  rank: number;
}

/**
 * Human-native GIF search starts with the social use, then narrows through
 * character emotion and scene recognition before trying a broad fallback.
 */
export function reactionQueryLadder(brief: ReactionImageBriefQueryInput): ReactionSearchQuery[] {
  const entries: ReactionSearchQuery[] = [
    { query: brief.socialUseQuery, tier: 'Social use' },
    ...brief.characterEmotionQueries.map((query) => ({ query, tier: 'Character + emotion' as const })),
    ...brief.iconicSceneQueries.map((query) => ({ query, tier: 'Iconic scene' as const })),
    ...brief.broadFallbackQueries.map((query) => ({ query, tier: 'Broad fallback' as const })),
  ];
  const seen = new Set<string>();
  return entries.filter(({ query }) => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

/**
 * Keeps the best-ranked occurrence of every source/thumbnail while preserving
 * the actual query that produced it for attribution and later packet staging.
 */
export function rankReactionCandidates<T extends { url: string; thumbnail: string }>(
  candidates: RankedReactionCandidate<T>[],
): Array<T & { reactionQueryTier: ReactionQueryTier }> {
  const seen = new Set<string>();
  return [...candidates]
    .sort((left, right) => left.rank - right.rank)
    .filter(({ candidate }) => {
      const sourceKey = candidate.url.trim() || candidate.thumbnail.trim();
      if (!sourceKey || seen.has(sourceKey)) return false;
      seen.add(sourceKey);
      return true;
    })
    .map(({ candidate, queryTier }) => ({ ...candidate, reactionQueryTier: queryTier }));
}

/**
 * Preserves the provided ranking while excluding thumbnails that cannot back
 * an image preview or exported card. Callers should pass the same image loader
 * used by the visible renderer.
 */
export async function loadableReactionAssets<T extends { thumbnail: string }>(
  candidates: T[],
  loadImage: (url: string) => Promise<boolean>,
  limit = 6,
): Promise<T[]> {
  const loadResults = await Promise.all(candidates.map((candidate) => loadImage(candidate.thumbnail)));
  return candidates.filter((_, index) => loadResults[index]).slice(0, limit);
}