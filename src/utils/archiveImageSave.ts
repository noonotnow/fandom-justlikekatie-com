import { isValidVibeAtlasEditionDate } from './fandomRoutes';
import { trackArchiveCardAuthorization, type ArchiveCardRetryCategory } from './analytics';

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
 * Ask the server to authorize one individual card save before touching the
 * Collection or legacy bookmark. The request identity is raw, never its
 * image-proxy URL; accept only its echo or the matching date/position identity.
 */
export async function authorizeArchiveImageSave(
  date: string,
  imageId: string,
  position?: number,
): Promise<void> {
  const deny = (failure: ArchiveImageSaveFailure, category?: ArchiveCardRetryCategory): never => {
    trackArchiveCardAuthorization(failure, date, category);
    throw new ArchiveImageSaveError(failure);
  };
  if (!isValidVibeAtlasEditionDate(date) || !imageId.trim()) {
    deny('retry', 'precondition');
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
    return deny('retry', 'transport');
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
    deny('retry', 'billing_delay');
  }
  if (response.status === 401 || access === 'sign_in') {
    deny('sign_in');
  }
  if (access === 'upgrade') {
    deny('upgrade');
  }
  const canonicalImageId = Number.isInteger(position)
    && position! >= 0
    && position! <= 8
    ? `archive:${date}:card-${position}`
    : '';
  if (
    response.ok
    && response.headers.get('content-type')?.toLowerCase().includes('application/json')
    && body?.allowed === true
    && body.date === date
    && typeof body.imageId === 'string'
    && body.imageId.trim().length > 0
    && (
      body.imageId === imageId
      || body.imageId === canonicalImageId
    )
  ) {
    trackArchiveCardAuthorization('allowed', date);
    return;
  }
  deny('retry', response.ok ? 'invalid_response' : 'http');
}