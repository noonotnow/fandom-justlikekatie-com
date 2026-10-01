import { isValidVibeAtlasEditionDate } from './fandomRoutes';

export type ArchiveImageSaveFailure = 'sign_in' | 'upgrade' | 'retry';

export class ArchiveImageSaveError extends Error {
  readonly failure: ArchiveImageSaveFailure;

  constructor(failure: ArchiveImageSaveFailure) {
    super(
      failure === 'sign_in'
        ? 'Sign in to save a card from this edition.'
        : failure === 'upgrade'
          ? 'This older card is available to Fandom Collectors.'
          : 'We could not verify this card’s edition. Your save was not changed.',
    );
    this.name = 'ArchiveImageSaveError';
    this.failure = failure;
  }
}

/**
 * Ask the server to authorize one individual card save before touching local
 * storage. The identity is the raw thumbnail/result identity, never its
 * image-proxy URL.
 */
export async function authorizeArchiveImageSave(date: string, imageId: string): Promise<void> {
  if (!isValidVibeAtlasEditionDate(date) || !imageId.trim()) {
    throw new ArchiveImageSaveError('retry');
  }

  let response: Response;
  try {
    response = await fetch('/.netlify/functions/archive-image-save', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, imageId }),
    });
  } catch {
    throw new ArchiveImageSaveError('retry');
  }

  const body = await response.json().catch(() => null) as {
    allowed?: unknown;
    date?: unknown;
    imageId?: unknown;
    access?: unknown;
    error?: unknown;
  } | null;
  const access = body?.access;
  if (access === 'billing_delay') {
    throw new ArchiveImageSaveError('retry');
  }
  if (response.status === 401 || access === 'sign_in') {
    throw new ArchiveImageSaveError('sign_in');
  }
  if (access === 'upgrade') {
    throw new ArchiveImageSaveError('upgrade');
  }
  if (
    response.ok
    && response.headers.get('content-type')?.toLowerCase().includes('application/json')
    && body?.allowed === true
    && body.date === date
    && typeof body.imageId === 'string'
    && body.imageId.trim().length > 0
  ) return;
  throw new ArchiveImageSaveError('retry');
}