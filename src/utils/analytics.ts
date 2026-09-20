import type { CreatorPlatform } from './creatorDraft';

type AnalyticsData = Record<string, string | number | boolean>;
type DailyDropEngagementReason = 'three_cards' | 'twenty_seconds';
type DailyDropShareMethod = 'edition_link' | 'image';
export type ArchiveRecordType = 'actor' | 'edition';
export type ArchiveRecordLocation =
  | 'daily'
  | 'archive_picker'
  | 'locked_preview'
  | 'full_archive';
export interface ArchiveLinkDailyAggregate {
  date: string;
  relevantPageviews: number;
  archiveRecordOpened: number;
}
export interface ArchiveLinkReviewReadiness {
  status: 'awaiting_reporting' | 'collecting' | 'ready';
  reportingStartDate: string | null;
  coveredStartDate: string | null;
  coveredEndDate: string | null;
  completeDayCount: number;
  usableDayCount: number;
  sampleUsable: boolean;
}
export interface ArchiveLinkReviewNotificationState {
  reportingStartDate: string | null;
  status: ArchiveLinkReviewReadiness['status'];
  readyNotificationSent: boolean;
}
export type GridBuilderMode = 'smart' | 'manual';

interface DailyDropServerEvent {
  event:
    | 'daily_drop_view'
    | 'daily_drop_engaged'
    | 'daily_drop_card_save'
    | 'daily_drop_share'
    | 'daily_drop_collection_open';
  batchKey: string;
  editionDate: string;
  position?: number;
  saved?: boolean;
  engagementReason?: DailyDropEngagementReason;
  shareMethod?: DailyDropShareMethod;
}

export type CreatorHandoffEntryPoint = 'operator_console';
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

