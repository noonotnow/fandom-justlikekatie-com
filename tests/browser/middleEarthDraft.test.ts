import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright';
import {
  closeBrowserAndServer,
  gotoTestPage,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

const DRAFT_KEY = 'fandom-middle-earth-memeforge-draft-v1';
const onePixelGif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
const still = {
  title: 'Sam guards Frodo',
  thumbnail: '/.netlify/functions/image-proxy?url=https%3A%2F%2Fimages.example%2Fsam.jpg',
  link: 'https://publisher.example/stills/sam',
  source: 'publisher.example',
  provider: 'google',
};

const translation = {
  translatedMoment: 'Guarding a tiny snack like the One Ring.',
  scene: 'Sam stands between Frodo and anyone reaching for the snacks.',
  character: 'Samwise',
  memeFlavor: 'Precious / My Precious',
  comicMechanism: 'Intent reversal',
  aesthetic: 'Cozy Hobbiton',
  artifactType: 'Meme card',
  tone: 'Deadpan',
  visualDirection: 'A protective friend.',
  referenceStillFamily: 'sam-carrying-frodo',
  cardText: { format: 'Internal Debate Card', line1: 'ME: ONE LITTLE TREAT ONLY', line2: 'ALSO ME: GUARD THE STASH WITH SWORD', footer: '' },
  cardTextOptions: [
    { format: 'Internal Debate Card', line1: 'ME: ONE LITTLE TREAT ONLY', line2: 'ALSO ME: GUARD THE STASH WITH SWORD', footer: '' },
    { format: 'Reaction Card', line1: 'my snack drawer', line2: 'closed to the fellowship', footer: '' },
    { format: 'Dialogue Card', line1: 'Frodo: can I have one', line2: 'Sam: no', footer: '' },
  ],
  reactionImageBrief: {
    socialUseQuery: 'Sam protective Frodo still',
    characterEmotionQueries: ['Sam protective still'],
    iconicSceneQueries: ['Sam and Frodo Mordor still'],
    broadFallbackQueries: ['Sam Frodo reaction still'],
    performedEmotion: ['protective'],
    visualRole: 'Sam guards something small with total commitment.',
  },
  model: 'grok-test',
};

async function mockServices(page: Page, counters: { collectionWrites: number }) {
  await page.route('**/api/auth/session', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ user: { accountId: 'draft-member', email: 'member@example.test', isAdmin: false } }),
  }));
  await page.route('**/api/membership/status', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ state: 'active', capabilities: ['fandom_collector'] }),
  }));
  await page.route('**/api/collection/**', route => {
    counters.collectionWrites += 1;
    return route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Forbidden"}' });
  });
  await page.route('**/api/middle-earth-ai', route => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    if (request.mode === 'translation') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: translation }) });
    }
    if (request.mode === 'rednote') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ result: { title: 'Snack defense', caption: 'Guarding the stash.', tags: ['#LOTR', '#Samwise', '#Snacks'], model: 'grok-test' } }),
      });
    }
    const card = request.cardText as Record<string, string>;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        result: {
          title: card.footer || card.format, primaryText: card.line1, secondaryText: card.line2,
          cardFormat: card.format, comicMechanism: 'Intent reversal', cardText: card,
          layout: 'Classic top / bottom', rationale: 'Locked.',
          translation: { scene: 's', archetype: 'a', vibe: 'v' }, model: 'grok-test',
        },
      }),
    });
  });
  await page.route(
    url => new URL(url).pathname === '/.netlify/functions/middle-earth-search',
    route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ query: 'Sam protective Frodo still', provider: 'google', results: [still] }),
    }),
  );
  await page.route(
    url => new URL(url).pathname === '/.netlify/functions/image-proxy',
    route => route.fulfill({ contentType: 'image/gif', body: onePixelGif }),
  );
}

const storedDraft = (page: Page) => page.evaluate(key => window.localStorage.getItem(key), DRAFT_KEY);

