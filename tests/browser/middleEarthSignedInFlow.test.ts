import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer as createTcpServer } from 'node:net';
import { test } from 'node:test';
import { createServer, type ViteDevServer } from 'vite';
import { chromium, type Browser } from '@playwright/test';

const onePixelGif = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
  'base64',
);

const selectedSource = {
  title: 'Sam carries Frodo',
  thumbnail: '/.netlify/functions/image-proxy?url=https%3A%2F%2Fimages.example%2Fsam-carrying-frodo.jpg',
  link: 'https://publisher.example/stills/sam-carrying-frodo',
  source: 'publisher.example',
  provider: 'google',
};

const alternateSource = {
  title: 'Frodo trusts Sam',
  thumbnail: '/.netlify/functions/image-proxy?url=https%3A%2F%2Fimages.example%2Ffrodo-trusts-sam.jpg',
  link: 'https://publisher.example/stills/frodo-trusts-sam',
  source: 'publisher.example',
  provider: 'google',
};

async function startApp(): Promise<{ server: ViteDevServer; origin: string }> {
  const port = await findAvailablePort();
  const server = await createServer({
    configFile: 'vite.config.ts',
    server: { host: '127.0.0.1', port, strictPort: true },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    throw new Error('The browser test server did not expose a TCP port.');
  }
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createTcpServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        probe.close(() => reject(new Error('Could not reserve a test port.')));
        return;
      }
      probe.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (defaultLaunchError) {
    const executablePath = process.env.PATH
      ?.split(':')
      .map(directory => `${directory}/chromium`)
      .find(existsSync);
    if (!executablePath) throw defaultLaunchError;
    return chromium.launch({ executablePath, args: ['--no-sandbox'] });
  }
}

