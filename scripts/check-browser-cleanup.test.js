import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkBrowserCleanupFiles,
  findUnsafeBrowserCleanup,
} from './check-browser-cleanup.js';

test('rejects sequential browser and server cleanup in a fixture', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    try {
      await page.goto(origin);
    } finally {
      await browser.close();
      await server.close();
    }
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'browser');
  assert.equal(violations[0].server, 'server');
});

test('rejects reverse sequential cleanup using unconventional local names', () => {
  const violations = findUnsafeBrowserCleanup(`
    async function runFixture() {
      const { server: daemon } = await startViteTestServer();
      const renderer = await chromium.launch();
      await daemon.close();
      await renderer.close();
    }
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'renderer');
  assert.equal(violations[0].server, 'daemon');
});

test('rejects ordered cleanup outside a finally block', () => {
  const violations = findUnsafeBrowserCleanup(`
    const [{ server: app }, client] = await launchBrowserWithServer(startViteTestServer());
    await client.close();
    await app.close();
  `);

  assert.equal(violations.length, 1);
});

test('accepts the shared browser and server cleanup helper', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    try {
      await page.goto(origin);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  `), []);
});

test('accepts concurrent cleanup and unrelated page cleanup', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    try {
      await page.goto(origin);
    } finally {
      await page.close();
      await Promise.allSettled([browser.close(), server.close()]);
    }
  `), []);
});

test('accepts page-only sequential cleanup when a server is owned', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server: daemon } = await startViteTestServer();
    const tab = await existingBrowser.newPage();
    await tab.close();
    await daemon.close();
  `), []);
});

test('current browser fixtures use safe cleanup', () => {
  assert.deepEqual(checkBrowserCleanupFiles(), []);
});