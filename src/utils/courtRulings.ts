/**
 * Court rulings persistence — stores custom raccoon court rulings in localStorage.
 * These are merged with the static RACCOON_COURT_RECORD at display time.
 */

import { RACCOON_COURT_RECORD } from '../data/raccoonCourtRecord';

const STORAGE_KEY = 'raccoon-court-custom-rulings';

export function getCustomRulings(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

export function saveCustomRulings(rulings: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rulings));
}

export function addCustomRuling(ruling: string): string[] {
  const current = getCustomRulings();
  const updated = [...current, ruling.trim()];
  saveCustomRulings(updated);
  return updated;
}

export function removeCustomRuling(index: number): string[] {
  const current = getCustomRulings();
  const updated = current.filter((_, i) => i !== index);
  saveCustomRulings(updated);
  return updated;
}

/**
 * Returns the full list of rulings shown in the AdminAccess popup:
 * all built-in entries followed by any custom entries saved in this browser.
 * AdminAccess calls this at render time to populate `allRulings`.
 */
export function getAllRulings(): string[] {
  return [...RACCOON_COURT_RECORD, ...getCustomRulings()];
}
