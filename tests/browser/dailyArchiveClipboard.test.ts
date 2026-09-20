import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { BROWSER_ENGINES, launchBrowser } from './browserEngines.ts';

const ARCHIVED_DATE = '2026-08-31';
const FALLBACK_DATE = '2026-08-30';
const ACTOR_RECORD_PATH = '/vibe-atlas/actors/browser-archive-actor';
const EDITION_RECORD_PATH = `/vibe-atlas/editions/${ARCHIVED_DATE}`;
const MALFORMED_DATE = '2026-08-29';

async function startApp(): Promise<{ server: ViteDevServer; origin: string }> {
  const server = await createServer({
    configFile: 'vite.config.ts',
    server: { host: '127.0.0.1', port: 5000, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    throw new Error('The browser test server did not expose a TCP port.');
  }
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function installClipboardHarness(page: Page): Promise<void> {
  await page.addInitScript(`
    window.__archiveClipboardMode = "success";
    window.__archiveClipboardWrites = [];
    Object.defineProperty(Navigator.prototype, "clipboard", {
      configurable: true,
      get: function () {
        return {
          writeText: async function (text) {
            if (window.__archiveClipboardMode === "failure") {
              throw new Error("clipboard denied");
            }
            window.__archiveClipboardWrites.push(text);
          }
        };
      }
    });
  `);
}

function starOfDay(date: string, includePublicRecord = false) {
  return {
    actorId: 'browser-archive-actor',
    actorName: 'Browser Archive Actor',
    actorShortNameEn: 'Browser Archive Actor',
    actorAccentColor: '#aabbcc',
    vibeEmoji: '🧪',
    vibeLabel: 'Browser Archive Vibe',
    vibeLabelEn: 'Browser Archive Vibe',
    vibeSubtitle: '',
    vibeSubtitleEn: '',
    rankedBatches: [{
      query: 'browser archive test',
      results: [{
        title: 'Browser archive card',
        thumbnail: 'https://images.browser-archive.test/card.jpg',
        link: 'https://browser-archive.test/card',
        source: 'browser-archive.test',
      }],
      count: 1,
      distinctSources: 1,
      provider: null,
    }],
    date,
    ...(includePublicRecord
      ? {
          publicRecord: {
            actorPath: ACTOR_RECORD_PATH,
            editionPath: EDITION_RECORD_PATH,
          },
        }
      : {}),
  };
}

function archiveEditions() {
  return [
    {
      date: ARCHIVED_DATE,
      actorName: 'Browser Archive Actor',
      actorShortNameEn: 'Browser Archive Actor',
      vibeEmoji: '🧪',
      vibeLabel: 'Browser Archive Vibe',
      vibeLabelEn: 'Browser Archive Vibe',
      vibeSubtitleEn: '',
      publicRecord: {
        actorPath: ACTOR_RECORD_PATH,
        editionPath: EDITION_RECORD_PATH,
      },
    },
    {
      date: FALLBACK_DATE,
      actorName: 'Fallback Archive Actor',
      actorShortNameEn: 'Fallback Archive Actor',
      vibeEmoji: '🗃️',
      vibeLabel: 'Fallback Archive Vibe',
      vibeLabelEn: 'Fallback Archive Vibe',
      vibeSubtitleEn: '',
      access: 'free',
    },
  ];
}

function malformedArchiveEdition() {
  return {
    date: MALFORMED_DATE,
    actorName: 'Partial Record Actor',
    actorShortNameEn: 'Partial Record Actor',
    vibeEmoji: '🧩',
    vibeLabel: 'Partial Record Vibe',
    vibeLabelEn: 'Partial Record Vibe',
    vibeSubtitleEn: '',
    access: 'free',
    publicRecord: {
      actorPath: '/vibe-atlas/actors/partial-record-actor',
    },
  };
}

for (const engine of BROWSER_ENGINES) {
  test(`archived edition copy uses its date and announces clipboard success or failure in ${engine.name}`, { timeout: 45_000 }, async () => {
    const browser = await launchBrowser(engine.type);
    let app: Awaited<ReturnType<typeof startApp>> | undefined;
    try {
      app = await startApp();
      const { origin } = app;
      const page = await browser.newPage();
      await installClipboardHarness(page);
      await page.route('https://www.googletagmanager.com/**', route => route.abort());
      await page.route('**/api/auth/session', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ user: null }),
      }));
      await page.route('**/api/membership/status', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ state: 'inactive', isMember: false }),
      }));
      await page.route('**/.netlify/functions/star-of-day**', async route => {
        const url = new URL(route.request().url());
        const response = url.searchParams.get('archive') === '1'
          ? {
              editions: [{
                date: ARCHIVED_DATE,
                actorName: 'Browser Archive Actor',
                actorShortNameEn: 'Browser Archive Actor',
                vibeEmoji: '🧪',
                vibeLabel: 'Browser Archive Vibe',
                vibeLabelEn: 'Browser Archive Vibe',
                vibeSubtitleEn: '',
              }],
            }
          : starOfDay(url.searchParams.get('date') ?? '2026-09-02');
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(response),
        });
      });

      await page.goto(`${origin}/vibe-atlas`, { waitUntil: 'domcontentloaded' });
      await page.getByText("Today's curated card drop").waitFor();
      assert.equal(
        await page.getByRole('button', { name: 'Copy archived edition link' }).count(),
        0,
        'today must not show the archived-edition copy action',
      );

      await page.getByRole('button', { name: /Browse past editions/ }).click();
      await page.getByRole('button', { name: /Aug 31, 2026/ }).click();
      await page.getByText('Archived card drop · Aug 31, 2026').waitFor();

      await page.getByRole('button', { name: 'Copy archived edition link' }).click();
      await page.getByText('Copied link for Aug 31, 2026.', { exact: true }).waitFor();
      assert.deepEqual(
        await page.evaluate('window.__archiveClipboardWrites'),
        [`${origin}/vibe-atlas?date=${ARCHIVED_DATE}`],
        'the clipboard must receive the exact date-aware archive URL',
      );

      await page.evaluate('window.__archiveClipboardMode = "failure"');
      await page.getByRole('button', { name: 'Copy archived edition link' }).click();
      await page.getByText(
        'Could not copy this archived edition link. Please copy the address from your browser.',
        { exact: true },
      ).waitFor();

      await page.getByRole('button', { name: /Return to today/ }).click();
      await page.getByText("Today's curated card drop").waitFor();
      assert.equal(
        await page.getByRole('button', { name: 'Copy archived edition link' }).count(),
        0,
        'returning to today must remove the archived-edition copy action',
      );
    } finally {
      await browser.close();
      await app?.server.close();
    }
  });
}

