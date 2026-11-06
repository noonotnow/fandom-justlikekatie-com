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

type Counters = { collectionWrites: number; shareRequests: Record<string, unknown>[] };

async function mockServices(page: Page, counters: Counters) {
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
    if (request.mode === 'share-copy') {
      counters.shareRequests.push(request);
      const result = request.platform === 'tiktok'
        ? { platform: 'tiktok', fields: { hook: 'Snack defense mode', caption: 'ME: one treat. ALSO ME: sword.' }, tags: ['#lotr'], model: 'grok-test' }
        : { platform: 'rednote', fields: { title: 'Snack defense', caption: 'Guarding the stash.' }, tags: ['#lotr', '#samwise', '#snacks'], model: 'grok-test' };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result }) });
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
  const counters: Counters = { collectionWrites: 0, shareRequests: [] };
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
    assert.equal(saved.version, 2, 'the draft is stored in localStorage under its own versioned key');
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

test('the Share panel gives every platform template copy, AI on request, and flags stale AI copy', { timeout: 120_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server);
  const counters: Counters = { collectionWrites: 0, shareRequests: [] };
  try {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await mockServices(page, counters);
    await gotoTestPage(page, `${origin}/memeforge/middle-earth`);
    await page.getByLabel('The moment').fill('Defending my little treat with my life');
    await page.getByRole('button', { name: 'Translate moment' }).click();
    await page.getByRole('button', { name: /^Sam guards Frodo/ }).waitFor();

    const summary = page.locator('details summary', { hasText: 'Post copy' });
    await summary.getByText('Optional · template copy is ready for each platform').waitFor();
    await summary.click();
    await page.getByText('Writing copy for').waitFor();

    // Template copy works before forging, on every platform, with no AI call.
    assert.equal(await page.getByLabel('Rednote title').inputValue(), 'ME: ONE LITTLE TREAT ONLY');
    assert.equal(await page.getByLabel('Rednote caption').inputValue(), 'ME: ONE LITTLE TREAT ONLY\nALSO ME: GUARD THE STASH WITH SWORD');
    assert.equal(await page.getByLabel(/^Rednote tags/).inputValue(), '#LOTR #MiddleEarth #LordOfTheRings');
    await page.getByRole('tab', { name: /^TikTok/ }).click();
    assert.equal(await page.getByLabel('TikTok hook').inputValue(), 'ME: ONE LITTLE TREAT ONLY');
    assert.equal(await page.getByLabel('TikTok caption').inputValue(), 'ALSO ME: GUARD THE STASH WITH SWORD');
    await page.getByRole('button', { name: 'Copy TikTok post' }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()),
      'ME: ONE LITTLE TREAT ONLY\n\nALSO ME: GUARD THE STASH WITH SWORD\n\n#LOTR #MiddleEarth #LordOfTheRings');
    await page.getByRole('tab', { name: /^Instagram/ }).click();
    assert.equal(await page.getByLabel('Instagram caption').inputValue(), 'ME: ONE LITTLE TREAT ONLY\nALSO ME: GUARD THE STASH WITH SWORD');
    assert.equal(await page.getByRole('button', { name: 'Write with AI' }).isDisabled(), true, 'AI stays behind the Forge gate');
    await page.getByText('Template copy works now. Forge the card above to write it with AI.').waitFor();
    assert.equal(counters.shareRequests.length, 0);

    // Tags can be typed with spaces between them.
    await page.getByLabel(/^Instagram tags/).fill('');
    await page.getByLabel(/^Instagram tags/).pressSequentially('#LOTR #Sam');
    assert.equal(await page.getByLabel(/^Instagram tags/).inputValue(), '#LOTR #Sam');
    await page.getByRole('tab', { name: /^Instagram.*edited/ }).waitFor();

    await summary.click();
    await page.getByRole('button', { name: 'Forge card' }).click();
    await page.getByText('Visual object generated').waitFor();
    await summary.click();

    // Rednote: untouched template copy is not sent, so the writer starts fresh as before.
    await page.getByRole('tab', { name: /^Rednote/ }).click();
    await page.getByRole('button', { name: 'Write with AI' }).click();
    await page.getByText('Rednote copy written. Edit anything before posting.').waitFor();
    assert.equal(counters.shareRequests[0].platform, 'rednote');
    assert.equal('currentCopy' in counters.shareRequests[0], false, 'template copy is not sent as refinement context');
    assert.equal(await page.getByLabel('Rednote title').inputValue(), 'Snack defense');
    await page.getByRole('tab', { name: /^Rednote.*AI/ }).waitFor();
    await summary.getByText('Drafted', { exact: true }).waitFor();

    // TikTok: edited copy is sent for refinement.
    await page.getByRole('tab', { name: /^TikTok/ }).click();
    await page.getByLabel('TikTok hook').fill('My hook');
    await page.getByRole('button', { name: 'Write with AI' }).click();
    await page.getByText('TikTok copy written. Edit anything before posting.').waitFor();
    assert.deepEqual(counters.shareRequests[1].currentCopy, {
      fields: { hook: 'My hook', caption: 'ALSO ME: GUARD THE STASH WITH SWORD' },
      tags: ['#LOTR', '#MiddleEarth', '#LordOfTheRings'],
    });

    // Editing the card makes AI copy stale; the closed summary says which platforms.
    await summary.click();
    await page.getByLabel('Setup line').fill('a different setup');
    await summary.getByText('Rednote, TikTok copy is stale · reopen to regenerate').waitFor();
    await summary.click();
    await page.getByText('The grounding changed. Regenerate this copy before posting.').waitFor();
    await page.getByRole('button', { name: 'Reset to template' }).click();
    assert.equal(await page.getByLabel('TikTok hook').inputValue(), 'a different setup', 'reset follows the card again');
    await summary.click();
    await summary.getByText('Rednote copy is stale · reopen to regenerate').waitFor();

    // Per-platform copy survives a reload through the v2 draft.
    await page.reload();
    await page.getByText('Draft restored from this device').waitFor();
    await summary.click();
    await page.getByRole('tab', { name: /^Rednote/ }).click();
    assert.equal(await page.getByLabel('Rednote title').inputValue(), 'Snack defense');
    await page.getByRole('tab', { name: /^Instagram/ }).click();
    assert.equal(await page.getByLabel(/^Instagram tags/).inputValue(), '#LOTR #Sam');
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});
