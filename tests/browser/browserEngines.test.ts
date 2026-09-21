import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Browser, BrowserType } from '@playwright/test';
import {
  assertBrowserEnginesInstalled,
  assertBrowserEnginesLaunchable,
  BROWSER_ENGINES,
  launchBrowserForServer,
  launchBrowserWithServer,
  replitNixLibraryPath,
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

test('browser prerequisite check explains how to install missing engines', () => {
  const missingPath = BROWSER_ENGINES[1].type.executablePath();

  assert.throws(
    () => assertBrowserEnginesInstalled(
      BROWSER_ENGINES,
      path => path !== missingPath,
    ),
    error => {
      assert.match(String(error), /Missing Playwright browser binaries: Firefox/);
      assert.match(String(error), /npm run browser:install/);
      return true;
    },
  );
});

test('browser prerequisite check accepts a complete engine installation', () => {
  assert.doesNotThrow(() => assertBrowserEnginesInstalled(BROWSER_ENGINES, () => true));
});

test('browser prerequisite check distinguishes missing host libraries', async () => {
  const launchError = new Error(
    'error while loading shared libraries: libgtk-4.so.1: cannot open shared object file',
  );

  await assert.rejects(
    assertBrowserEnginesLaunchable(
      [BROWSER_ENGINES[2]],
      async () => { throw launchError; },
    ),
    error => {
      assert.match(String(error), /browser smoke check failed: WebKit/);
      assert.match(String(error), /\.replit declares the required native browser libraries/);
      assert.match(String(error), /browser:install:ci/);
      assert.match(String(error), /libgtk-4\.so\.1/);
      return true;
    },
  );
});

test('browser prerequisite launch check accepts launchable engines', async () => {
  let closeCount = 0;

  const operatedEngines: string[] = [];
  await assert.doesNotReject(assertBrowserEnginesLaunchable(
    BROWSER_ENGINES,
    async engine => ({
      newPage: async () => ({
        setContent: async () => {
          operatedEngines.push(engine.id);
        },
        locator: () => ({
          textContent: async () => engine.name,
        }),
      }),
      close: async () => { closeCount += 1; },
    } as unknown as Browser),
  ));
  assert.deepEqual(operatedEngines, BROWSER_ENGINES.map(engine => engine.id));
  assert.equal(closeCount, BROWSER_ENGINES.length);
});

test('Replit WebKit runtime uses explicitly supplied declared package paths', () => {
  const runtimePath = '/nix/gst/lib:/nix/jpeg/lib';
  const availablePaths = new Set([
    '/nix/gst/lib/gstreamer-1.0/libgstlibav.so',
    '/nix/jpeg/lib/libjpeg.so.8',
  ]);

  const resolved = replitNixLibraryPath(runtimePath, path => availablePaths.has(path));

  assert.match(resolved, /\/nix\/gst\/lib/);
  assert.match(resolved, /\/nix\/jpeg\/lib/);
});

test('Replit WebKit runtime reports missing declared package paths', () => {
  assert.throws(
    () => replitNixLibraryPath('/nix/unrelated/lib', () => false),
    error => {
      assert.match(String(error), /Missing declared WebKit runtime paths/);
      assert.match(String(error), /gst_all_1\.gst-libav/);
      assert.match(String(error), /libjpeg8/);
      assert.match(String(error), /reload the Replit environment/);
      return true;
    },
  );
});

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
