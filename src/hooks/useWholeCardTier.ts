import { useEffect, useRef, useState } from 'react';
import type { ImageTier } from '../types';
import { resolveWholeCardTier } from '../utils/wholeCardTier';

/**
 * Manual whole-board (share-card) tier override state.
 *
 * Stable while reviewing/exporting the *current* board: the manual
 * selection persists across re-renders as long as `boardKey` is unchanged.
 * Resets to `null` (automatic classification) whenever `boardKey` changes —
 * i.e. a new board was generated (new date and/or actor) — so a manual
 * override never leaks onto a different board/actor/date.
 */
export function useWholeCardTier(boardKey: string | null): {
  tier: ImageTier;
  setTier: (tier: ImageTier) => void;
} {
  const [tier, setTier] = useState<ImageTier>(null);
  const previousBoardKeyRef = useRef<string | null>(boardKey);

  useEffect(() => {
    setTier((current) => resolveWholeCardTier(previousBoardKeyRef.current, boardKey, current));
    previousBoardKeyRef.current = boardKey;
  }, [boardKey]);

  return { tier, setTier };
}
