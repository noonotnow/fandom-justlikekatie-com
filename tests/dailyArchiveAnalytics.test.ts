import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assessArchiveLinkReviewReadiness,
  type ArchiveLinkReviewNotificationState,
  trackActorSourceNotesLoadFailed,
  trackActorSourceNotesLoadSucceeded,
  trackActorSourceNotesOpened,
  trackCollectionOpened,
  trackArchiveGatedPreviewView,
  trackArchivePageView,
  trackArchiveRecordOpened,
  trackArchiveRecordImpression,
  trackArchiveRebuildLaunched,
  trackArchiveLinkReviewReadiness,
  trackDailyArchiveEditionSelected,
  trackDailyArchiveOpened,
  trackArchiveAccess,
  trackDailyDropCardSave,
  trackDailyDropEngaged,
  trackDailyDropShared,
  trackDailyDropViewed,
  trackGridBuilderPreviewOpened,
  trackHistoricalGridSaved,
  trackUpgradeStarted,
} from '../src/utils/analytics.ts';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const gridBuilderSource = await readFile(
  new URL('../src/components/GridBuilder/GridBuilder.tsx', import.meta.url),
  'utf8',
);

test('archive rebuild analytics records only placement and edition date', () => {
  const events: Array<{ name: string; data?: Record<string, string | number | boolean> }> = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      gtag(_command: string, name: string, data?: Record<string, string | number | boolean>) {
        events.push({ name, data });
      },
    },
  });

  try {
    trackArchiveRebuildLaunched('2026-08-30', 'edition_detail');
    trackArchiveRebuildLaunched('2026-08-29', 'archive_card');
    trackHistoricalGridSaved('2026-08-30');

    assert.deepEqual(events, [
      {
        name: 'archive_rebuild_launched',
        data: { edition_date: '2026-08-30', placement: 'edition_detail' },
      },
      {
        name: 'archive_rebuild_launched',
        data: { edition_date: '2026-08-29', placement: 'archive_card' },
      },
      {
        name: 'historical_grid_saved',
        data: { edition_date: '2026-08-30' },
      },
    ]);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('archive rebuild instrumentation covers both launches and successful local saves', () => {
  assert.match(
    appSource,
    /openEditionBuilder\(selectedEditionDate, 'edition_detail'\)/,
  );
  assert.match(
    appSource,
    /trackArchiveRebuildLaunched\(edition\.date, 'archive_card'\)/,
  );

  const saveIndex = gridBuilderSource.indexOf('await dbSaveGrid(grid);');
  const analyticsIndex = gridBuilderSource.indexOf('trackHistoricalGridSaved(sourceEditionDate);');
  assert.ok(saveIndex >= 0, 'historical grids must be persisted');
  assert.ok(
    analyticsIndex > saveIndex,
    'historical-grid save analytics must run only after local persistence succeeds',
  );
  assert.match(
    gridBuilderSource.slice(saveIndex, analyticsIndex),
    /sourceKind === 'edition' && sourceEditionDate/,
  );
});

test('daily archive analytics records only the edition date and latest flag', () => {
  const events: Array<{
    command: string;
    name: string;
    data?: Record<string, string | number | boolean>;
  }> = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      gtag(
        command: string,
        name: string,
        data?: Record<string, string | number | boolean>,
      ) {
        events.push({ command, name, data });
      },
    },
  });

  try {
    trackDailyArchiveOpened();
    trackDailyArchiveEditionSelected('2026-08-31', true);
    trackDailyArchiveEditionSelected('2026-08-30', false);

    assert.deepEqual(events, [
      {
        command: 'event',
        name: 'daily_archive_opened',
        data: undefined,
      },
      {
        command: 'event',
        name: 'daily_archive_edition_selected',
        data: { edition_date: '2026-08-31', is_latest: true },
      },
      {
        command: 'event',
        name: 'daily_archive_edition_selected',
        data: { edition_date: '2026-08-30', is_latest: false },
      },
    ]);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('archive record analytics uses one bounded event for record type and location', () => {
  const events: Array<{ name: string; data?: Record<string, string | number | boolean> }> = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      gtag(_command: string, name: string, data?: Record<string, string | number | boolean>) {
        events.push({ name, data });
      },
    },
  });

  try {
    for (const location of ['daily', 'archive_picker', 'locked_preview', 'full_archive'] as const) {
      trackArchiveRecordOpened('actor', location);
      trackArchiveRecordOpened('edition', location);
    }

    assert.deepEqual(events, [
      ...['daily', 'archive_picker', 'locked_preview', 'full_archive'].flatMap(location => [
        { name: 'archive_record_opened', data: { record_type: 'actor', location } },
        { name: 'archive_record_opened', data: { record_type: 'edition', location } },
      ]),
    ]);
    assert.deepEqual(
      Object.keys(events[0].data ?? {}).sort(),
      ['location', 'record_type'],
      'record events must not include dates, paths, capability values, or free-form labels',
    );
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('archive review traffic mirrors only canonical aggregate dimensions', async () => {
  const requests: Array<Record<string, unknown>> = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      fetch(_url: string, init: { body: string }) {
        requests.push(JSON.parse(init.body));
        return Promise.resolve({ ok: true });
      },
    },
  });
  try {
    trackArchivePageView('/vibe-atlas');
    trackArchivePageView('/vibe-atlas/archive');
    trackArchiveGatedPreviewView();
    trackArchiveRecordOpened('actor', 'locked_preview');
    await Promise.resolve();
    assert.deepEqual(requests, [
      { event: 'archive_page_view', batchKey: 'archive-link-review', pagePath: '/vibe-atlas' },
      { event: 'archive_page_view', batchKey: 'archive-link-review', pagePath: '/vibe-atlas/archive' },
      { event: 'archive_gated_preview_view', batchKey: 'archive-link-review' },
      {
        event: 'archive_record_opened',
        batchKey: 'archive-link-review',
        recordType: 'actor',
        location: 'locked_preview',
      },
    ]);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('archive record impressions expose only location and canonical available record types', () => {
  const events: Array<{ name: string; data?: Record<string, string | number | boolean> }> = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      gtag(_command: string, name: string, data?: Record<string, string | number | boolean>) {
        events.push({ name, data });
      },
    },
  });

  try {
    trackArchiveRecordImpression(['edition', 'actor', 'edition'], 'archive_picker');
    trackArchiveRecordImpression(['edition'], 'full_archive');
    trackArchiveRecordImpression([], 'daily');

    assert.deepEqual(events, [
      {
        name: 'archive_record_link_impression',
        data: { location: 'archive_picker', available_record_types: 'actor+edition' },
      },
      {
        name: 'archive_record_link_impression',
        data: { location: 'full_archive', available_record_types: 'edition' },
      },
    ]);
    for (const event of events) {
      assert.deepEqual(
        Object.keys(event.data ?? {}).sort(),
        ['available_record_types', 'location'],
        'impressions must not include dates, names, paths, capabilities, accounts, or free-form content',
      );
    }
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('archive link review readiness starts only after confirmed production reporting', () => {
  assert.deepEqual(
    assessArchiveLinkReviewReadiness(null, [
      { date: '2026-09-19', relevantPageviews: 20, archiveRecordOpened: 2 },
    ], new Date('2026-09-20T12:00:00Z')),
    {
      status: 'awaiting_reporting',
      reportingStartDate: null,
      coveredStartDate: null,
      coveredEndDate: null,
      completeDayCount: 0,
      usableDayCount: 0,
      sampleUsable: false,
    },
  );
});

test('archive link review requires 30 complete days with pageviews and record clicks', () => {
  const aggregates = Array.from({ length: 32 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 7, 20 + index)).toISOString().slice(0, 10);
    return {
      date,
      relevantPageviews: index === 5 ? 0 : 20,
      archiveRecordOpened: index === 9 ? 0 : 2,
    };
  });
  const readiness = assessArchiveLinkReviewReadiness(
    '2026-08-21',
    aggregates,
    new Date('2026-09-20T12:00:00Z'),
  );

  assert.deepEqual(readiness, {
    status: 'collecting',
    reportingStartDate: '2026-08-21',
    coveredStartDate: '2026-08-21',
    coveredEndDate: '2026-09-19',
    completeDayCount: 30,
    usableDayCount: 28,
    sampleUsable: false,
  });

  aggregates.push(
    { date: '2026-09-21', relevantPageviews: 50, archiveRecordOpened: 3 },
  );
  const ready = assessArchiveLinkReviewReadiness(
    '2026-08-21',
    aggregates,
    new Date('2026-09-22T01:00:00Z'),
  );
  assert.equal(ready.status, 'ready');
  assert.equal(ready.usableDayCount, 30);
  assert.equal(ready.sampleUsable, true);
  assert.equal(ready.coveredStartDate, '2026-08-21');
  assert.equal(ready.coveredEndDate, '2026-09-21');
});