function recordDailyDropEvent(event: DailyDropServerEvent): void {
  try {
    void window.fetch('/.netlify/functions/log-engagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Analytics must never interrupt the visitor's action.
  }
}

function dailyDropEvent(
  editionDate: string,
  event: DailyDropServerEvent['event'],
): Pick<DailyDropServerEvent, 'event' | 'batchKey' | 'editionDate'> {
  return {
    event,
    batchKey: `vibe-atlas:${editionDate}`,
    editionDate,
  };
}

export function trackDailyArchiveOpened(): void {
  trackEvent('daily_archive_opened');
}

export function trackDailyArchiveEditionSelected(
  editionDate: string,
  isLatest: boolean,
): void {
  trackEvent('daily_archive_edition_selected', {
    edition_date: editionDate,
    is_latest: isLatest,
  });
}

export function trackArchiveRecordOpened(
  recordType: ArchiveRecordType,
  location: ArchiveRecordLocation,
): void {
  trackEvent('archive_record_opened', {
    record_type: recordType,
    location,
  });
}

export function trackArchiveRecordImpression(
  recordTypes: readonly ArchiveRecordType[],
  location: ArchiveRecordLocation,
): void {
  const availableRecordTypes = (['actor', 'edition'] as const)
    .filter(recordType => recordTypes.includes(recordType))
    .join('+');
  if (!availableRecordTypes) return;

  trackEvent('archive_record_link_impression', {
    location,
    available_record_types: availableRecordTypes,
  });
}

const ARCHIVE_LINK_REVIEW_USABLE_DAYS = 30;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Assesses only privacy-safe daily aggregates. The current UTC day is excluded
 * because it is not complete, and reporting cannot predate explicit production
 * confirmation.
 */
export function assessArchiveLinkReviewReadiness(
  reportingStartDate: string | null,
  dailyAggregates: readonly ArchiveLinkDailyAggregate[],
  asOf: Date = new Date(),
): ArchiveLinkReviewReadiness {
  if (!reportingStartDate) {
    return {
      status: 'awaiting_reporting',
      reportingStartDate: null,
      coveredStartDate: null,
      coveredEndDate: null,
      completeDayCount: 0,
      usableDayCount: 0,
      sampleUsable: false,
    };
  }
  assertIsoDate(reportingStartDate, 'reportingStartDate');
  const currentUtcDate = asOf.toISOString().slice(0, 10);
  const byDate = new Map<string, ArchiveLinkDailyAggregate>();
  for (const aggregate of dailyAggregates) {
    assertIsoDate(aggregate.date, 'daily aggregate date');
    assertAggregateCount(aggregate.relevantPageviews, 'relevantPageviews');
    assertAggregateCount(aggregate.archiveRecordOpened, 'archiveRecordOpened');
    if (byDate.has(aggregate.date)) {
      throw new TypeError(`daily aggregate date must be unique: ${aggregate.date}`);
    }
    byDate.set(aggregate.date, aggregate);
  }

  const completeDates = [...byDate.keys()]
    .filter(date => date >= reportingStartDate && date < currentUtcDate)
    .sort();
  const usableDates = completeDates.filter(date => {
    const aggregate = byDate.get(date)!;
    return aggregate.relevantPageviews > 0 && aggregate.archiveRecordOpened > 0;
  });
  const coveredDates = usableDates.slice(0, ARCHIVE_LINK_REVIEW_USABLE_DAYS);
  const sampleUsable = coveredDates.length === ARCHIVE_LINK_REVIEW_USABLE_DAYS;

  return {
    status: sampleUsable ? 'ready' : 'collecting',
    reportingStartDate,
    coveredStartDate: coveredDates[0] ?? completeDates[0] ?? null,
    coveredEndDate: coveredDates.at(-1) ?? completeDates.at(-1) ?? null,
    completeDayCount: completeDates.length,
    usableDayCount: usableDates.length,
    sampleUsable,
  };
}

/**
 * Emits no visitor, path, record, URL, or event-level data. The returned state
 * is safe to persist and pass back on the next reporting run. A changed
 * reporting start begins a new notification cycle.
 */
export function trackArchiveLinkReviewReadiness(
  readiness: ArchiveLinkReviewReadiness,
  previousNotificationState: ArchiveLinkReviewNotificationState | null = null,
): ArchiveLinkReviewNotificationState {
  trackEvent('archive_link_review_readiness', {
    status: readiness.status,
    reporting_start_date: readiness.reportingStartDate ?? 'unconfirmed',
    covered_start_date: readiness.coveredStartDate ?? 'none',
    covered_end_date: readiness.coveredEndDate ?? 'none',
    complete_day_count: readiness.completeDayCount,
    usable_day_count: readiness.usableDayCount,
    sample_usable: readiness.sampleUsable,
  });

  const sameMeasurementPeriod = previousNotificationState?.reportingStartDate
    === readiness.reportingStartDate;
  const readyNotificationSent = sameMeasurementPeriod
    && previousNotificationState?.readyNotificationSent === true;
  const shouldNotify = readiness.status === 'ready' && !readyNotificationSent;

  if (shouldNotify) {
    trackEvent('archive_link_review_ready', {
      reporting_start_date: readiness.reportingStartDate ?? 'unconfirmed',
      covered_start_date: readiness.coveredStartDate ?? 'none',
      covered_end_date: readiness.coveredEndDate ?? 'none',
      complete_day_count: readiness.completeDayCount,
      usable_day_count: readiness.usableDayCount,
      sample_usable: true,
    });
  }

  return {
    reportingStartDate: readiness.reportingStartDate,
    status: readiness.status,
    readyNotificationSent: shouldNotify || readyNotificationSent,
  };
}

function assertIsoDate(value: string, field: string): void {
  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  if (
    !ISO_DATE_PATTERN.test(value)
    || Number.isNaN(parsedDate.getTime())
    || parsedDate.toISOString().slice(0, 10) !== value
  ) {
    throw new TypeError(`${field} must be an ISO calendar date`);
  }
}

function assertAggregateCount(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative integer`);
  }
}

export function trackArchiveAccess(
  action: 'preview_view' | 'gated_intent' | 'sign_in' | 'checkout' | 'restored' | 'denied' | 'full_use',
  editionDate: string,
  reason?: string,
): void {
  trackEvent(`archive_${action}`, {
    edition_date: editionDate,
    ...(reason ? { access_reason: reason } : {}),
  });
}

export function trackDailyDropViewed(editionDate: string, isArchive: boolean): void {
  trackEvent('daily_drop_viewed', {
    edition_date: editionDate,
    is_archive: isArchive,
  });
  recordDailyDropEvent(dailyDropEvent(editionDate, 'daily_drop_view'));
}

export function trackDailyDropEngaged(
  editionDate: string,
  reason: DailyDropEngagementReason,
): void {
  trackEvent('daily_drop_engaged', {
    edition_date: editionDate,
    engagement_reason: reason,
  });
  recordDailyDropEvent({
    ...dailyDropEvent(editionDate, 'daily_drop_engaged'),
    engagementReason: reason,
  });
}

export function trackDailyDropCardSave(
  editionDate: string,
  position: number,
  saved: boolean,
): void {
  trackEvent('daily_drop_card_save_changed', {
    edition_date: editionDate,
    position,
    saved,
  });
  recordDailyDropEvent({
    ...dailyDropEvent(editionDate, 'daily_drop_card_save'),
    position,
    saved,
  });
}

export function trackDailyDropShared(
  editionDate: string,
  method: DailyDropShareMethod,
): void {
  trackEvent('daily_drop_shared', {
    edition_date: editionDate,
    share_method: method,
  });
  recordDailyDropEvent({
    ...dailyDropEvent(editionDate, 'daily_drop_share'),
    shareMethod: method,
  });
}

export function trackCollectionOpened(lastSavedEdition?: string): void {
  trackEvent('collection_opened', lastSavedEdition
    ? { last_saved_edition: lastSavedEdition }
    : undefined);
  if (!lastSavedEdition) return;

  recordDailyDropEvent(dailyDropEvent(lastSavedEdition, 'daily_drop_collection_open'));
}

export function trackGridBuilderPreviewOpened(isMember: boolean): void {
  trackEvent('grid_builder_preview_opened', { is_member: isMember });
}

function actorSourceNotesData(isMember: boolean, builderMode: GridBuilderMode): AnalyticsData {
  return {
    is_member: isMember,
    builder_mode: builderMode,
  };
}

export function trackActorSourceNotesOpened(
  isMember: boolean,
  builderMode: GridBuilderMode,
): void {
  trackEvent('actor_source_notes_opened', actorSourceNotesData(isMember, builderMode));
}

export function trackActorSourceNotesLoadSucceeded(
  isMember: boolean,
  builderMode: GridBuilderMode,
): void {
  trackEvent('actor_source_notes_load_succeeded', actorSourceNotesData(isMember, builderMode));
}

export function trackActorSourceNotesLoadFailed(
  isMember: boolean,
  builderMode: GridBuilderMode,
): void {
  trackEvent('actor_source_notes_load_failed', actorSourceNotesData(isMember, builderMode));
}

export function trackUpgradeStarted(boundary: 'grid_builder' | 'premium_export'): void {
  trackEvent('upgrade_started', { boundary });
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
  if (/invalid json|unreadable|invalid(?: Creator Draft)? receipt|composer url|different post destinations|protocol|html/i.test(message)) {
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
