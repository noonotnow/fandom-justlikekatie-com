import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  trackCreatorHandoffAttempt,
  trackCreatorHandoffFailure,
  trackCreatorHandoffSuccess,
  trackVeteranFormStarted,
  trackVeteranRelationSelected,
  trackVeteranSubmissionFailure,
  trackVeteranSubmissionSuccess,
} from '../src/utils/analytics.ts';

const productionDocument = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('creator handoff analytics reaches the configured production tracker with bounded payloads', () => {
  assert.match(productionDocument, /googletagmanager\.com\/gtag\/js/);
  assert.match(productionDocument, /function gtag\(\)/);

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
    trackCreatorHandoffAttempt('daily', ['instagram', 'rednote']);
    trackCreatorHandoffSuccess('saved_grid', ['weibo']);
    trackCreatorHandoffFailure(
      'builder',
      ['rednote', 'weibo'],
      new Error('Private upstream detail: CREATE handoff failed (HTTP 503)'),
    );

    assert.deepEqual(events, [
      {
        command: 'event',
        name: 'creator_handoff_attempted',
        data: { entry_point: 'daily', destination_set: 'rednote+instagram' },
      },
      {
        command: 'event',
        name: 'creator_handoff_succeeded',
        data: {
          entry_point: 'saved_grid',
          destination_set: 'weibo',
          receipt_validated: true,
        },
      },
      {
        command: 'event',
        name: 'creator_handoff_failed',
        data: {
          entry_point: 'builder',
          destination_set: 'rednote+weibo',
          failure_category: 'server_rejected',
        },
      },
    ]);
    assert.doesNotMatch(JSON.stringify(events), /Private upstream detail|HTTP 503/);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('a broken analytics tracker cannot interrupt the handoff flow', () => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      umami: {
        track() {
          throw new Error('analytics unavailable');
        },
      },
      gtag() {
        throw new Error('configured analytics unavailable');
      },
    },
  });

  try {
    assert.doesNotThrow(() => trackCreatorHandoffAttempt('daily', ['rednote']));
    assert.doesNotThrow(() => trackCreatorHandoffSuccess('daily', ['rednote']));
    assert.doesNotThrow(() => trackCreatorHandoffFailure('daily', ['rednote'], new Error('network')));
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('queued dataLayer events cover the brief gap before gtag is available', () => {
  const dataLayer: unknown[] = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { dataLayer },
  });

  try {
    trackCreatorHandoffAttempt('builder', ['weibo', 'instagram']);
    assert.deepEqual(dataLayer, [{
      event: 'creator_handoff_attempted',
      entry_point: 'builder',
      destination_set: 'weibo+instagram',
    }]);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('veteran submission analytics uses only coarse, non-identifying payloads', () => {
  const events: Array<{
    command: string;
    name: string;
    data?: Record<string, string | number | boolean>;
  }> = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { origin: 'https://fandom.example.test' },
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
    trackVeteranFormStarted();
    trackVeteranRelationSelected('prediction');
    trackVeteranSubmissionSuccess('prediction');
    trackVeteranSubmissionFailure('entry', { status: 400, message: 'private interpretation' });
    trackVeteranSubmissionFailure('entry', { status: 429 });
    trackVeteranSubmissionFailure('entry', new TypeError('fetch failed'));

    assert.deepEqual(events, [
      {
        command: 'event',
        name: 'veteran_form_started',
        data: {
          surface: 'public_veteran_form',
          page_location: 'https://fandom.example.test/vibe-atlas/veteran-journal',
        },
      },
      {
        command: 'event',
        name: 'veteran_relation_selected',
        data: {
          relation_kind: 'prediction',
          page_location: 'https://fandom.example.test/vibe-atlas/veteran-journal',
        },
      },
      {
        command: 'event',
        name: 'veteran_submission_succeeded',
        data: {
          relation_kind: 'prediction',
          page_location: 'https://fandom.example.test/vibe-atlas/veteran-journal',
        },
      },
      {
        command: 'event',
        name: 'veteran_submission_failed',
        data: {
          relation_kind: 'entry',
          failure_category: 'validation',
          page_location: 'https://fandom.example.test/vibe-atlas/veteran-journal',
        },
      },
      {
        command: 'event',
        name: 'veteran_submission_failed',
        data: {
          relation_kind: 'entry',
          failure_category: 'rate_limit',
          page_location: 'https://fandom.example.test/vibe-atlas/veteran-journal',
        },
      },
      {
        command: 'event',
        name: 'veteran_submission_failed',
        data: {
          relation_kind: 'entry',
          failure_category: 'network',
          page_location: 'https://fandom.example.test/vibe-atlas/veteran-journal',
        },
      },
    ]);
    assert.doesNotMatch(JSON.stringify(events), /private interpretation/);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});