test('the Middle-earth reaction draft survives reload, clears, and starts fresh, all on this device', { timeout: 120_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server);
  const counters = { collectionWrites: 0 };
  try {
    await mockServices(page, counters);
    await gotoTestPage(page, `${origin}/memeforge/middle-earth`);
    await page.getByText('No local draft').waitFor();
    assert.equal(await storedDraft(page), null);

    // Build a draft: translate, pick angle 2, edit it, switch to TikTok, forge.
    await page.getByLabel('The moment').fill('Defending my little treat with my life');
    await page.getByRole('button', { name: 'Translate moment' }).click();
    await page.getByRole('button', { name: /^ANGLE 02/ }).click();
    await page.getByLabel('Setup line').fill('my snack drawer, guarded');
    await page.getByRole('button', { name: 'TikTok · 9:16' }).click();
    await page.getByRole('button', { name: /^Sam guards Frodo/ }).waitFor();
    await page.getByRole('button', { name: 'Forge card' }).click();
    await page.getByText('Visual object generated').waitFor();
    await page.getByText('Draft saved on this device').waitFor();

    const saved = JSON.parse(await storedDraft(page) ?? 'null');
    assert.equal(saved.version, 1, 'the draft is stored in localStorage under its own versioned key');
    assert.equal(saved.selectedAngle, 1);
    assert.equal(saved.text, 'my snack drawer, guarded');
    assert.equal(saved.memeFrame.format, 'tiktok');
    assert.equal(saved.selected.title, 'Sam guards Frodo');

    // Reload restores the angle, edit, still, size and forged state.
    await page.reload();
    await page.getByText('Draft restored from this device').waitFor();
    assert.equal(await page.getByLabel('The moment').inputValue(), 'Defending my little treat with my life');
    assert.equal(await page.getByLabel('Setup line').inputValue(), 'my snack drawer, guarded');
    assert.equal(await page.getByRole('button', { name: /^ANGLE 02/ }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('button', { name: /^Sam guards Frodo/ }).getAttribute('aria-pressed'), 'true');
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas[aria-label^="TikTok 9:16 meme preview"]') as HTMLCanvasElement | null;
      return canvas?.height === 1920;
    });
    await page.getByRole('button', { name: 'Save reaction card' }).waitFor();

    // A rework link must not load or erase the reaction draft.
    const beforeRework = await storedDraft(page);
    await gotoTestPage(page, `${origin}/memeforge/middle-earth?rework=missing-rework`);
    await page.getByText(/no longer available/).first().waitFor();
    assert.equal(await page.getByLabel('The moment').inputValue(), '');
    assert.equal(await storedDraft(page), beforeRework, 'opening a rework leaves the saved reaction draft untouched');

    // Clearing empties the screen and storage, and stays cleared after reload.
    await gotoTestPage(page, `${origin}/memeforge/middle-earth`);
    await page.getByText('Draft restored from this device').waitFor();
    await page.getByRole('button', { name: 'Clear local draft' }).click();
    await page.getByText('Draft cleared from this device').waitFor();
    assert.equal(await page.getByLabel('The moment').inputValue(), '');
    assert.equal(await page.getByRole('button', { name: /^ANGLE 0/ }).count(), 0);
    assert.equal(await storedDraft(page), null);
    await page.reload();
    await page.getByText('No local draft').waitFor();
    assert.equal(await page.getByLabel('The moment').inputValue(), '');

    // A new draft starts saving again and restores on reload.
    await page.getByLabel('The moment').fill('Second breakfast negotiations');
    await page.getByText('Draft saved on this device').waitFor();
    assert.equal(JSON.parse(await storedDraft(page) ?? 'null').moment, 'Second breakfast negotiations');
    await page.reload();
    assert.equal(await page.getByLabel('The moment').inputValue(), 'Second breakfast negotiations');

    assert.equal(counters.collectionWrites, 0, 'drafting never writes to the Collection or account sync');
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});

test('the Share panel flags stale Rednote copy on its collapsed summary', { timeout: 90_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server);
  try {
    await mockServices(page, { collectionWrites: 0 });
    await gotoTestPage(page, `${origin}/memeforge/middle-earth`);
    await page.getByLabel('The moment').fill('Defending my little treat with my life');
    await page.getByRole('button', { name: 'Translate moment' }).click();
    await page.getByRole('button', { name: /^Sam guards Frodo/ }).waitFor();
    await page.getByRole('button', { name: 'Forge card' }).click();
    await page.getByText('Visual object generated').waitFor();

    const summary = page.locator('details summary', { hasText: 'Rednote copy' });
    await summary.click();
    await page.getByText('Writing copy for').waitFor();
    // Hand-written copy after forging has nothing to be stale against.
    await page.getByLabel('Rednote title').fill('My own title');
    await page.getByLabel('Setup line').fill('an edit before any copy was generated');
    await summary.getByText('Drafted', { exact: true }).waitFor();
    assert.equal(await page.getByText('The grounding changed. Regenerate this copy before saving it.').count(), 0);
    await page.getByRole('button', { name: 'Generate copy' }).click();
    await page.getByText('Rednote title, caption, and tags generated.', { exact: false }).waitFor();
    await summary.getByText('Drafted', { exact: true }).waitFor();

    await summary.click();
    await page.getByLabel('Setup line').fill('a different setup');
    await summary.getByText('Copy is stale · reopen to regenerate').waitFor();
    assert.equal(await page.getByText('The grounding changed. Regenerate this copy before saving it.').isVisible(), false,
      'the detailed warning stays inside the collapsed panel');
    await summary.click();
    await page.getByText('The grounding changed. Regenerate this copy before saving it.').waitFor();
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});