test('archive link review sorts daily rows without letting duplicate dates inflate readiness', () => {
  const outOfOrder = [
    { date: '2026-09-19', relevantPageviews: 20, archiveRecordOpened: 2 },
    { date: '2026-09-17', relevantPageviews: 20, archiveRecordOpened: 2 },
    { date: '2026-09-18', relevantPageviews: 20, archiveRecordOpened: 2 },
  ];
  assert.deepEqual(
    assessArchiveLinkReviewReadiness(
      '2026-09-17',
      outOfOrder,
      new Date('2026-09-20T12:00:00Z'),
    ),
    {
      status: 'collecting',
      reportingStartDate: '2026-09-17',
      coveredStartDate: '2026-09-17',
      coveredEndDate: '2026-09-19',
      completeDayCount: 3,
      usableDayCount: 3,
      sampleUsable: false,
    },
  );

  assert.throws(
    () => assessArchiveLinkReviewReadiness(
      '2026-09-17',
      [...outOfOrder, outOfOrder[0]],
      new Date('2026-09-20T12:00:00Z'),
    ),
    /daily aggregate date must be unique: 2026-09-19/,
  );
});

test('archive link review rejects invalid dates and invalid aggregate counts', () => {
  const validAggregate = {
    date: '2026-09-19',
    relevantPageviews: 20,
    archiveRecordOpened: 2,
  };
  for (const date of ['2026-02-30', '2026-9-19', 'not-a-date']) {
    assert.throws(
      () => assessArchiveLinkReviewReadiness(
        '2026-09-01',
        [{ ...validAggregate, date }],
        new Date('2026-09-20T12:00:00Z'),
      ),
      /daily aggregate date must be an ISO calendar date/,
    );
  }
  for (const [field, value] of [
    ['relevantPageviews', -1],
    ['relevantPageviews', 1.5],
    ['archiveRecordOpened', -1],
    ['archiveRecordOpened', 1.5],
  ] as const) {
    assert.throws(
      () => assessArchiveLinkReviewReadiness(
        '2026-09-01',
        [{ ...validAggregate, [field]: value }],
        new Date('2026-09-20T12:00:00Z'),
      ),
      new RegExp(`${field} must be a non-negative integer`),
    );
  }
});

