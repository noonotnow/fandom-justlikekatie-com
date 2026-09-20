import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkBrowserCleanupFiles,
  findUnsafeBrowserCleanup,
} from './check-browser-cleanup.js';

test('rejects sequential browser and server cleanup in a fixture', () => {
  const violations = findUnsafeBrowserCleanup(`
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

test('current browser fixtures use safe cleanup', () => {
  assert.deepEqual(checkBrowserCleanupFiles(), []);
});