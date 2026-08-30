import type { CreatorPlatform } from './creatorDraft';

type AnalyticsData = Record<string, string | number | boolean>;

export type CreatorHandoffEntryPoint = 'daily' | 'saved_grid' | 'builder';
export type VeteranSubmissionRelation = 'entry' | 'prediction';
type VeteranSubmissionFailureCategory =
  | 'validation'
  | 'rate_limit'
  | 'network'
  | 'server'
  | 'unknown';
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

export function trackVeteranFormStarted(): void {
  trackEvent('veteran_form_started', {
    surface: 'public_veteran_form',
    page_location: veteranAnalyticsPageLocation(),
  });
}

export function trackVeteranRelationSelected(relation: VeteranSubmissionRelation): void {
  trackEvent('veteran_relation_selected', {
    relation_kind: relation,
    page_location: veteranAnalyticsPageLocation(),
  });
}

/** Call only after the sealed-submission response has been accepted. */
export function trackVeteranSubmissionSuccess(relation: VeteranSubmissionRelation): void {
  trackEvent('veteran_submission_succeeded', {
    relation_kind: relation,
    page_location: veteranAnalyticsPageLocation(),
  });
}

export function trackVeteranSubmissionFailure(
  relation: VeteranSubmissionRelation,
  error: unknown,
): void {
  trackEvent('veteran_submission_failed', {
    relation_kind: relation,
    failure_category: classifyVeteranSubmissionFailure(error),
    page_location: veteranAnalyticsPageLocation(),
  });
}

function destinationSet(platforms: readonly CreatorPlatform[]): string {
  const allowed = new Set(platforms);
  return (['rednote', 'weibo', 'instagram'] as const)
    .filter(platform => allowed.has(platform))
    .join('+') || 'unknown';
}

function classifyVeteranSubmissionFailure(value: unknown): VeteranSubmissionFailureCategory {
  const status = value && typeof value === 'object' && 'status' in value
    ? (value as { status?: unknown }).status
    : undefined;
  if (status === 429) return 'rate_limit';
  if (typeof status === 'number' && status >= 400 && status < 500) return 'validation';
  if (typeof status === 'number' && status >= 500) return 'server';

  const message = value instanceof Error ? value.message : '';
  if (/network|fetch|timeout|timed out|abort|could not be reached/i.test(message)) {
    return 'network';
  }
  return 'unknown';
}

function veteranAnalyticsPageLocation(): string {
  const path = '/vibe-atlas/veteran-journal';
  const origin = typeof window !== 'undefined' && typeof window.location?.origin === 'string'
    ? window.location.origin
    : '';
  return `${origin}${path}`;
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