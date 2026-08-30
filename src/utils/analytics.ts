import type { CreatorPlatform } from './creatorDraft';

type AnalyticsData = Record<string, string | number | boolean>;

export type CreatorHandoffEntryPoint = 'daily' | 'saved_grid' | 'builder';
type HandoffFailureCategory =
  | 'network'
  | 'authentication'
  | 'invalid_response'
  | 'server_rejected'
  | 'precondition'
  | 'unknown';

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
    gtag?: (command: 'event', name: string, data?: AnalyticsData) => void;
    dataLayer?: unknown[];
  }
}

/**
 * Analytics is an optional enhancement. In particular, a tracker that is
 * absent, still loading, or broken must never affect an operator action.
 */
export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === 'undefined') return;

  try {
    window.umami?.track(name, data);
  } catch {
    // One unavailable destination must not prevent the configured tracker.
  }

  try {
    if (window.gtag) {
      window.gtag('event', name, data);
    } else {
      window.dataLayer?.push({ event: name, ...(data ?? {}) });
    }
  } catch {
    // Analytics must never break saving, syncing, retrying, or navigation.
  }
}

export function trackCreatorHandoffAttempt(
  entryPoint: CreatorHandoffEntryPoint,
  platforms: readonly CreatorPlatform[],
): void {
  trackEvent('creator_handoff_attempted', {
    entry_point: entryPoint,
    destination_set: destinationSet(platforms),
  });
}

/** Call only after the handoff client has validated the returned receipt. */
export function trackCreatorHandoffSuccess(
  entryPoint: CreatorHandoffEntryPoint,
  platforms: readonly CreatorPlatform[],
): void {
  trackEvent('creator_handoff_succeeded', {
    entry_point: entryPoint,
    destination_set: destinationSet(platforms),
    receipt_validated: true,
  });
}

export function trackCreatorHandoffFailure(
  entryPoint: CreatorHandoffEntryPoint,
  platforms: readonly CreatorPlatform[],
  error: unknown,
): void {
  trackEvent('creator_handoff_failed', {
    entry_point: entryPoint,
    destination_set: destinationSet(platforms),
    failure_category: classifyHandoffFailure(error),
  });
}

function destinationSet(platforms: readonly CreatorPlatform[]): string {
  const allowed = new Set(platforms);
  return (['rednote', 'weibo', 'instagram'] as const)
    .filter(platform => allowed.has(platform))
    .join('+') || 'unknown';
}

function classifyHandoffFailure(value: unknown): HandoffFailureCategory {
  const message = value instanceof Error ? value.message : '';
  if (/timeout|timed out|abort|could not be reached|network/i.test(message)) {
    return 'network';
  }
  if (/sign in|auth|session|unauthorized|forbidden/i.test(message)) {
    return 'authentication';
  }
  if (/invalid json|unreadable|invalid receipt|composer url|different post destinations|protocol|html/i.test(message)) {
    return 'invalid_response';
  }
  if (/rejected|returned http|intake failed|handoff failed/i.test(message)) {
    return 'server_rejected';
  }
  if (/complete a nine-image|select .* destination/i.test(message)) {
    return 'precondition';
  }
  return 'unknown';
}