test('approved public-record links work across today, the picker, and the full archive while unapproved entries keep their board fallback', { timeout: 45_000 }, async () => {
  const engine = BROWSER_ENGINES[0];
  const browser = await launchBrowser(engine.type);
  let app: Awaited<ReturnType<typeof startApp>> | undefined;
  try {
    app = await startApp();
    const page = await browser.newPage();
    await page.route('https://www.googletagmanager.com/**', route => route.abort());
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ user: null }),
    }));
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'inactive', isMember: false }),
    }));
    await page.route('**/.netlify/functions/image-proxy**', route => route.abort());
    await page.route('**/.netlify/functions/star-of-day**', async route => {
      const url = new URL(route.request().url());
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          url.searchParams.get('archive') === '1'
            ? { editions: archiveEditions() }
            : starOfDay(url.searchParams.get('date') ?? '2026-09-02', true),
        ),
      });
    });

    await page.goto(`${app.origin}/vibe-atlas`, { waitUntil: 'domcontentloaded' });
    const todayRecords = page.getByRole('navigation', { name: 'Curated public records' });
    await todayRecords.waitFor();
    assert.equal(
      await todayRecords.getByRole('link', { name: /actor record/ }).getAttribute('href'),
      ACTOR_RECORD_PATH,
    );
    assert.equal(
      await todayRecords.getByRole('link', { name: /permanent record/ }).getAttribute('href'),
      EDITION_RECORD_PATH,
    );

    await page.getByRole('button', { name: /Browse past editions/ }).click();
    const approvedPickerEntry = page.locator('.daily-archive__edition-group').filter({
      hasText: 'Browser Archive Actor',
    });
    assert.equal(
      await approvedPickerEntry.getByRole('link', { name: 'Actor record' }).getAttribute('href'),
      ACTOR_RECORD_PATH,
    );
    assert.equal(
      await approvedPickerEntry.getByRole('link', { name: 'Edition record' }).getAttribute('href'),
      EDITION_RECORD_PATH,
    );
    const fallbackPickerEntry = page.locator('.daily-archive__edition-group').filter({
      hasText: 'Fallback Archive Actor',
    });
    await fallbackPickerEntry.waitFor();
    assert.equal(await fallbackPickerEntry.getByRole('link').count(), 0);

    await page.getByRole('button', { name: 'Vibe Atlas archive' }).click();
    await page.getByRole('heading', { name: 'The Star of the Day Archive' }).waitFor();
    const approvedCard = page.locator('.archive-card').filter({ hasText: 'Browser Archive Actor' });
    assert.equal(
      await approvedCard.getByRole('link', { name: /Open Issue/ }).getAttribute('href'),
      EDITION_RECORD_PATH,
    );
    assert.equal(
      await approvedCard.getByRole('link', { name: 'Actor record' }).getAttribute('href'),
      ACTOR_RECORD_PATH,
    );
    assert.equal(
      await approvedCard.getByRole('link', { name: 'Edition record' }).getAttribute('href'),
      EDITION_RECORD_PATH,
    );

    const fallbackCard = page.locator('.archive-card').filter({ hasText: 'Fallback Archive Actor' });
    const fallbackMainLink = fallbackCard.getByRole('link', { name: /Open Issue/ });
    assert.equal(
      await fallbackMainLink.getAttribute('href'),
      `/vibe-atlas?date=${FALLBACK_DATE}`,
    );
    assert.match(await fallbackMainLink.textContent() ?? '', /Open the nine-card board/);
    assert.equal(await fallbackCard.getByRole('link', { name: 'Actor record' }).count(), 0);
    assert.equal(await fallbackCard.getByRole('link', { name: 'Edition record' }).count(), 0);
  } finally {
    await browser.close();
    await app?.server.close();
  }
});

