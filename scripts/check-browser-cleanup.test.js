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

test('rejects cleanup of browser and server acquired through later assignments', () => {
  const violations = findUnsafeBrowserCleanup(`
    let daemon;
    let renderer;
    ({ server: daemon } = await startViteTestServer());
    renderer = await chromium.launch();
    await renderer.close();
    await daemon.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'renderer');
  assert.equal(violations[0].server, 'daemon');
});

test('rejects cleanup after shorthand destructuring assignment', () => {
  const violations = findUnsafeBrowserCleanup(`
    let server;
    ({ server } = await startViteTestServer());
    let browser;
    browser = await launchBrowserForServer(server);
    await browser.close();
    await server.close();
  `);

  assert.equal(violations.length, 1);
});

test('accepts browser and server cleanup in mutually exclusive branches', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    if (browserStarted) {
      await browser.close();
    } else {
      await server.close();
    }
  `), []);
});

test('accepts browser and server cleanup in ternary branches', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    browserStarted
      ? await browser.close()
      : await server.close();
  `), []);
});

test('accepts ternary cleanup branches nested in another expression', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    recordCleanup(
      browserStarted
        ? await browser.close()
        : await server.close(),
    );
  `), []);
});

test('accepts ternary cleanup branches in a variable initializer', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const cleanupResult = browserStarted
      ? await browser.close()
      : await server.close();
  `), []);
});

test('accepts ternary cleanup branches in an if condition', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    if (
      browserStarted
        ? await browser.close()
        : await server.close()
    ) {
      recordCleanup();
    }
  `), []);
});

test('accepts cleanup guarded by a short-circuit expression', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    browserStarted && await browser.close();
  `), []);
});

test('rejects sequential cleanup inside a ternary branch', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    browserStarted
      ? (await browser.close(), await server.close())
      : logStartupFailure();
  `);

  assert.equal(violations.length, 1);
});

test('rejects sequential cleanup in a variable initializer branch', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const cleanupResult = browserStarted
      ? (await browser.close(), await server.close())
      : logStartupFailure();
  `);

  assert.equal(violations.length, 1);
});

test('rejects sequential cleanup in a short-circuit path', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    browserStarted
      && await browser.close()
      && await server.close();
  `);

  assert.equal(violations.length, 1);
});

test('rejects cleanup that remains sequential after mutually exclusive branches', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    if (browserStarted) {
      await browser.close();
    } else {
      logStartupFailure();
    }
    await server.close();
  `);

  assert.equal(violations.length, 1);
});

test('rejects cleanup after assigned array destructuring with renamed resources', () => {
  const violations = findUnsafeBrowserCleanup(`
    let daemon;
    let renderer;
    [{ server: daemon }, renderer] = await launchBrowserWithServer(startViteTestServer());
    await renderer.close();
    await daemon.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'renderer');
  assert.equal(violations[0].server, 'daemon');
});

test('rejects cleanup through aliases of assigned resources', () => {
  const violations = findUnsafeBrowserCleanup(`
    let daemon;
    daemon = await createServer();
    const serverAlias = daemon;
    const renderer = await launch();
    let browserAlias;
    browserAlias = renderer;
    await serverAlias.close();
    await browserAlias.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'browserAlias');
  assert.equal(violations[0].server, 'serverAlias');
});

test('rejects cleanup through ternary aliases when resource paths agree', () => {
  const violations = findUnsafeBrowserCleanup(`
    const primaryBrowser = await launch();
    const backupBrowser = await launch();
    const renderer = preferPrimary ? primaryBrowser : backupBrowser;
    const daemon = await createServer();
    await renderer.close();
    await daemon.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'renderer');
  assert.equal(violations[0].server, 'daemon');
});

test('rejects cleanup through logical-OR aliases with one resource-bearing path', () => {
  const violations = findUnsafeBrowserCleanup(`
    const daemon = await createServer();
    const serverAlias = cachedServer || daemon;
    const renderer = await launch();
    await serverAlias.close();
    await renderer.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'renderer');
  assert.equal(violations[0].server, 'serverAlias');
});

test('rejects cleanup through logical-AND aliases when resource paths agree', () => {
  const violations = findUnsafeBrowserCleanup(`
    const primaryBrowser = await launch();
    const backupBrowser = await launch();
    const renderer = browserStarted && (preferPrimary ? primaryBrowser : backupBrowser);
    const primaryServer = await createServer();
    const backupServer = await createServer();
    const daemon = serverStarted && (preferPrimary ? primaryServer : backupServer);
    await renderer.close();
    await daemon.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'renderer');
  assert.equal(violations[0].server, 'daemon');
});

