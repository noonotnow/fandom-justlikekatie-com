import { useState } from 'react';
import type { ImageTier } from '../types';

export function useWholeCardTier(boardKey: string | null): {
  tier: ImageTier;
  setTier: (tier: ImageTier) => void;
} {
  const [selection, setSelection] = useState<{ boardKey: string | null; tier: ImageTier }>({ boardKey, tier: null });
  // Keying the value makes a changed board appear unclassified in the same
  // render, before effects run; stale classifications cannot reach exports.
  if (selection.boardKey !== boardKey) {
    setSelection({ boardKey, tier: null });
  }
  return {
    tier: selection.boardKey === boardKey ? selection.tier : null,
    setTier: tier => setSelection({ boardKey, tier }),
  };
}
