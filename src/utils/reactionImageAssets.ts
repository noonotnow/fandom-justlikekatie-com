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
  performedEmotion?: string[];
}

export interface ReactionSearchQuery {
  query: string;
  tier: ReactionQueryTier;
  performedEmotion?: string;
}

export interface RankedReactionCandidate<T> {
  candidate: T;
  queryTier: ReactionQueryTier;
  performedEmotion?: string;
  rank: number;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
}

function uniquePerformedEmotions(performedEmotion: string[] = []): string[] {
  const seen = new Set<string>();
  return performedEmotion.map((emotion) => emotion.trim()).filter((emotion) => {
    const normalized = normalizeSearchText(emotion);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function queryPerformsEmotion(query: string, emotion: string): boolean {
  const normalizedQuery = ` ${normalizeSearchText(query)} `;
  const emotionWords = normalizeSearchText(emotion).split(' ').filter(Boolean);
  return emotionWords.length > 0 && emotionWords.every((word) => normalizedQuery.includes(` ${word} `));
}

/**
 * Reaction-still search leads with a canonical scene anchor, then narrows
 * through character emotion and scene recognition before broad fallbacks.
 */
export function reactionQueryLadder(
  brief: ReactionImageBriefQueryInput,
  curatedSceneQuery: string | string[] = '',
): ReactionSearchQuery[] {
  const performedEmotions = uniquePerformedEmotions(brief.performedEmotion);
  const unmatchedCharacterQueries = [...brief.characterEmotionQueries];
  const emotionQueries = performedEmotions.map((performedEmotion) => {
    const matchingIndex = unmatchedCharacterQueries.findIndex(
      (query) => queryPerformsEmotion(query, performedEmotion),
    );
    const query = matchingIndex >= 0
      ? unmatchedCharacterQueries.splice(matchingIndex, 1)[0]
      : `${brief.socialUseQuery} ${performedEmotion} reaction`;
    return { query, tier: 'Character + emotion' as const, performedEmotion };
  });
  const curatedSceneQueries = Array.isArray(curatedSceneQuery)
    ? curatedSceneQuery
    : [curatedSceneQuery];
  const entries: ReactionSearchQuery[] = [
    ...curatedSceneQueries
      .filter((query) => query.trim())
      .map((query) => ({ query, tier: 'Iconic scene' as const })),
    { query: brief.socialUseQuery, tier: 'Social use' },
    ...emotionQueries,
    ...unmatchedCharacterQueries.map((query) => ({ query, tier: 'Character + emotion' as const })),
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
): Array<T & { reactionQueryTier: ReactionQueryTier; reactionEmotion?: string; reactionEmotions?: string[] }> {
  const sourceOccurrences = new Map<string, RankedReactionCandidate<T>[]>();
  [...candidates].sort((left, right) => left.rank - right.rank).forEach((entry) => {
    const sourceKey = entry.candidate.url.trim() || entry.candidate.thumbnail.trim();
    if (!sourceKey) return;
    const occurrences = sourceOccurrences.get(sourceKey);
    if (occurrences) occurrences.push(entry);
    else sourceOccurrences.set(sourceKey, [entry]);
  });
  return Array.from(sourceOccurrences.values()).map((occurrences) => {
    const preferredOccurrence = occurrences.find((entry) => entry.performedEmotion?.trim()) ?? occurrences[0];
    const reactionEmotions = uniquePerformedEmotions(
      occurrences.flatMap((entry) => entry.performedEmotion ? [entry.performedEmotion] : []),
    );
    return {
      ...preferredOccurrence.candidate,
      reactionQueryTier: preferredOccurrence.queryTier,
      ...(reactionEmotions.length ? {
        reactionEmotion: reactionEmotions[0],
        reactionEmotions,
      } : {}),
    };
  });
}

/**
 * Comparison views only change which already-ranked assets are displayed.
 * Keeping this as a pure operation means selection, provenance, and the
 * candidate's exact search query remain untouched.
 */
export function filterReactionCandidates<T extends { reactionEmotion?: string; reactionEmotions?: string[] }>(
  candidates: T[],
  performedEmotion?: string,
): T[] {
  if (!performedEmotion) return candidates;
  return candidates.filter((candidate) => (
    candidate.reactionEmotion === performedEmotion
    || candidate.reactionEmotions?.includes(performedEmotion)
  ));
}

/**
 * Keeps the first ranked, loadable candidate for every requested emotion in
 * the bounded gallery, then fills any remaining slots in original rank order.
 */
export function retainReactionEmotionCandidates<T extends { reactionEmotion?: string; reactionEmotions?: string[] }>(
  candidates: T[],
  performedEmotion: string[] = [],
  limit = 6,
): T[] {
  const reservedIndexes = new Set<number>();
  uniquePerformedEmotions(performedEmotion).forEach((emotion) => {
    const candidateIndex = candidates.findIndex(
      (candidate) => (
        candidate.reactionEmotion === emotion
        || candidate.reactionEmotions?.includes(emotion)
      ),
    );
    if (candidateIndex >= 0) reservedIndexes.add(candidateIndex);
  });
  const remainingCapacity = Math.max(limit - reservedIndexes.size, 0);
  const leadingIndexes = candidates
    .map((_, index) => index)
    .filter((index) => !reservedIndexes.has(index))
    .slice(0, remainingCapacity);
  const includedIndexes = new Set([...reservedIndexes, ...leadingIndexes]);
  return candidates.filter((_, index) => includedIndexes.has(index));
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