test('rejects cleanup through nullish-coalescing aliases', () => {
  const violations = findUnsafeBrowserCleanup(`
    const primaryBrowser = await launch();
    const fallbackBrowser = await launch();
    const renderer = primaryBrowser ?? fallbackBrowser;
    const daemon = await createServer();
    await renderer.close();
    await daemon.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'renderer');
  assert.equal(violations[0].server, 'daemon');
});

test('rejects cleanup through logical-assignment aliases', () => {
  for (const operator of ['&&=', '||=', '??=']) {
    const violations = findUnsafeBrowserCleanup(`
      const renderer = await launch();
      let browserAlias = renderer;
      browserAlias ${operator} renderer;
      const daemon = await createServer();
      let serverAlias;
      serverAlias ${operator} daemon;
      await browserAlias.close();
      await serverAlias.close();
    `);

    assert.equal(violations.length, 1, operator);
    assert.equal(violations[0].browser, 'browserAlias', operator);
    assert.equal(violations[0].server, 'serverAlias', operator);
  }
});

test('rejects cleanup through logical assignments from resource factories', () => {
  for (const operator of ['&&=', '||=', '??=']) {
    const violations = findUnsafeBrowserCleanup(`
      let renderer;
      renderer ${operator} await launch();
      let daemon;
      daemon ${operator} await createServer();
      await renderer.close();
      await daemon.close();
    `);

    assert.equal(violations.length, 1, operator);
    assert.equal(violations[0].browser, 'renderer', operator);
    assert.equal(violations[0].server, 'daemon', operator);
  }
});

test('retains known resource aliases through OR and nullish assignments', () => {
  for (const operator of ['||=', '??=']) {
    const violations = findUnsafeBrowserCleanup(`
      const renderer = await launch();
      const daemon = await createServer();
      let browserAlias = renderer;
      browserAlias ${operator} daemon;
      await browserAlias.close();
      await daemon.close();
    `);

    assert.equal(violations.length, 1, operator);
    assert.equal(violations[0].browser, 'browserAlias', operator);
    assert.equal(violations[0].server, 'daemon', operator);
  }
});

test('uses the assigned resource kind for AND assignment of known resources', () => {
  const violations = findUnsafeBrowserCleanup(`
    const renderer = await launch();
    const daemon = await createServer();
    let serverAlias = renderer;
    serverAlias &&= daemon;
    await serverAlias.close();
    await renderer.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'renderer');
  assert.equal(violations[0].server, 'serverAlias');
});

test('does not classify logical assignments with ambiguous resource paths', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const renderer = await launch();
    const daemon = await createServer();
    let ambiguous = useBrowser ? renderer : daemon;
    ambiguous ||= useBrowser ? renderer : daemon;
    const page = await existingBrowser.newPage();
    await ambiguous.close();
    await page.close();
  `), []);
});

test('does not classify mixed logical-AND aliases as either resource', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const renderer = await launch();
    const daemon = await createServer();
    const ambiguous = renderer && daemon;
    const page = await existingBrowser.newPage();
    await ambiguous.close();
    await page.close();
  `), []);
});

test('does not classify mixed browser and server aliases as either resource', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const renderer = await launch();
    const daemon = await createServer();
    const ambiguous = useBrowser ? renderer : daemon;
    const page = await existingBrowser.newPage();
    const pageOrAmbiguous = page || ambiguous;
    await pageOrAmbiguous.close();
    await daemon.close();
  `), []);
});

test('accepts a page alias as page-only cleanup', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const page = await existingBrowser.newPage();
    let tab;
    tab = page;
    await tab.close();
    await server.close();
  `), []);
});

test('accepts cleanup after a tracked name is reassigned to a page', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    let resource = await launchBrowserForServer(server);
    resource = await resource.newPage();
    await resource.close();
    await server.close();
  `), []);
});

test('rejects either sequential order across alternative paths', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    if (browserStarted) {
      await browser.close();
      await server.close();
    } else {
      await server.close();
      await browser.close();
    }
  `);

  assert.equal(violations.length, 1);
});

test('keeps nested mutually exclusive cleanup paths separate', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    if (resourceStarted) {
      if (browserStarted) {
        await browser.close();
      } else {
        await server.close();
      }
    }
  `), []);
});

test('accepts browser and server cleanup in mutually exclusive switch cases', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    switch (resourceToClose) {
      case 'browser':
        await browser.close();
        break;
      case 'server':
        await server.close();
        break;
    }
  `), []);
});

