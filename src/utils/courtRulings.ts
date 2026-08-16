/**
 * Court rulings persistence — custom raccoon court rulings live in a shared
 * server store (Netlify Blobs via the court-rulings function) so every
 * admin sees one canon list. These are merged with the static
 * RACCOON_COURT_RECORD at display time.
 *
 * Reads are public; adding and removing require an authenticated admin
 * session (the session cookie is sent automatically on same-origin fetches).
 */

import { RACCOON_COURT_RECORD } from '../data/raccoonCourtRecord';

const ENDPOINT = '/.netlify/functions/court-rulings';
const LEGACY_STORAGE_KEY = 'raccoon-court-custom-rulings';

export class CourtRulingsError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseRulings(response: Response): Promise<string[]> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : 'The court record could not be reached.';
    throw new CourtRulingsError(message, response.status);
  }
  const rulings = body && typeof body === 'object' ? (body as { rulings?: unknown }).rulings : null;
  return Array.isArray(rulings) ? rulings.filter((r): r is string => typeof r === 'string') : [];
}

export async function fetchCustomRulings(): Promise<string[]> {
  return parseRulings(await fetch(ENDPOINT));
}

export async function addCustomRuling(ruling: string): Promise<string[]> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ruling: ruling.trim() }),
  });
  return parseRulings(response);
}

export async function removeCustomRuling(index: number, ruling: string): Promise<string[]> {
  const response = await fetch(ENDPOINT, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ index, ruling }),
  });
  return parseRulings(response);
}

/**
 * One-time migration: rulings previously saved in this browser's
 * localStorage are pushed to the shared store, then the local copy is
 * cleared. Safe to call repeatedly — it no-ops once the key is gone, and
 * the server ignores duplicates. Returns the latest shared list.
 */
export async function migrateLegacyRulings(current: string[]): Promise<string[]> {
  let legacy: string[] = [];
  try {
    const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!stored) return current;
    const parsed: unknown = JSON.parse(stored);
    legacy = Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return current;
  }
  let latest = current;
  for (const ruling of legacy) {
    const trimmed = ruling.trim();
    if (!trimmed || latest.includes(trimmed)) continue;
    latest = await addCustomRuling(trimmed);
  }
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  return latest;
}

/**
 * Returns the full list of rulings shown in the AdminAccess popup:
 * all built-in entries followed by the given custom entries (fetched from
 * the shared server store). AdminAccess calls this at render time to
 * populate `allRulings`.
 */
export function getAllRulings(custom: string[] = []): string[] {
  return [...RACCOON_COURT_RECORD, ...custom];
}

/** Fetches the shared custom rulings and merges them with the built-ins. */
export async function fetchAllRulings(): Promise<string[]> {
  return getAllRulings(await fetchCustomRulings());
}
