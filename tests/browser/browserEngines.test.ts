import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Browser, BrowserType } from '@playwright/test';
import {
  assertBrowserEnginesInstalled,
  assertBrowserEnginesLaunchable,
  BROWSER_ENGINES,
  createNativeDownloadFixture,
  gotoTestPage,
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

test('Vite startup tolerates transient warm-up failures before returning its origin', async () => {
  let probeCount = 0;
  const server = {
    listen: async () => undefined,
    close: async () => undefined,
    httpServer: { address: () => ({ address: '127.0.0.1', family: 'IPv4', port: 4173 }) },
  } as unknown as ViteDevServer;

  const result = await startViteTestServer(
    {},
    async () => server,
    async () => {
      probeCount += 1;
      if (probeCount < 3) throw new Error('stylesheet transform in progress');
      return new Response('ready');
    },
  );

  assert.equal(result.origin, 'http://127.0.0.1:4173');
  assert.equal(probeCount, 3);
});

test('Vite warm-up failure reports every probe and closes the server', async () => {
  let serverClosed = false;
  const server = {
    listen: async () => undefined,
    close: async () => { serverClosed = true; },
    httpServer: { address: () => ({ address: '127.0.0.1', family: 'IPv4', port: 4173 }) },
  } as unknown as ViteDevServer;

  await assert.rejects(
    startViteTestServer(
      {},
      async () => server,
      async () => { throw new Error('transform unavailable'); },
    ),
    error => {
      assert.match(String(error), /did not become ready at http:\/\/127\.0\.0\.1:4173 after 3 attempts/);
      assert.match(String(error), /attempt 1: Error: transform unavailable/);
      assert.match(String(error), /attempt 3: Error: transform unavailable/);
      return true;
    },
  );
  assert.equal(serverClosed, true);
});

test('initial navigation failure includes an independent server diagnostic', async () => {
  const navigationError = new Error('page.goto timed out');

  await assert.rejects(
    gotoTestPage(
      { goto: async () => { throw navigationError; } },
      'http://127.0.0.1:4173/vibe-atlas',
      undefined,
      async origin => {
        assert.equal(origin, 'http://127.0.0.1:4173');
        return new Response('busy', { status: 503, statusText: 'Service Unavailable' });
      },
    ),
    error => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors[0], navigationError);
      assert.match(error.message, /browser navigation failed/);
      assert.match(error.message, /server probe returned HTTP 503 Service Unavailable/);
      return true;
    },
  );
});

test('native download fixture serves exact headers and bytes while recording identifiers', async () => {
  const body = Buffer.from('native attachment bytes');
  const fixture = createNativeDownloadFixture({
    name: 'native-download-test',
    path: '/download',
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename="fixture.bin"',
      'x-download-fixture': 'exact',
    },
    body,
    identifierNames: ['recordId', 'version'],
    matches: url => url.searchParams.has('recordId'),
  });
  const { server, origin } = await startViteTestServer({
    configFile: false,
    server: { host: '127.0.0.1', port: 5000, strictPort: false },
    plugins: [fixture.plugin],
  });

  try {
    const requestPromise = fixture.waitForRequest();
    const response = await fetch(`${origin}/download?recordId=record-7&version=3`);
    const request = await requestPromise;

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/octet-stream');
    assert.equal(
      response.headers.get('content-disposition'),
      'attachment; filename="fixture.bin"',
    );
    assert.equal(response.headers.get('x-download-fixture'), 'exact');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), body);
    assert.deepEqual(request.identifiers, { recordId: 'record-7', version: '3' });
    assert.equal(request.url.pathname, '/download');
    assert.deepEqual(fixture.requests, [request]);
  } finally {
    await server.close();
  }
});

test('native download fixture timeout identifies the expected path and request identifiers', async () => {
  const fixture = createNativeDownloadFixture({
    name: 'missing-native-download-test',
    path: '/expected-download',
    headers: {},
    body: new Uint8Array(),
    identifierNames: ['recordId', 'version'],
  });

  await assert.rejects(
    fixture.waitForRequest(10),
    error => {
      assert.equal(
        String(error),
        'Error: Timed out after 10ms waiting for native download request '
        + 'to "/expected-download" with identifiers: recordId, version.',
      );
      return true;
    },
  );
});

test('expired native download wait does not consume the next matching request', async () => {
  const fixture = createNativeDownloadFixture({
    name: 'expired-native-download-wait-test',
    path: '/download',
    headers: {},
    body: new Uint8Array(),
    identifierNames: ['recordId', 'version'],
  });
  const { server, origin } = await startViteTestServer({
    configFile: false,
    server: { host: '127.0.0.1', port: 5000, strictPort: false },
    plugins: [fixture.plugin],
  });

  try {
    await assert.rejects(fixture.waitForRequest(10), /Timed out after 10ms/);

    const nextRequestPromise = fixture.waitForRequest();
    await fetch(`${origin}/download?recordId=record-8&version=4`);
    const nextRequest = await nextRequestPromise;

    await fetch(`${origin}/download?recordId=record-9&version=5`);
    const laterRequest = await fixture.waitForRequest();

    assert.deepEqual(nextRequest.identifiers, { recordId: 'record-8', version: '4' });
    assert.deepEqual(laterRequest.identifiers, { recordId: 'record-9', version: '5' });
    assert.deepEqual(
      fixture.requests.map(request => request.identifiers),
      [
        { recordId: 'record-8', version: '4' },
        { recordId: 'record-9', version: '5' },
      ],
    );
  } finally {
    await server.close();
  }
});

test('interleaved expired native download waits preserve live request order', async () => {
  const fixture = createNativeDownloadFixture({
    name: 'interleaved-native-download-waits-test',
    path: '/download',
    headers: {},
    body: new Uint8Array(),
    identifierNames: ['recordId', 'version'],
  });
  const { server, origin } = await startViteTestServer({
    configFile: false,
    server: { host: '127.0.0.1', port: 5000, strictPort: false },
    plugins: [fixture.plugin],
  });

  try {
    const firstExpired = assert.rejects(fixture.waitForRequest(10), /Timed out after 10ms/);
    const firstLive = fixture.waitForRequest();
    const secondExpired = assert.rejects(fixture.waitForRequest(20), /Timed out after 20ms/);
    const secondLive = fixture.waitForRequest();
    const thirdExpired = assert.rejects(fixture.waitForRequest(30), /Timed out after 30ms/);

    await Promise.all([firstExpired, secondExpired, thirdExpired]);

    await fetch(`${origin}/download?recordId=record-10&version=6`);
    const firstRequest = await firstLive;
    await fetch(`${origin}/download?recordId=record-11&version=7`);
    const secondRequest = await secondLive;
    await fetch(`${origin}/download?recordId=record-12&version=8`);
    const laterRequest = await fixture.waitForRequest();

    assert.deepEqual(
      [firstRequest, secondRequest, laterRequest].map(request => request.identifiers),
      [
        { recordId: 'record-10', version: '6' },
        { recordId: 'record-11', version: '7' },
        { recordId: 'record-12', version: '8' },
      ],
    );
    assert.deepEqual(fixture.requests, [firstRequest, secondRequest, laterRequest]);
  } finally {
    await server.close();
  }
});