test('rejects sequential cleanup through switch fallthrough', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    switch (resourceToClose) {
      case 'browser':
        await browser.close();
      case 'server':
        await server.close();
        break;
    }
  `);

  assert.equal(violations.length, 1);
});

test('rejects cleanup that can run sequentially across loop iterations', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    for (const resource of resources) {
      if (resource === 'browser') {
        await browser.close();
        continue;
      }
      await server.close();
    }
  `);

  assert.equal(violations.length, 1);
});

test('accepts loop cleanup paths separated by break', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    while (resourceToClose) {
      if (resourceToClose === 'browser') {
        await browser.close();
        break;
      }
      await server.close();
      break;
    }
  `), []);
});

test('accepts cleanup paths separated by an early return', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    async function stopFixture() {
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      if (browserStarted) {
        await browser.close();
        return;
      }
      await server.close();
    }
  `), []);
});

test('rejects sequential cleanup before an early return', () => {
  const violations = findUnsafeBrowserCleanup(`
    async function stopFixture() {
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      if (browserStarted) {
        await browser.close();
        await server.close();
        return;
      }
      await server.close();
    }
  `);

  assert.equal(violations.length, 1);
});

test('rejects cleanup that can continue from try into catch', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    try {
      await browser.close();
    } catch {
      await server.close();
    }
  `);

  assert.equal(violations.length, 1);
});

test('rejects cleanup through object properties holding assigned resources', () => {
  const violations = findUnsafeBrowserCleanup(`
    const resources = {};
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    resources.runtime = {};
    resources.runtime.browser = browser;
    resources.runtime.server = server;
    await resources.runtime.browser.close();
    await resources.runtime.server.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources.runtime.browser');
  assert.equal(violations[0].server, 'resources.runtime.server');
});

test('rejects cleanup through object-literal shorthand properties', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const resources = { browser, server };
    await resources.browser.close();
    await resources.server.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources.browser');
  assert.equal(violations[0].server, 'resources.server');
});

test('retains resource kinds for renamed object-literal properties', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const resources = {
      renderer: browser,
      daemon: server,
    };
    await resources.daemon.close();
    await resources.renderer.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources.renderer');
  assert.equal(violations[0].server, 'resources.daemon');
});

test('rejects cleanup when factories assign directly to object properties', () => {
  const violations = findUnsafeBrowserCleanup(`
    const resources = {};
    resources.server = await createServer();
    resources.browser = await launch();
    await resources.server.close();
    await resources.browser.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources.browser');
  assert.equal(violations[0].server, 'resources.server');
});

test('accepts cleanup after a tracked property is reassigned', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const resources = {};
    const { server } = await startViteTestServer();
    resources.browser = await launchBrowserForServer(server);
    resources.browser = await resources.browser.newPage();
    await resources.browser.close();
    await server.close();
  `), []);
});

test('accepts cleanup after a tracked property parent is reassigned', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const resources = { runtime: {} };
    const { server } = await startViteTestServer();
    resources.runtime.browser = await launchBrowserForServer(server);
    resources.runtime = {
      browser: await existingBrowser.newPage(),
    };
    await resources.runtime.browser.close();
    await server.close();
  `), []);
});

test('accepts page properties as page-only cleanup', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const resources = {};
    const { server } = await startViteTestServer();
    const page = await existingBrowser.newPage();
    resources.page = page;
    await resources.page.close();
    await server.close();
  `), []);
});

test('accepts unrelated page properties in object literals', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const page = await existingBrowser.newPage();
    const resources = { page };
    await resources.page.close();
    await server.close();
  `), []);
});

test('rejects cleanup through array-literal elements holding resources', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const resources = [browser, server];
    await resources[0].close();
    await resources[1].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[1]');
});

test('rejects cleanup through array indexes assigned after initialization', () => {
  const violations = findUnsafeBrowserCleanup(`
    const resources = [];
    resources[0] = await createServer();
    resources[1] = await launch();
    await resources[0].close();
    await resources[1].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[1]');
  assert.equal(violations[0].server, 'resources[0]');
});

test('accepts cleanup after a tracked array index is reassigned', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const resources = [browser, server];
    resources[0] = await browser.newPage();
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('accepts unrelated page elements in array literals', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const page = await existingBrowser.newPage();
    const resources = [page];
    await resources[0].close();
    await server.close();
  `), []);
});

test('current browser fixtures use safe cleanup', () => {
  assert.deepEqual(checkBrowserCleanupFiles(), []);
});
