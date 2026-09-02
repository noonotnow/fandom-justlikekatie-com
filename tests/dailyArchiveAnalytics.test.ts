import test from 'node:test';
import assert from 'node:assert/strict';
import {
  trackCollectionOpened,
  trackDailyArchiveEditionSelected,
  trackDailyArchiveOpened,
  trackDailyDropCardSave,
  trackDailyDropEngaged,
  trackDailyDropShared,
  trackDailyDropViewed,
  trackGridBuilderPreviewOpened,
  trackUpgradeStarted,
} from '../src/utils/analytics.ts';

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