test('partial public-record metadata stays fail-closed across today, the picker, the locked preview, and the full archive', { timeout: 45_000 }, async () => {
  const engine = BROWSER_ENGINES[0];
  const browser = await launchBrowser(engine.type);
  let app: Awaited<ReturnType<typeof startApp>> | undefined;
  try {
    app = await startApp();
    const page = await browser.newPage();
    await page.route('https://www.googletagmanager.com/**', route => route.abort());
    await page.route('**/.netlify/functions/image-proxy**', route => route.abort());
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ user: null }),
    }));
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'inactive', isMember: false }),
    }));
    await page.route('**/.netlify/functions/star-of-day**', async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('archive') === '1') {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ editions: [malformedArchiveEdition()] }),
        });
        return;
      }
      if (url.searchParams.get('date') === MALFORMED_DATE) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'archive_access_required',
            access: 'sign_in',
            capability: 'fandom_collector',
            edition: {
              ...malformedArchiveEdition(),
              access: 'member',
              previewThumbnails: ['https://images.browser-archive.test/partial.jpg'],
            },
          }),
        });
        return;
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ...starOfDay('2026-09-02'),
          publicRecord: {
            actorPath: '/vibe-atlas/actors/partial-record-actor',
          },
        }),
      });
    });

    await page.goto(`${app.origin}/vibe-atlas`, { waitUntil: 'domcontentloaded' });
    await page.getByText("Today's curated card drop").waitFor();
    assert.equal(
      await page.getByRole('navigation', { name: 'Curated public records' }).count(),
      0,
      'today must not render navigation for a partial record pair',
    );

    await page.getByRole('button', { name: /Browse past editions/ }).click();
    const malformedPickerEntry = page.locator('.daily-archive__edition-group').filter({
      hasText: 'Partial Record Actor',
    });
    await malformedPickerEntry.waitFor();
    assert.equal(
      await malformedPickerEntry.getByRole('link').count(),
      0,
      'the picker must not render navigation for a partial record pair',
    );

    await malformedPickerEntry.getByRole('button').click();
    await page.getByText(/Founding Members can unlock the complete nine-card board/).waitFor();
    assert.equal(
      await page.getByRole('navigation', { name: 'Curated public records' }).count(),
      0,
      'the locked preview must not render navigation for a partial record pair',
    );

    await page.getByRole('button', { name: 'Vibe Atlas archive' }).click();
    await page.getByRole('heading', { name: 'The Star of the Day Archive' }).waitFor();
    const malformedCard = page.locator('.archive-card').filter({ hasText: 'Partial Record Actor' });
    const boardFallback = malformedCard.getByRole('link', { name: /Open Issue/ });
    assert.equal(
      await boardFallback.getAttribute('href'),
      `/vibe-atlas?date=${MALFORMED_DATE}`,
      'the full archive must retain the ordinary board fallback',
    );
    assert.match(await boardFallback.textContent() ?? '', /Open the nine-card board/);
    assert.equal(await malformedCard.getByRole('link', { name: 'Actor record' }).count(), 0);
    assert.equal(await malformedCard.getByRole('link', { name: 'Edition record' }).count(), 0);
  } finally {
    await browser.close();
    await app?.server.close();
  }
});

