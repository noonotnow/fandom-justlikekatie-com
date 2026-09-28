import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closeBrowserAndServer, gotoTestPage, launchPageForServer, startViteTestServer } from './browserEngines.ts';

test('Episode 21 renders approved text safely and holds new reader submissions for review', { timeout: 60_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server);
  const posted: Record<string, unknown>[] = [];
  try {
    await page.route('**/api/vibing-discussion*', route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            discussion: { id: 'against-the-current-episode-21', safeThroughEpisode: 21 },
            responses: [{ id: 'approved-1', text: '<img src=x onerror=alert(1)> I choose autonomy.' }],
          }),
        });
      }
      posted.push(route.request().postDataJSON());
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Thanks. Your response is awaiting editorial review.' }),
      });
    });
    await gotoTestPage(page, `${origin}/c-drama-fandom/vibing-now/against-the-current-episode-21/`);
    await page.getByText('1 approved reader responses.').waitFor();
    assert.equal(await page.locator('#discussion-responses img').count(), 0);
    assert.match(await page.locator('#discussion-responses').innerText(), /<img src=x onerror=alert\(1\)>/);
    await page.locator('#discussion-text').fill('Jialan deserves an independent choice.');
    await page.getByLabel('I will discuss Episode 21 or earlier only.').check();
    await page.getByRole('button', { name: 'Send for review' }).click();
    await page.getByText('Thanks. Your response is awaiting editorial review.').waitFor();
    assert.deepEqual(posted[0], {
      action: 'submit', discussionId: 'against-the-current-episode-21', safeThroughEpisode: 21,
      text: 'Jialan deserves an independent choice.', acceptBoundary: true, website: '',
    });
    assert.equal(await page.locator('#discussion-responses li').count(), 1);
    await page.getByRole('button', { name: 'Report this response' }).click();
    assert.equal(posted[1].action, 'report');
    assert.equal(posted[1].entryId, 'approved-1');
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});