test('archive link review excludes pre-confirmation and partial current UTC days', () => {
  const readiness = assessArchiveLinkReviewReadiness(
    '2026-09-18',
    [
      { date: '2026-09-17', relevantPageviews: 20, archiveRecordOpened: 2 },
      { date: '2026-09-18', relevantPageviews: 20, archiveRecordOpened: 2 },
      { date: '2026-09-19', relevantPageviews: 20, archiveRecordOpened: 2 },
      { date: '2026-09-20', relevantPageviews: 20, archiveRecordOpened: 2 },
    ],
    new Date('2026-09-20T23:59:59Z'),
  );

  assert.deepEqual(readiness, {
    status: 'collecting',
    reportingStartDate: '2026-09-18',
    coveredStartDate: '2026-09-18',
    coveredEndDate: '2026-09-19',
    completeDayCount: 2,
    usableDayCount: 2,
    sampleUsable: false,
  });
});

test('archive link readiness signal exposes only aggregate coverage metadata', () => {
  const events: Array<{ name: string; data?: Record<string, string | number | boolean> }> = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      gtag(_command: string, name: string, data?: Record<string, string | number | boolean>) {
        events.push({ name, data });
      },
    },
  });
  try {
    trackArchiveLinkReviewReadiness({
      status: 'ready',
      reportingStartDate: '2026-08-21',
      coveredStartDate: '2026-08-21',
      coveredEndDate: '2026-09-21',
      completeDayCount: 32,
      usableDayCount: 30,
      sampleUsable: true,
    });
    assert.deepEqual(Object.keys(events[0].data ?? {}).sort(), [
      'complete_day_count',
      'covered_end_date',
      'covered_start_date',
      'reporting_start_date',
      'sample_usable',
      'status',
      'usable_day_count',
    ]);
    assert.ok(['awaiting_reporting', 'collecting', 'ready'].includes(
      String(events[0].data?.status),
    ));
    assert.equal(typeof events[0].data?.complete_day_count, 'number');
    assert.equal(typeof events[0].data?.usable_day_count, 'number');
    assert.equal(typeof events[0].data?.sample_usable, 'boolean');
    assert.equal(JSON.stringify(events).match(/visitor|record_path|page_location|capability|url/i), null);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('archive link review notifies once when a measurement period becomes ready', () => {
  const events: Array<{ name: string; data?: Record<string, string | number | boolean> }> = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      gtag(_command: string, name: string, data?: Record<string, string | number | boolean>) {
        events.push({ name, data });
      },
    },
  });
  const collecting = {
    status: 'collecting' as const,
    reportingStartDate: '2026-08-21',
    coveredStartDate: '2026-08-21',
    coveredEndDate: '2026-09-19',
    completeDayCount: 30,
    usableDayCount: 29,
    sampleUsable: false,
  };
  const ready = {
    ...collecting,
    status: 'ready' as const,
    coveredEndDate: '2026-09-20',
    completeDayCount: 31,
    usableDayCount: 30,
    sampleUsable: true,
  };

  try {
    let state: ArchiveLinkReviewNotificationState | null = null;
    state = trackArchiveLinkReviewReadiness(collecting, state);
    state = trackArchiveLinkReviewReadiness(ready, state);
    state = trackArchiveLinkReviewReadiness(ready, state);

    assert.deepEqual(events.map(event => event.name), [
      'archive_link_review_readiness',
      'archive_link_review_readiness',
      'archive_link_review_ready',
      'archive_link_review_readiness',
    ]);
    assert.deepEqual(state, {
      reportingStartDate: '2026-08-21',
      status: 'ready',
      readyNotificationSent: true,
    });
    const notification = events.find(event => event.name === 'archive_link_review_ready');
    assert.equal(
      JSON.stringify(notification).match(/visitor|record_path|page_location|capability|url/i),
      null,
    );
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('resetting the archive measurement start permits one new ready notification', () => {
  const events: Array<{ name: string }> = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      gtag(_command: string, name: string) {
        events.push({ name });
      },
    },
  });
  const oldState: ArchiveLinkReviewNotificationState = {
    reportingStartDate: '2026-08-21',
    status: 'ready',
    readyNotificationSent: true,
  };
  const resetCollecting = {
    status: 'collecting' as const,
    reportingStartDate: '2026-09-22',
    coveredStartDate: '2026-09-22',
    coveredEndDate: '2026-10-20',
    completeDayCount: 29,
    usableDayCount: 29,
    sampleUsable: false,
  };

  try {
    const resetState = trackArchiveLinkReviewReadiness(resetCollecting, oldState);
    assert.deepEqual(resetState, {
      reportingStartDate: '2026-09-22',
      status: 'collecting',
      readyNotificationSent: false,
    });
    const readyState = trackArchiveLinkReviewReadiness({
      ...resetCollecting,
      status: 'ready',
      coveredEndDate: '2026-10-21',
      completeDayCount: 30,
      usableDayCount: 30,
      sampleUsable: true,
    }, resetState);
    trackArchiveLinkReviewReadiness({
      ...resetCollecting,
      status: 'ready',
      coveredEndDate: '2026-10-21',
      completeDayCount: 30,
      usableDayCount: 30,
      sampleUsable: true,
    }, readyState);

    assert.equal(
      events.filter(event => event.name === 'archive_link_review_ready').length,
      1,
    );
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('every visible archive record-link location is instrumented', () => {
  for (const [location, expectedActorLinks, expectedEditionLinks] of [
    ['daily', 1, 1],
    ['archive_picker', 1, 1],
    ['locked_preview', 1, 1],
    ['full_archive', 1, 2],
  ] as const) {
    const actorCalls = appSource.match(
      new RegExp(`trackArchiveRecordOpened\\('actor', '${location}'\\)`, 'g'),
    ) ?? [];
    const editionCalls = appSource.match(
      new RegExp(`trackArchiveRecordOpened\\('edition', '${location}'\\)`, 'g'),
    ) ?? [];
    assert.equal(actorCalls.length, expectedActorLinks, `${location} actor record links`);
    assert.equal(editionCalls.length, expectedEditionLinks, `${location} edition record links`);
  }
});

test('every archive record-link placement has a visibility impression', () => {
  for (const [location, expectedPlacements] of [
    ['daily', 1],
    ['archive_picker', 1],
    ['locked_preview', 1],
    ['full_archive', 2],
  ] as const) {
    const placements = appSource.match(
      new RegExp(`location="${location}"`, 'g'),
    ) ?? [];
    assert.equal(placements.length, expectedPlacements, `${location} visible placements`);
  }
  assert.match(appSource, /new IntersectionObserver/);
  assert.match(appSource, /impressedPresentationRef\.current === presentationKey/);
});

test('archive funnel analytics keeps preview, intent, auth, checkout, restoration, denial, and full use privacy-safe', () => {
  const events: Array<{ name: string; data?: Record<string, string | number | boolean> }> = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      gtag(_command: string, name: string, data?: Record<string, string | number | boolean>) {
        events.push({ name, data });
      },
    },
  });
  try {
    for (const [action, reason] of [
      ['preview_view', 'sign_in'],
      ['gated_intent', 'sign_in'],
      ['sign_in', 'requested'],
      ['checkout', undefined],
      ['restored', 'sign_in'],
      ['denied', 'billing_delay'],
      ['full_use', undefined],
    ] as const) trackArchiveAccess(action, '2026-09-01', reason);
    assert.deepEqual(events.map(event => event.name), [
      'archive_preview_view', 'archive_gated_intent', 'archive_sign_in',
      'archive_checkout', 'archive_restored', 'archive_denied', 'archive_full_use',
    ]);
    assert.equal(JSON.stringify(events).includes('account'), false);
    assert.equal(JSON.stringify(events).includes('email'), false);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('broken analytics cannot interrupt daily archive interactions', () => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      umami: {
        track() {
          throw new Error('analytics unavailable');
        },
      },
      gtag() {
        throw new Error('analytics unavailable');
      },
    },
  });

  try {
    assert.doesNotThrow(() => {
      trackDailyArchiveOpened();
      trackDailyArchiveEditionSelected('2026-08-31', true);
    });
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('actor source-note analytics uses bounded membership and Builder mode properties', () => {
  const events: Array<{ name: string; data?: Record<string, string | number | boolean> }> = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      gtag(_command: string, name: string, data?: Record<string, string | number | boolean>) {
        events.push({ name, data });
      },
    },
  });

  try {
    trackActorSourceNotesOpened(false, 'smart');
    trackActorSourceNotesOpened(true, 'manual');
    trackActorSourceNotesLoadSucceeded(true, 'smart');
    trackActorSourceNotesLoadFailed(true, 'manual');

    assert.deepEqual(events, [
      { name: 'actor_source_notes_opened', data: { is_member: false, builder_mode: 'smart' } },
      { name: 'actor_source_notes_opened', data: { is_member: true, builder_mode: 'manual' } },
      { name: 'actor_source_notes_load_succeeded', data: { is_member: true, builder_mode: 'smart' } },
      { name: 'actor_source_notes_load_failed', data: { is_member: true, builder_mode: 'manual' } },
    ]);
    for (const event of events) {
      assert.deepEqual(Object.keys(event.data ?? {}).sort(), ['builder_mode', 'is_member']);
    }
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('broken analytics cannot interrupt actor source-note interactions', () => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      umami: { track() { throw new Error('analytics unavailable'); } },
      gtag() { throw new Error('analytics unavailable'); },
    },
  });

  try {
    assert.doesNotThrow(() => {
      trackActorSourceNotesOpened(false, 'smart');
      trackActorSourceNotesLoadSucceeded(true, 'manual');
      trackActorSourceNotesLoadFailed(true, 'manual');
    });
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('Daily Drop analytics uses bounded edition, position, and action fields', () => {
  const events: Array<{
    command: string;
    name: string;
    data?: Record<string, string | number | boolean>;
  }> = [];
  const requests: Array<Record<string, unknown>> = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      gtag(
        command: string,
        name: string,
        data?: Record<string, string | number | boolean>,
      ) {
        events.push({ command, name, data });
      },
      fetch(_url: string, init: { body: string }) {
        requests.push(JSON.parse(init.body));
        return Promise.resolve({ ok: true });
      },
    },
  });

  try {
    trackDailyDropViewed('2026-08-31', false);
    trackDailyDropEngaged('2026-08-31', 'three_cards');
    trackDailyDropCardSave('2026-08-31', 4, true);
    trackDailyDropShared('2026-08-31', 'edition_link');
    trackCollectionOpened('2026-08-31');
    trackGridBuilderPreviewOpened(false);
    trackUpgradeStarted('grid_builder');

    assert.deepEqual(events.map(({ name, data }) => ({ name, data })), [
      {
        name: 'daily_drop_viewed',
        data: { edition_date: '2026-08-31', is_archive: false },
      },
      {
        name: 'daily_drop_engaged',
        data: { edition_date: '2026-08-31', engagement_reason: 'three_cards' },
      },
      {
        name: 'daily_drop_card_save_changed',
        data: { edition_date: '2026-08-31', position: 4, saved: true },
      },
      {
        name: 'daily_drop_shared',
        data: { edition_date: '2026-08-31', share_method: 'edition_link' },
      },
      {
        name: 'collection_opened',
        data: { last_saved_edition: '2026-08-31' },
      },
      {
        name: 'grid_builder_preview_opened',
        data: { is_member: false },
      },
      {
        name: 'upgrade_started',
        data: { boundary: 'grid_builder' },
      },
    ]);
    assert.deepEqual(requests, [
      {
        event: 'daily_drop_view',
        batchKey: 'vibe-atlas:2026-08-31',
        editionDate: '2026-08-31',
      },
      {
        event: 'daily_drop_engaged',
        batchKey: 'vibe-atlas:2026-08-31',
        editionDate: '2026-08-31',
        engagementReason: 'three_cards',
      },
      {
        event: 'daily_drop_card_save',
        batchKey: 'vibe-atlas:2026-08-31',
        editionDate: '2026-08-31',
        position: 4,
        saved: true,
      },
      {
        event: 'daily_drop_share',
        batchKey: 'vibe-atlas:2026-08-31',
        editionDate: '2026-08-31',
        shareMethod: 'edition_link',
      },
      {
        event: 'daily_drop_collection_open',
        batchKey: 'vibe-atlas:2026-08-31',
        editionDate: '2026-08-31',
      },
    ]);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});