test('an older direct archive URL renders only the Founding Member preview gate', { timeout: 45_000 }, async () => {
  const engine = BROWSER_ENGINES[0];
  const browser = await launchBrowser(engine.type);
  let app: Awaited<ReturnType<typeof startApp>> | undefined;
  try {
    app = await startApp();
    const page = await browser.newPage();
    await page.route('https://www.googletagmanager.com/**', route => route.abort());
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ user: null }),
    }));
    await page.route('**/api/membership/status', route => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Sign in is required.' }),
    }));
    await page.route('**/.netlify/functions/image-proxy**', route => route.abort());
    await page.route('**/.netlify/functions/star-of-day**', async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('archive') === '1') {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ editions: [] }),
        });
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'archive_access_required',
          access: 'sign_in',
          capability: 'fandom_collector',
          edition: {
            date: ARCHIVED_DATE,
            actorName: 'Browser Archive Actor',
            actorShortNameEn: 'Browser Archive Actor',
            vibeEmoji: '🧪',
            vibeLabel: 'Browser Archive Vibe',
            vibeLabelEn: 'Browser Archive Vibe',
            previewThumbnails: ['https://images.browser-archive.test/preview.jpg'],
            access: 'member',
            publicRecord: {
              actorPath: ACTOR_RECORD_PATH,
              editionPath: EDITION_RECORD_PATH,
            },
          },
        }),
      });
    });

    await page.goto(`${app.origin}/vibe-atlas?date=${ARCHIVED_DATE}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Browser Archive Actor/ }).waitFor();
    await page.getByText(/Founding Members can unlock the complete nine-card board/).waitFor();
    const lockedRecords = page.getByRole('navigation', { name: 'Curated public records' });
    assert.equal(
      await lockedRecords.getByRole('link', { name: /actor record/ }).getAttribute('href'),
      ACTOR_RECORD_PATH,
    );
    assert.equal(
      await lockedRecords.getByRole('link', { name: /permanent record/ }).getAttribute('href'),
      EDITION_RECORD_PATH,
    );
    assert.equal(await page.locator('.daily-grid').count(), 0);
    assert.equal(await page.getByLabel('Sign in to check your archive access').count(), 1);
  } finally {
    await browser.close();
    await app?.server.close();
  }
});