test('a signed-in creator can translate, swap reaction stills, export, and stage preserved provenance', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const browser = await launchBrowser();
  const page = await browser.newPage();
  let stagedPacket: Record<string, unknown> | undefined;
  let imageProxyLoads = 0;
  const visualRequests: Array<Record<string, unknown>> = [];

  try {
    await page.route('**/api/auth/session', async route => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            accountId: 'test-admin',
            email: 'admin@example.test',
            isAdmin: true,
          },
        }),
      });
    });
    await page.route('**/api/middle-earth-ai', async route => {
      const request = route.request().postDataJSON() as Record<string, unknown>;
      if (request.mode === 'translation') {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            result: {
              translatedMoment: 'Carrying a small work task until it becomes a quest.',
              scene: 'Sam quietly takes the impossible item from a tired friend.',
              character: 'Samwise',
              memeFlavor: 'Samwise Loyalty',
              comicMechanism: 'Responsibility inflation',
              aesthetic: 'Cozy Hobbiton',
              artifactType: 'Meme card',
              tone: 'Deadpan',
              visualDirection: 'A faithful friend carrying the whole plan without complaint.',
              referenceStillFamily: 'sam-carrying-frodo',
              cardText: {
                format: 'Reaction Card',
                line1: 'WHEN THE TASK BECOMES A QUEST',
                line2: 'ME: I NEED SECOND BREAKFAST.',
                footer: 'Friday fellowship',
              },
              reactionImageBrief: {
                socialUseQuery: 'Sam carrying Frodo reaction still Lord of the Rings',
                characterEmotionQueries: ['Samwise patient support reaction still Lord of the Rings'],
                iconicSceneQueries: ['Sam carrying Frodo Mount Doom reaction still Lord of the Rings'],
                broadFallbackQueries: ['Sam Frodo friendship reaction still Lord of the Rings'],
                performedEmotion: ['patient support', 'determined concern'],
                visualRole: 'Sam visibly carries the burden while staying calmly committed.',
              },
              model: 'grok-test',
            },
          }),
        });
        return;
      }
      if (request.mode === 'visual') {
        visualRequests.push(request);
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            result: {
              title: 'Friday fellowship',
              primaryText: 'WHEN THE TASK BECOMES A QUEST',
              secondaryText: 'ME: I NEED SECOND BREAKFAST.',
              cardFormat: 'Reaction Card',
              comicMechanism: 'Responsibility inflation',
              cardText: {
                format: 'Reaction Card',
                line1: 'WHEN THE TASK BECOMES A QUEST',
                line2: 'ME: I NEED SECOND BREAKFAST.',
                footer: 'Friday fellowship',
              },
              layout: 'Editorial caption',
              rationale: 'The grounded still leaves room for the reaction.',
              translation: {
                scene: 'A small task becomes an epic detour.',
                archetype: 'Unexpected Journey',
                vibe: 'Dry workplace humor',
              },
              model: 'grok-test',
            },
          }),
        });
        return;
      }
      throw new Error(`Unexpected MemeForge mode: ${String(request.mode)}`);
    });
    await page.route(
      url => new URL(url).pathname === '/.netlify/functions/middle-earth-search',
      async route => {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            query: 'Sam carrying Frodo reaction still Lord of the Rings',
            provider: 'google',
            results: [
              selectedSource,
              alternateSource,
              {
                title: 'Sam looks determined',
                thumbnail: '/.netlify/functions/image-proxy?url=https%3A%2F%2Fimages.example%2Fsam-determined.jpg',
                link: 'https://publisher.example/stills/sam-determined',
                source: 'publisher.example',
                provider: 'google',
              },
            ],
          }),
        });
      },
    );
    await page.route(
      url => new URL(url).pathname === '/.netlify/functions/image-proxy',
      async route => {
        imageProxyLoads += 1;
        await route.fulfill({ contentType: 'image/gif', body: onePixelGif });
      },
    );
    await page.route('**/api/idea-packets', async route => {
      const request = route.request().postDataJSON() as { packet?: Record<string, unknown> };
      stagedPacket = request.packet;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ packet: request.packet }),
      });
    });

    await page.goto(`${origin}/memeforge/middle-earth`);
    const newImagePath = page.getByRole('button', { name: /^01 New image/ });
    const reworkPath = page.getByRole('button', { name: /^02 Rework an existing meme/ });
    const unchangedPath = page.getByRole('button', { name: /^03 Use an existing meme/ });
    await newImagePath.waitFor();
    assert.equal(await reworkPath.isVisible(), true, 'the rework pathway should be explicit before translation');
    assert.equal(await unchangedPath.isVisible(), true, 'the unchanged pathway should be explicit before translation');

    await unchangedPath.click();
    await page.getByText('The joke is already in the image.').waitFor();
    assert.equal(await page.getByLabel('The moment').count(), 0, 'unchanged memes should bypass translation');
    assert.equal(await page.getByText('This path preserves the finished meme exactly.').isVisible(), true);
    assert.equal(
      await page.getByRole('button', { name: /^2\. Rednote Spellbook/ }).isDisabled(),
      true,
      'Spellbook should be disabled when the selected path has no editor',
    );
    assert.equal(await page.getByLabel('Search existing memes').isVisible(), true);
    const ownMemeUpload = page.locator('#existing-meme-upload');
    assert.equal(await ownMemeUpload.isVisible(), true, 'the unchanged path should offer a local upload alongside archive search');
    await ownMemeUpload.setInputFiles({
      name: 'one-page-became-the-whole-trilogy.gif',
      mimeType: 'image/gif',
      buffer: onePixelGif,
    });
    await page.getByText('is ready. The editor is bypassed').waitFor();
    const unchangedPreview = page.getByLabel('Unchanged existing meme preview');
    await unchangedPreview.waitFor();
    assert.match(
      await unchangedPreview.locator('img').getAttribute('src') ?? '',
      /^data:image\/gif;base64,/,
      'the uploaded meme should render from a local data URL',
    );
    assert.equal(await page.getByText(/Uploaded from your device/).first().isVisible(), true);
    assert.equal(await page.getByRole('link', { name: 'Open original source' }).count(), 0, 'local uploads should not show a fake external source link');
    const originalDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export original meme' }).click();
    const originalDownload = await originalDownloadPromise;
    assert.equal(originalDownload.suggestedFilename(), 'one-page-became-the-whole-trilogy.gif');
    await page.getByRole('button', { name: 'Save to Collection' }).click();
    await page.getByRole('button', { name: 'Saved to Collection' }).waitFor();
    await page.getByRole('link', { name: 'Open Collection' }).click();
    await page.getByRole('heading', { name: 'Middle-earth Collection' }).waitFor();
    await page.getByText(/one-page-became-the-whole-trilogy/).waitFor();
    assert.equal(
      await page.getByText('No saved Middle-earth memes yet', { exact: true }).count(),
      0,
      'the separate Middle-earth collection should show the uploaded meme',
    );

    await page.goto(`${origin}/memeforge/middle-earth`);
    await newImagePath.waitFor();
    await newImagePath.click();
    await page.getByLabel('The moment').fill('Not wanting to go to work on Friday');
    await page.getByRole('button', { name: 'Translate moment' }).click();

    await page.getByText('Carrying a small work task until it becomes a quest.').waitFor();
    const initialCandidate = page.getByRole('button', {
      name: new RegExp(`^${selectedSource.title}`),
    });
    const alternateCandidate = page.getByRole('button', {
      name: new RegExp(`^${alternateSource.title}`),
    });
    const visibleCount = page.getByText('3 candidates', { exact: true });
    await visibleCount.waitFor();
    const candidateCount = Number((await visibleCount.textContent())?.split(' ')[0]);
    assert.ok(candidateCount >= 1 && candidateCount <= 6, `expected 1–6 candidates, got ${candidateCount}`);
    assert.match(
      await initialCandidate.innerText(),
      new RegExp(selectedSource.source.replace('.', '\\.')),
      'the initially selected candidate must retain source attribution',
    );
    assert.match(
      await alternateCandidate.innerText(),
      new RegExp(alternateSource.source.replace('.', '\\.')),
      'every selectable candidate must retain source attribution',
    );
    assert.equal(await initialCandidate.getAttribute('aria-pressed'), 'true');

    const previewImage = page.locator('[aria-label="Live 4 by 5 preview"] img');
    await previewImage.waitFor();
    await page.waitForFunction(
      selector => (document.querySelector(selector) as HTMLImageElement | null)?.naturalWidth === 1,
      '[aria-label="Live 4 by 5 preview"] img',
    );
    assert.ok(imageProxyLoads > 0, 'the selected still must be fetched through the image proxy');

    await page.getByRole('button', { name: 'Forge card' }).click();
    const setupLine = page.getByLabel('Setup line');
    const punchlineLine = page.getByLabel('Punchline / reaction line');
    await page.getByText('Visual object generated').waitFor();
    const originalSetup = await setupLine.inputValue();
    const originalPunchline = await punchlineLine.inputValue();
    assert.equal(originalSetup, 'WHEN THE TASK BECOMES A QUEST');
    assert.equal(originalPunchline, 'ME: I NEED SECOND BREAKFAST.');
    assert.equal((visualRequests[0].source as { sourceUrl?: string }).sourceUrl, selectedSource.link);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PNG' }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /friday-fellowship\.png/i);
    await page.getByText('PNG downloaded. No packet was saved.').waitFor();

    await alternateCandidate.click();
    assert.equal(await setupLine.inputValue(), originalSetup);
    assert.equal(await punchlineLine.inputValue(), originalPunchline);
    assert.equal(await alternateCandidate.getAttribute('aria-pressed'), 'true');

    await page.getByRole('button', { name: 'Stage for CREATE' }).click();
    await page.getByText('Idea packet staged. No publish or schedule action was taken.').waitFor();
    assert.ok(stagedPacket, 'packet staging must receive a packet');
    const sourceCard = (stagedPacket.sourceCards as Array<Record<string, unknown>>)[0];
    const provenance = JSON.parse(String(sourceCard.provenance));
    assert.equal(sourceCard.sourceUrl, alternateSource.link);
    assert.equal(sourceCard.title, alternateSource.title);
    assert.match(String(sourceCard.imageUrl), /^\/\.netlify\/functions\/image-proxy\?url=/);
    assert.equal(provenance.query, 'Sam carrying Frodo reaction still Lord of the Rings');
    assert.equal(provenance.referenceStillFamily, 'sam-carrying-frodo');
    assert.equal(provenance.rightsStatus, 'unknown');

    await page.getByRole('button', { name: 'Use typography-only fallback' }).click();
    await page.getByText('Typography-only fallback is active.').waitFor();
    assert.equal(await setupLine.inputValue(), originalSetup);
    assert.equal(await punchlineLine.inputValue(), originalPunchline);
  } finally {
    await browser.close();
    await server.close();
  }
});