import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { BROWSER_ENGINES, closeBrowserAndServer, launchBrowserWithServer } from './browserEngines.ts';
import { checkNameKeyNavigation } from './untamedNameKeyChecks.ts';
import { createStagingServer, stageUntamedNameKey } from '../../scripts/stage-untamed-name-key.js';

async function startStagingTestServer() {
  stageUntamedNameKey();
  const httpServer = createStagingServer();
  const server = {
    close: () => new Promise<void>((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve())),
  };
  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const address = httpServer.address();
    assert.ok(address && typeof address !== 'string');
    return { server, origin: `http://127.0.0.1:${address.port}` };
  } catch (error) {
    await server.close();
    throw error;
  }
}

for (const engine of BROWSER_ENGINES) {
  test(`${engine.name}: three-character staging preserves exact copy, mobile readability and Journal boundaries`, { timeout: 60_000 }, async () => {
    const [{ server, origin }, browser] = await launchBrowserWithServer(startStagingTestServer(), engine.type);
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
      await checkNameKeyNavigation(page, origin);
      const copy = readFileSync('docs/untamed-three-character-name-key-review.md', 'utf8')
        .split('<!-- reader-copy:start -->')[1].split('<!-- reader-copy:end -->')[0];
      // Strip only markdown syntax, never prose, to check each approved text block.
      const content = (await page.locator('main').textContent())!.replace(/\s+/g, ' ');
      for (const line of copy.trim().split('\n')) {
        if (!line.trim() || /^\|/.test(line)) continue;
        const plain = line.replace(/^#+ /, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*/g, '').trim();
        assert.ok(content.includes(plain.replace(/\s+/g, ' ')), plain);
      }
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}