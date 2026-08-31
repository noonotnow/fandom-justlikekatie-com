import test from 'node:test';
import assert from 'node:assert/strict';
import {
  trackDailyArchiveEditionSelected,
  trackDailyArchiveOpened,
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