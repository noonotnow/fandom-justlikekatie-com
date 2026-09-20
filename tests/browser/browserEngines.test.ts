import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Browser, BrowserType } from '@playwright/test';
import {
  launchBrowserForServer,
  launchBrowserWithServer,
  startViteTestServer,
} from './browserEngines.ts';
import type { ViteDevServer } from 'vite';

function failingBrowserType(launchError: Error): BrowserType {
  return {
    launch: async () => {
      throw launchError;
    },
  } as unknown as BrowserType;
}

test('sequential browser launch failure closes its listening server', async () => {
  let serverClosed = false;
  const launchError = new Error('browser binary is unavailable');

  await assert.rejects(
    launchBrowserForServer(
      { close: async () => { serverClosed = true; } },
      failingBrowserType(launchError),
    ),
    launchError,
  );
  assert.equal(serverClosed, true);
});

test('parallel browser launch failure waits for and closes its server', async () => {
  let serverClosed = false;
  let finishServerStart: ((value: {
    server: { close: () => Promise<void> };
    origin: string;
  }) => void) | undefined;
  const serverResult = new Promise<{
    server: { close: () => Promise<void> };
    origin: string;
  }>(resolve => {
    finishServerStart = resolve;
  });
  const launchError = new Error('browser binary is unavailable');
  const startup = launchBrowserWithServer(
    serverResult,
    failingBrowserType(launchError),
  );

  finishServerStart?.({
    server: { close: async () => { serverClosed = true; } },
    origin: 'http://127.0.0.1:5000',
  });

  await assert.rejects(startup, launchError);
  assert.equal(serverClosed, true);
});

test('parallel server startup failure closes an already launched browser', async () => {
  let browserClosed = false;
  const serverError = new Error('server failed to listen');
  const browserType = {
    launch: async () => ({
      close: async () => { browserClosed = true; },
    } as Browser),
  } as BrowserType;

  await assert.rejects(
    launchBrowserWithServer(Promise.reject(serverError), browserType),
    serverError,
  );
  assert.equal(browserClosed, true);
});

test('Vite listen failure closes the created browser test server', async () => {
  const listenError = new Error('server failed to listen');
  let serverClosed = false;
  const createTestServer = async () => ({
    listen: async () => {
      throw listenError;
    },
    close: async () => {
      serverClosed = true;
    },
  } as unknown as ViteDevServer);

  await assert.rejects(
    startViteTestServer({}, createTestServer),
    listenError,
  );
  assert.equal(serverClosed, true);
});