import type { GridItemData, EditorialSet } from '../types';

/**
 * Heuristic-based editorial photoshoot detection.
 *
 * Groups images into editorial sets using:
 * 1. Publisher matching — same publisher = likely same shoot
 * 2. Title keyword similarity — shared keywords hint at related content
 * 3. Tag overlap — shared tags reinforce cohesion
 *
 * Then scores each set for pose variety (title diversity) and visual cohesion.
 */

/** Normalize a string for comparison: lowercase, strip punctuation */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

/** Extract meaningful keywords from a title (drop short/stop words) */
function extractKeywords(title: string): Set<string> {
  const stopWords = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'is']);
  return new Set(
    normalize(title)
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w)),
  );
}

/** Jaccard similarity between two sets */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const val of a) {
    if (b.has(val)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Score pose variety within a set.
 * Higher = more diverse titles/keywords → more pose variety.
 * Lower = repetitive titles → likely similar poses.
 */
function scorePoseVariety(items: GridItemData[]): number {
  if (items.length <= 1) return 0;

  const keywordSets = items.map((item) => extractKeywords(item.title));
  let totalSimilarity = 0;
  let pairs = 0;

  for (let i = 0; i < keywordSets.length; i++) {
    for (let j = i + 1; j < keywordSets.length; j++) {
      totalSimilarity += jaccardSimilarity(keywordSets[i], keywordSets[j]);
      pairs++;
    }
  }

  const avgSimilarity = pairs > 0 ? totalSimilarity / pairs : 0;
  // Invert: high similarity = low variety
  return Math.round((1 - avgSimilarity) * 100) / 100;
}

/**
 * Score cohesion of a set — how "editorial" / visually unified it feels.
 * Based on publisher consistency + tag overlap.
 */
function scoreCohesion(items: GridItemData[]): number {
  if (items.length <= 1) return 1;

  // Publisher consistency: all same publisher = 1.0
  const publishers = new Set(items.map((i) => i.publisher ?? '').filter(Boolean));
  const publisherScore = publishers.size <= 1 ? 1 : 1 / publishers.size;

  // Tag overlap across all items
  const allTags = items.flatMap((i) => i.tags ?? []);
  if (allTags.length === 0) return publisherScore;

  const tagSets = items.map((i) => new Set(i.tags ?? []));
  let tagOverlap = 0;
  let tagPairs = 0;
  for (let i = 0; i < tagSets.length; i++) {
    for (let j = i + 1; j < tagSets.length; j++) {
      tagOverlap += jaccardSimilarity(tagSets[i], tagSets[j]);
      tagPairs++;
    }
  }
  const avgTagOverlap = tagPairs > 0 ? tagOverlap / tagPairs : 0;

  return Math.round(((publisherScore * 0.6 + avgTagOverlap * 0.4)) * 100) / 100;
}

/**
 * Detect editorial sets from a flat list of grid items.
 * Groups by publisher, then refines with keyword/tag similarity.
 * Returns items with editorialSetId assigned + the detected sets.
 */
export function detectEditorialSets(
  items: GridItemData[],
): { items: GridItemData[]; sets: EditorialSet[] } {
  // Group by publisher
  const publisherGroups = new Map<string, GridItemData[]>();

  for (const item of items) {
    const key = normalize(item.publisher ?? 'unknown');
    const group = publisherGroups.get(key) ?? [];
    group.push(item);
    publisherGroups.set(key, group);
  }

  const sets: EditorialSet[] = [];
  const taggedItems: GridItemData[] = [];

  for (const [publisherKey, group] of publisherGroups) {
    // Only flag groups of 2+ as editorial sets
    if (group.length >= 2) {
      const setId = `editorial-${publisherKey.replace(/\s+/g, '-')}`;
      const poseVariety = scorePoseVariety(group);
      const cohesion = scoreCohesion(group);

      sets.push({
        id: setId,
        label: group[0].publisher ?? publisherKey,
        itemIds: group.map((i) => i.id),
        poseVarietyScore: poseVariety,
        cohesionScore: cohesion,
      });

      for (const item of group) {
        taggedItems.push({ ...item, editorialSetId: setId });
      }
    } else {
      taggedItems.push(...group);
    }
  }

  return { items: taggedItems, sets };
}

/**
 * Reorder items so editorial sets are grouped together,
 * with standalone items placed at the end.
 */
export function assembleSmartGrid(
  items: GridItemData[],
  sets: EditorialSet[],
): GridItemData[] {
  const setOrder = new Map(sets.map((s, i) => [s.id, i]));
  const inSet = items.filter((i) => i.editorialSetId);
  const standalone = items.filter((i) => !i.editorialSetId);

  // Sort grouped items by set order, preserving within-set order
  inSet.sort((a, b) => {
    const aOrder = setOrder.get(a.editorialSetId!) ?? 999;
    const bOrder = setOrder.get(b.editorialSetId!) ?? 999;
    return aOrder - bOrder;
  });

  return [...inSet, ...standalone];
}
