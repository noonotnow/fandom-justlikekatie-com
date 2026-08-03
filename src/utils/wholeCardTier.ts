/**
 * Whole-board (share-card / 3×3 Vibe Guide board) manual tier override.
 *
 * This restores editorial classification of the *entire generated board*
 * as Misprint or Legendary — distinct from the per-image tier controls in
 * the Lightbox (`ImageTier` on a single `GridItemData`). The legacy vanilla
 * implementation exposed this as whole-grid buttons that mutated the chosen
 * batch before export; the React rewrite kept the export-time plumbing
 * (`classifyEditionTier` honors `RankedBatch.misprint` / `.legendary` as
 * manual-override flags) but never wired up the UI to set them.
 *
 * These helpers are pure so the override/reset semantics can be unit-tested
 * without a DOM or React renderer.
 */

import type { StarOfDayData, RankedBatch } from '../hooks/useStarOfDay';
import type { ImageTier } from '../types';

/** Stable identity for a generated board — changes only when a new board
 *  (new date and/or actor) has been generated. Used to reset any manual
 *  whole-card tier override so it never leaks between boards/actors/dates. */
export function boardIdentity(data: Pick<StarOfDayData, 'date' | 'actorId'>): string {
  return `${data.date}::${data.actorId}`;
}

/**
 * Returns a shallow copy of `data` with the manual whole-card tier override
 * applied to the chosen (first) ranked batch — the same batch
 * `classifyEditionTier` and the export renderers read from.
 *
 * Does NOT mutate `data` or any of its nested arrays/objects: the original
 * ranking/retrieval data stays untouched, and individual source images are
 * never tagged. Passing `tier: null` clears the override so automatic
 * classification (count/distinct-sources/fallback-depth heuristics) applies.
 */
export function applyWholeCardTierOverride(
  data: StarOfDayData,
  tier: ImageTier,
): StarOfDayData {
  if (!data.rankedBatches.length) return data;

  const [chosen, ...restBatches] = data.rankedBatches;
  const overriddenChosen: RankedBatch = {
    ...chosen,
    misprint: tier === 'misprint',
    legendary: tier === 'legendary',
  };

  return {
    ...data,
    rankedBatches: [overriddenChosen, ...restBatches],
  };
}

/**
 * Decides what the whole-card manual override tier should be when the
 * tracked board identity may have just changed.
 *
 * - Same board identity → the previous manual selection is preserved
 *   (stable while reviewing/exporting the current board).
 * - Different (or newly-arrived) board identity → resets to `null` so a
 *   freshly generated board/date/actor always starts from automatic
 *   inference, never inheriting a stale override from a prior actor/date.
 */
export function resolveWholeCardTier(
  previousBoardKey: string | null,
  nextBoardKey: string | null,
  previousTier: ImageTier,
): ImageTier {
  if (previousBoardKey === nextBoardKey) return previousTier;
  return null;
}
