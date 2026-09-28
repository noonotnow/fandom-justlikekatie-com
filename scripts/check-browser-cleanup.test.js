import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkBrowserCleanupFiles,
  findDirectBrowserNavigations,
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

test('rejects direct browser navigation that bypasses startup diagnostics', () => {
  const violations = findDirectBrowserNavigations(`
    await page.goto(origin);
    await crawlerPage.goto(route);
  `);

  assert.deepEqual(
    violations.map(({ kind, line, receiver }) => ({ kind, line, receiver })),
    [
      { kind: 'direct-navigation', line: 2, receiver: 'page' },
      { kind: 'direct-navigation', line: 3, receiver: 'crawlerPage' },
    ],
  );
});

test('accepts browser navigation through the diagnostic helper', () => {
  assert.deepEqual(
    findDirectBrowserNavigations('await gotoTestPage(page, origin);'),
    [],
  );
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

test('rejects cleanup through aliases initialized by nested ordinary assignments', () => {
  const violations = findUnsafeBrowserCleanup(`
    let cachedBrowser;
    const renderer = (cachedBrowser = await launch());
    let cachedServer;
    const daemon = (cachedServer = await createServer());
    await renderer.close();
    await daemon.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'renderer');
  assert.equal(violations[0].server, 'daemon');
});

test('rejects cleanup through aliases initialized by nested logical assignments', () => {
  for (const operator of ['&&=', '||=', '??=']) {
    const violations = findUnsafeBrowserCleanup(`
      const browser = await launch();
      let cachedBrowser;
      const renderer = (cachedBrowser ${operator} browser);
      const server = await createServer();
      let cachedServer;
      const daemon = (cachedServer ${operator} server);
      await renderer.close();
      await daemon.close();
    `);

    assert.equal(violations.length, 1, operator);
    assert.equal(violations[0].browser, 'renderer', operator);
    assert.equal(violations[0].server, 'daemon', operator);
  }
});

test('rejects cleanup through chained nested assignments when resource paths agree', () => {
  const violations = findUnsafeBrowserCleanup(`
    const browser = await launch();
    let cachedBrowser;
    let backupBrowser;
    const renderer = (cachedBrowser ||= (backupBrowser ??= browser));
    const server = await createServer();
    let cachedServer;
    let backupServer;
    const daemon = (cachedServer &&= (backupServer = server));
    await renderer.close();
    await daemon.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'renderer');
  assert.equal(violations[0].server, 'daemon');
});

test('keeps outer aliases classified through shadowed nested ordinary assignments', () => {
  const violations = findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    let browserAlias = browser;
    let serverAlias = server;
    {
      let browserAlias;
      let serverAlias;
      const page = (browserAlias = await existingBrowser.newPage());
      const socket = (serverAlias = await connectToExistingServer());
      await page.close();
      await socket.close();
    }
    await browserAlias.close();
    await serverAlias.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'browserAlias');
  assert.equal(violations[0].server, 'serverAlias');
});

test('keeps outer aliases classified through shadowed nested logical assignments', () => {
  for (const operator of ['&&=', '||=', '??=']) {
    const violations = findUnsafeBrowserCleanup(`
      const browser = await launch();
      const server = await createServer();
      let browserAlias = browser;
      let serverAlias = server;
      {
        let browserAlias;
        let serverAlias;
        const page = (browserAlias ${operator} await existingBrowser.newPage());
        const socket = (serverAlias ${operator} await connectToExistingServer());
        await page.close();
        await socket.close();
      }
      await browserAlias.close();
      await serverAlias.close();
    `);

    assert.equal(violations.length, 1, operator);
    assert.equal(violations[0].browser, 'browserAlias', operator);
    assert.equal(violations[0].server, 'serverAlias', operator);
  }
});

test('still rejects sequential cleanup of shadowed nested aliases', () => {
  const violations = findUnsafeBrowserCleanup(`
    const page = await existingBrowser.newPage();
    const socket = await connectToExistingServer();
    {
      const page = await launch();
      const socket = await createServer();
      await page.close();
      await socket.close();
    }
    await page.close();
    await socket.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'page');
  assert.equal(violations[0].server, 'socket');
});

test('keeps outer aliases classified through shadowed for-loop bindings', () => {
  for (const loop of [
    'for (let browserAlias = firstPage; shouldRetry; browserAlias = nextPage())',
    'for (const browserAlias of pages)',
    'for (const browserAlias in pages)',
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      const browser = await launch();
      const server = await createServer();
      const browserAlias = browser;
      const serverAlias = server;
      ${loop} {
        await browserAlias.close();
        break;
      }
      await browserAlias.close();
      await serverAlias.close();
    `);

    assert.equal(violations.length, 1, loop);
    assert.equal(violations[0].browser, 'browserAlias', loop);
    assert.equal(violations[0].server, 'serverAlias', loop);
  }
});

test('keeps outer aliases classified through shadowed catch parameters', () => {
  const violations = findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const browserAlias = browser;
    const serverAlias = server;
    try {
      await prepareFixture();
    } catch (browserAlias) {
      await browserAlias.close();
    }
    await browserAlias.close();
    await serverAlias.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'browserAlias');
  assert.equal(violations[0].server, 'serverAlias');
});

test('still rejects sequential cleanup of aliases declared in loop and catch scopes', () => {
  for (const scopedCleanup of [
    `for (const resource of resources) {
      const browserAlias = await launch();
      const serverAlias = await createServer();
      await browserAlias.close();
      await serverAlias.close();
    }`,
    `try {
      await prepareFixture();
    } catch (browserAlias) {
      browserAlias = await launch();
      const serverAlias = await createServer();
      await browserAlias.close();
      await serverAlias.close();
    }`,
  ]) {
    const violations = findUnsafeBrowserCleanup(scopedCleanup);

    assert.equal(violations.length, 1, scopedCleanup);
    assert.equal(violations[0].browser, 'browserAlias', scopedCleanup);
    assert.equal(violations[0].server, 'serverAlias', scopedCleanup);
  }
});

test('keeps outer aliases classified through object-destructured block shadows', () => {
  const violations = findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const browserAlias = browser;
    const serverAlias = server;
    {
      const { browserAlias, nested: { serverAlias } } = existingResources;
      await browserAlias.close();
      await serverAlias.close();
    }
    await browserAlias.close();
    await serverAlias.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'browserAlias');
  assert.equal(violations[0].server, 'serverAlias');
});

test('keeps outer aliases classified through array-destructured block shadows', () => {
  const violations = findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const browserAlias = browser;
    const serverAlias = server;
    {
      const [browserAlias, [, serverAlias]] = existingResources;
      await browserAlias.close();
      await serverAlias.close();
    }
    await browserAlias.close();
    await serverAlias.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'browserAlias');
  assert.equal(violations[0].server, 'serverAlias');
});

test('still rejects sequential cleanup through inner destructured resource aliases', () => {
  const violations = findUnsafeBrowserCleanup(`
    const browserAlias = await existingBrowser.newPage();
    const serverAlias = await connectToExistingServer();
    {
      const [{ server: serverAlias }, browserAlias] =
        await launchBrowserWithServer(startViteTestServer());
      await browserAlias.close();
      await serverAlias.close();
    }
    await browserAlias.close();
    await serverAlias.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'browserAlias');
  assert.equal(violations[0].server, 'serverAlias');
});

const destructuredBlockShadows = [
  {
    name: 'object defaults',
    declaration: 'let { browserAlias = fallbackPage, serverAlias = fallbackSocket } = existingResources;',
  },
  {
    name: 'array defaults',
    declaration: 'let [browserAlias = fallbackPage, serverAlias = fallbackSocket] = existingResources;',
  },
  {
    name: 'object rest',
    declaration: 'let { browserAlias, ...serverAlias } = existingResources;',
  },
  {
    name: 'array rest',
    declaration: 'let [browserAlias, ...serverAlias] = existingResources;',
  },
];

test('does not mistake default and rest destructured block shadows for outer resources', () => {
  for (const { name, declaration } of destructuredBlockShadows) {
    assert.deepEqual(findUnsafeBrowserCleanup(`
      const browserAlias = await launch();
      const serverAlias = await createServer();
      {
        ${declaration}
        await browserAlias.close();
        await serverAlias.close();
      }
      await Promise.allSettled([browserAlias.close(), serverAlias.close()]);
    `), [], name);
  }
});

test('keeps outer aliases classified after default and rest destructured block shadows', () => {
  for (const { name, declaration } of destructuredBlockShadows) {
    const violations = findUnsafeBrowserCleanup(`
      const browserAlias = await launch();
      const serverAlias = await createServer();
      {
        ${declaration}
        await browserAlias.close();
        await serverAlias.close();
      }
      await browserAlias.close();
      await serverAlias.close();
    `);

    assert.equal(violations.length, 1, name);
    assert.equal(violations[0].browser, 'browserAlias', name);
    assert.equal(violations[0].server, 'serverAlias', name);
  }
});

test('rejects inner resource aliases declared by default and rest destructuring', () => {
  for (const { name, declaration } of destructuredBlockShadows) {
    const violations = findUnsafeBrowserCleanup(`
      {
        ${declaration}
        browserAlias = await launch();
        serverAlias = await createServer();
        await browserAlias.close();
        await serverAlias.close();
      }
    `);

    assert.equal(violations.length, 1, name);
    assert.equal(violations[0].browser, 'browserAlias', name);
    assert.equal(violations[0].server, 'serverAlias', name);
  }
});

test('rejects sequential cleanup through object and array resource defaults', () => {
  for (const { name, declaration } of [
    {
      name: 'object defaults with renamed bindings',
      declaration: `const {
        missingBrowser: browserAlias = await launch(),
        missingServer: serverAlias = await createServer(),
      } = {};`,
    },
    {
      name: 'array defaults',
      declaration: `const [
        browserAlias = await launch(),
        serverAlias = await createServer(),
      ] = [];`,
    },
    {
      name: 'nested defaults',
      declaration: `const {
        nested: {
          browserAlias = await launch(),
          serverAlias = await startViteTestServer(),
        } = {},
      } = {};`,
    },
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      ${declaration}
      await browserAlias.close();
      await serverAlias.close();
    `);
    assert.equal(violations.length, 1, name);
    assert.equal(violations[0].browser, 'browserAlias', name);
    assert.equal(violations[0].server, 'serverAlias', name);
  }
});

test('rejects sequential cleanup through assigned destructuring defaults', () => {
  for (const assignment of [
    '({ browserAlias = await launch(), serverAlias = await createServer() } = {});',
    '([browserAlias = await launch(), serverAlias = await createServer()] = []);',
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      let browserAlias;
      let serverAlias;
      ${assignment}
      await browserAlias.close();
      await serverAlias.close();
    `);
    assert.equal(violations.length, 1, assignment);
    assert.equal(violations[0].browser, 'browserAlias', assignment);
    assert.equal(violations[0].server, 'serverAlias', assignment);
  }
});

test('rejects resource defaults in for-of and catch destructuring bindings', () => {
  for (const source of [
    `async function run() {
      for (const {
        browserAlias = await launch(),
        serverAlias = await createServer(),
      } of [{}]) {
        await browserAlias.close();
        await serverAlias.close();
      }
    }`,
    `async function run() {
      for (const [
        browserAlias = await launch(),
        serverAlias = await createServer(),
      ] of [[]]) {
        await browserAlias.close();
        await serverAlias.close();
      }
    }`,
    `async function run() {
      try {
        throw {};
      } catch ({
        browserAlias = await launch(),
        serverAlias = await createServer(),
      }) {
        await browserAlias.close();
        await serverAlias.close();
      }
    }`,
  ]) {
    const violations = findUnsafeBrowserCleanup(source);
    assert.equal(violations.length, 1, source);
    assert.equal(violations[0].browser, 'browserAlias', source);
    assert.equal(violations[0].server, 'serverAlias', source);
  }
});

test('keeps destructured catch defaults separate from outer resource aliases', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    async function run() {
      const browserAlias = await existingBrowser.newPage();
      const serverAlias = await createServer();
      try {
        throw {};
      } catch ({ browserAlias = await launch() }) {
        await prepareFixture(browserAlias);
      }
      await browserAlias.close();
      await serverAlias.close();
    }
  `), []);

  const violations = findUnsafeBrowserCleanup(`
    async function run() {
      const browserAlias = await launch();
      const serverAlias = await createServer();
      try {
        throw {};
      } catch ({
        browserAlias = await existingBrowser.newPage(),
        serverAlias = await connectToExistingServer(),
      }) {
        await browserAlias.close();
        await serverAlias.close();
      }
      await browserAlias.close();
      await serverAlias.close();
    }
  `);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'browserAlias');
  assert.equal(violations[0].server, 'serverAlias');
});

test('resource defaults remain scoped to their destructured block', () => {
  for (const declaration of [
    'const { browserAlias = await launch(), serverAlias = await createServer() } = {};',
    'const [browserAlias = await launch(), serverAlias = await createServer()] = [];',
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      const browserAlias = await existingBrowser.newPage();
      const serverAlias = await connectToExistingServer();
      {
        ${declaration}
        await browserAlias.close();
        await serverAlias.close();
      }
      await browserAlias.close();
      await serverAlias.close();
    `);
    assert.equal(violations.length, 1, declaration);
    assert.equal(violations[0].browser, 'browserAlias', declaration);
    assert.equal(violations[0].server, 'serverAlias', declaration);
  }
});

test('does not classify page and unrelated destructuring defaults as resources', () => {
  for (const declaration of [
    `const {
      browserAlias = await existingBrowser.newPage(),
      serverAlias = await createServer(),
    } = {};`,
    `const [
      browserAlias = await launch(),
      serverAlias = await connectToExistingServer(),
    ] = [];`,
    `const [
      browserAlias = await existingBrowser.newPage(),
      serverAlias = await connectToExistingServer(),
    ] = [];`,
  ]) {
    assert.deepEqual(findUnsafeBrowserCleanup(`
      ${declaration}
      await browserAlias.close();
      await serverAlias.close();
    `), [], declaration);
  }
});

test('does not classify chained nested assignments with mixed resource paths', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    let cached;
    let fallback;
    const ambiguous = (cached ||= (fallback ??= useBrowser ? browser : server));
    const page = await existingBrowser.newPage();
    await ambiguous.close();
    await page.close();
  `), []);
});

test('retains an earlier logical resource path before a nested assignment overwrites it', () => {
  for (const operator of ['||', '&&', '??']) {
    const violations = findUnsafeBrowserCleanup(`
      let browserAlias = await launch();
      const renderer = browserAlias ${operator} (browserAlias = await existingBrowser.newPage());
      const server = await createServer();
      await renderer.close();
      await server.close();
    `);

    assert.equal(violations.length, 1, operator);
    assert.equal(violations[0].browser, 'renderer', operator);
    assert.equal(violations[0].server, 'server', operator);
  }
});

test('retains either conditional resource path when the other overwrites its alias', () => {
  for (const initializer of [
    'useBrowser ? browserAlias : (browserAlias = await existingBrowser.newPage())',
    'usePage ? (browserAlias = await existingBrowser.newPage()) : browserAlias',
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      let browserAlias = await launch();
      const renderer = ${initializer};
      const server = await createServer();
      await renderer.close();
      await server.close();
    `);

    assert.equal(violations.length, 1, initializer);
    assert.equal(violations[0].browser, 'renderer', initializer);
    assert.equal(violations[0].server, 'server', initializer);
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

test('bounds cleanup state work across generated nested loops and branching calls', () => {
  const branchingCall = `
    consume(
      flag ? probe() : probe(),
      flag && probe(),
      flag || probe(),
      flag ?? probe(),
      flag ? probe() : probe()
    );
  `;
  const nestedLoops = Array.from({ length: 3 }, (_, depth) => (
    `for (let index${depth} = 0; index${depth} < limit; index${depth}++) {`
  )).join('\n')
    + branchingCall.repeat(3)
    + '}'.repeat(3);
  const setup = `
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    try {
      ${nestedLoops}
    } finally {
  `;

  for (const [cleanup, expectedViolations] of [
    ['await Promise.allSettled([browser.close(), server.close()]);', 0],
    ['await browser.close(); await server.close();', 1],
  ]) {
    // The budget is on states examined at deduplication boundaries, not elapsed time.
    // Repeated equivalent branches should collapse before entering the next loop.
    const metrics = { stateVisits: 0, maxStateVisits: 2500 };
    const source = `${setup}${cleanup}}`;
    const violations = findUnsafeBrowserCleanup(
      source,
      'generated-browser.test.ts',
      metrics,
    );
    assert.equal(violations.length, expectedViolations, cleanup);
    assert.ok(metrics.stateVisits > 0, 'the scale fixture must exercise state tracking');
    assert.ok(metrics.stateVisits <= metrics.maxStateVisits, cleanup);
    if (expectedViolations === 0) {
      assert.throws(
        () => findUnsafeBrowserCleanup(
          source,
          'generated-browser.test.ts',
          { maxStateVisits: 100 },
        ),
        /exceeded 100 state visits/,
      );
    }
  }
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

test('accepts safe switch case-label expressions', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    switch (resourceToClose) {
      case browserLabel():
        await browser.close();
        break;
      case serverLabel():
        await server.close();
        break;
    }
  `), []);
});

test('keeps throwing switch-selector paths out of clause-body cleanup', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    try {
      switch (selectResource()) {
        case 'browser':
          try {
            await browser.close();
          } catch {
            break;
          }
          break;
      }
    } catch {
      await server.close();
    }
  `), []);

  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    switch (selectResource()) {
      case 'browser':
        await browser.close();
        break;
    }
    await server.close();
  `);

  assert.equal(violations.length, 1);
});

test('does not combine throwing selector cleanup with clause cleanup', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    try {
      switch (selectResource(await browser.close())) {
        case 'browser':
          await browser.close();
          break;
      }
    } catch {
      // A selector failure never enters the case body.
    }
  `), []);
});

test('reports sequential cleanup after a selector closes a resource and completes', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    try {
      switch (selectResource(await browser.close())) {
        case 'server':
          await server.close();
          break;
      }
    } catch {
      // A failure before the case cannot trigger its cleanup.
    }
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'browser');
  assert.equal(violations[0].server, 'server');
});

test('keeps throwing switch-label paths out of clause-body cleanup', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    try {
      switch (resourceToClose) {
        case browserLabel():
          try {
            await browser.close();
          } catch {
            break;
          }
          break;
      }
    } catch {
      await server.close();
    }
  `), []);

  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    switch (resourceToClose) {
      case browserLabel():
        await browser.close();
        break;
    }
    await server.close();
  `);

  assert.equal(violations.length, 1);
});

test('keeps throwing earlier switch labels out of fallthrough and default cleanup', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    try {
      switch (resourceToClose) {
        case firstBrowserLabel():
        case secondBrowserLabel():
        default:
        case finalBrowserLabel():
          try {
            await browser.close();
          } catch {
            break;
          }
          break;
      }
    } catch {
      await server.close();
    }
  `), []);
});

test('rejects sequential cleanup after completed labels fall through a default clause', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    switch (resourceToClose) {
      case browserLabel():
        await browser.close();
      default:
      case serverLabel():
        await server.close();
        break;
    }
  `);

  assert.equal(violations.length, 1);
});

test('rejects browser cleanup in a switch case label before server cleanup', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    switch (resourceToClose) {
      case await browser.close():
        break;
      case 'server':
        await server.close();
        break;
    }
  `);

  assert.equal(violations.length, 1);
});

test('rejects server cleanup in a switch case label before browser cleanup', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    switch (resourceToClose) {
      case await server.close():
        break;
      default:
        await browser.close();
    }
  `);

  assert.equal(violations.length, 1);
});

test('stops evaluating switch labels after the selected case', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    switch (resourceToClose) {
      case 'browser':
        await browser.close();
        break;
      case await server.close():
        break;
    }
  `), []);
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

test('bounds cleanup paths through nested pixel loops', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const { browser } = await launchPageForServer(server);
    for (let pixelY = 0; pixelY < probe.height; pixelY += 1) {
      for (let pixelX = 0; pixelX < probe.width; pixelX += 1) {
        if (pixels.data[(pixelY * probe.width + pixelX) * 4 + 3] === 0) continue;
        left = Math.min(left, pixelX);
        right = Math.max(right, pixelX);
        top = Math.min(top, pixelY);
        bottom = Math.max(bottom, pixelY);
      }
    }
    await closeBrowserAndServer(browser, server);
  `), []);
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

test('accepts cleanup skipped by a labeled break past a nested switch', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    cleanup: while (resourceToClose) {
      switch (resourceToClose) {
        case 'browser':
          await browser.close();
          break cleanup;
        default:
          await server.close();
          break cleanup;
      }
      await server.close();
    }
  `), []);
});

test('accepts mutually exclusive cleanup through either label stacked on a loop', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    outer: inner: while (resourceToClose) {
      if (resourceToClose === 'browser') {
        await browser.close();
        break outer;
      }
      await server.close();
      break inner;
    }
  `), []);
});

test('rejects sequential cleanup after a break through either stacked loop label', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    outer: inner: while (resourceToClose) {
      await browser.close();
      if (useOuterLabel) {
        break outer;
      }
      break inner;
    }
    await server.close();
  `);

  assert.equal(violations.length, 1);
});

test('rejects sequential cleanup after a labeled break exits its named inner loop', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    cleanup: while (resourceToClose) {
      switch (resourceToClose) {
        case 'browser':
          await browser.close();
          break cleanup;
        default:
          break;
      }
    }
    await server.close();
  `);

  assert.equal(violations.length, 1);
});

test('rejects cleanup across iterations after continue resumes a labeled outer loop', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    cleanup: for (const resource of resources) {
      for (const attempt of attempts) {
        switch (resource) {
          case 'browser':
            await browser.close();
            continue cleanup;
          default:
            await server.close();
            break cleanup;
        }
      }
    }
  `);

  assert.equal(violations.length, 1);
});

test('accepts mutually exclusive cleanup when labeled continue skips the outer remainder', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    cleanup: for (const resource of ['browser']) {
      do {
        switch (resource) {
          case 'browser':
            await browser.close();
            continue cleanup;
          default:
            break cleanup;
        }
      } while (shouldRetry);
      await server.close();
    }
  `), []);
});

test('accepts cleanup skipped by a continue through either stacked loop label', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    outer: inner: for (const resource of ['browser']) {
      await browser.close();
      if (useOuterLabel) {
        continue outer;
      }
      continue inner;
      await server.close();
    }
  `), []);
});

test('rejects cleanup across iterations after continuing through stacked loop labels', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    outer: inner: for (const resource of resources) {
      if (resource === 'browser') {
        await browser.close();
        if (useOuterLabel) {
          continue outer;
        }
        continue inner;
      }
      await server.close();
    }
  `);

  assert.equal(violations.length, 1);
});

const remainingStackedLabelLoopForms = [
  {
    name: 'classic for',
    wrap: body => `outer: inner: for (let index = 0; index < resources.length; index += 1) {
      const resource = resources[index];
      ${body}
    }`,
  },
  {
    name: 'for-in',
    wrap: body => `outer: inner: for (const key in resources) {
      const resource = resources[key];
      ${body}
    }`,
  },
  {
    name: 'do-while',
    wrap: body => `outer: inner: do {
      const resource = resources[currentIndex];
      ${body}
    } while (shouldContinue)`,
  },
];

remainingStackedLabelLoopForms.forEach((loopForm) => {
  test(`accepts cleanup skipped by a break through either stacked ${loopForm.name} label`, () => {
    assert.deepEqual(findUnsafeBrowserCleanup(`
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      ${loopForm.wrap(`
        if (resource === 'browser') {
          await browser.close();
          break outer;
        }
        await server.close();
        break inner;
      `)}
    `), []);
  });

  test(`rejects sequential cleanup after a break through either stacked ${loopForm.name} label`, () => {
    const violations = findUnsafeBrowserCleanup(`
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      ${loopForm.wrap(`
        await browser.close();
        if (useOuterLabel) {
          break outer;
        }
        break inner;
      `)}
      await server.close();
    `);

    assert.equal(violations.length, 1);
  });

  test(`accepts cleanup skipped by a continue through either stacked ${loopForm.name} label`, () => {
    assert.deepEqual(findUnsafeBrowserCleanup(`
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      ${loopForm.wrap(`
        await browser.close();
        if (useOuterLabel) {
          continue outer;
        }
        continue inner;
        await server.close();
      `)}
    `), []);
  });

  test(`rejects cleanup across iterations after continuing through stacked ${loopForm.name} labels`, () => {
    const violations = findUnsafeBrowserCleanup(`
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      ${loopForm.wrap(`
        if (resource === 'browser') {
          await browser.close();
          if (useOuterLabel) {
            continue outer;
          }
          continue inner;
        }
        await server.close();
      `)}
    `);

    assert.equal(violations.length, 1);
  });
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

test('accepts cleanup alternatives separated by try success and failure', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    async function stopFixture() {
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      try {
        await prepareBrowserShutdown();
      } catch {
        await browser.close();
        return;
      }
      await server.close();
    }
  `), []);
});

test('rejects sequential cleanup when an attempted try close reaches catch', () => {
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
  assert.equal(violations[0].browser, 'browser');
  assert.equal(violations[0].server, 'server');
});

test('accepts nested catch cleanup alternatives when no path closes both resources', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    async function stopFixture() {
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      try {
        try {
          await prepareBrowserShutdown();
        } catch {
          try {
            await browser.close();
          } catch {
            return;
          }
          return;
        }
      } catch {
        await server.close();
        return;
      }
    }
  `), []);
});

test('rejects sequential cleanup spanning an inner and outer catch', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    try {
      try {
        await prepareBrowserShutdown();
      } catch {
        await browser.close();
      }
    } catch {
      await server.close();
    }
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'browser');
  assert.equal(violations[0].server, 'server');
});

test('finally cleanup preserves incoming normal control', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    try {
      await prepareBrowserShutdown();
    } finally {
      await browser.close();
    }
    await server.close();
  `);

  assert.equal(violations.length, 1);
});

test('finally cleanup preserves incoming return control', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    async function stopFixture() {
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      try {
        return;
      } finally {
        await browser.close();
      }
      await server.close();
    }
  `), []);
});

test('finally cleanup preserves incoming throw control', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    try {
      try {
        throw new Error('shutdown failed');
      } finally {
        await browser.close();
      }
    } catch {
      await server.close();
    }
  `);

  assert.equal(violations.length, 1);
});

test('return from finally makes cleanup after the try unreachable', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    async function stopFixture() {
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      try {
        await browser.close();
      } finally {
        return;
      }
      await server.close();
    }
  `), []);
});

test('throw from finally reaches an enclosing catch with try cleanup intact', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    try {
      try {
        await browser.close();
        return;
      } finally {
        throw new Error('forced shutdown failure');
      }
    } catch {
      await server.close();
    }
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'browser');
  assert.equal(violations[0].server, 'server');
});

test('throw from finally keeps finally cleanup before an enclosing catch', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    try {
      try {
        return;
      } finally {
        await browser.close();
        throw new Error('forced shutdown failure');
      }
    } catch {
      await server.close();
    }
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'browser');
  assert.equal(violations[0].server, 'server');
});

test('break from finally replaces return and reaches cleanup after the loop', () => {
  const violations = findUnsafeBrowserCleanup(`
    async function stopFixture() {
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      cleanup: while (shouldStop) {
        while (shouldRetry) {
          try {
            await browser.close();
            return;
          } finally {
            break cleanup;
          }
          await server.close();
        }
        await server.close();
      }
      await server.close();
    }
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'browser');
  assert.equal(violations[0].server, 'server');
});

test('continue from finally replaces throw and skips the current loop remainder', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    cleanup: for (const resource of ['browser']) {
      do {
        try {
          await browser.close();
          throw new Error('forced retry');
        } finally {
          continue cleanup;
        }
        await server.close();
      } while (shouldRetry);
      if (resource === 'server') {
        await server.close();
      }
    }
  `), []);
});

test('cleanup inside finally stays on the break path to cleanup after the loop', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    while (shouldStop) {
      try {
        await prepareBrowserShutdown();
      } finally {
        await browser.close();
        break;
      }
      await server.close();
    }
    await server.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'browser');
  assert.equal(violations[0].server, 'server');
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

test('rejects cleanup through resources copied by object spread', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const acquired = { browser, server };
    const resources = { label: 'fixture', ...acquired };
    await resources.browser.close();
    await resources.server.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources.browser');
  assert.equal(violations[0].server, 'resources.server');
});

test('rejects cleanup through conditionally selected object spreads', () => {
  const violations = findUnsafeBrowserCleanup(`
    const primary = {
      browser: await launch(),
      server: await createServer(),
    };
    const backup = {
      browser: await launch(),
      server: await createServer(),
    };
    const resources = { ...(preferPrimary ? primary : backup) };
    await resources.browser.close();
    await resources.server.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources.browser');
  assert.equal(violations[0].server, 'resources.server');
});

test('rejects cleanup through inline conditional object spreads', () => {
  const violations = findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const resources = {
      ...(preferPrimary
        ? { browser, server }
        : { browser, server }),
    };
    await resources.browser.close();
    await resources.server.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources.browser');
  assert.equal(violations[0].server, 'resources.server');
});

test('rejects cleanup through mixed named and inline conditional object spreads', () => {
  const violations = findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const acquired = { browser, server };
    const resources = {
      ...(preferPrimary ? acquired : { browser, server }),
    };
    await resources.browser.close();
    await resources.server.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources.browser');
  assert.equal(violations[0].server, 'resources.server');
});

test('rejects cleanup through logically selected object spreads', () => {
  for (const operator of ['||', '&&', '??']) {
    const violations = findUnsafeBrowserCleanup(`
      const primary = {
        browser: await launch(),
        server: await createServer(),
      };
      const backup = {
        browser: await launch(),
        server: await createServer(),
      };
      const resources = { ...(primary ${operator} backup) };
      await resources.browser.close();
      await resources.server.close();
    `);

    assert.equal(violations.length, 1, operator);
    assert.equal(violations[0].browser, 'resources.browser', operator);
    assert.equal(violations[0].server, 'resources.server', operator);
  }
});

test('does not classify object spreads with mixed resource alternatives', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const browserContainer = { resource: await launch() };
    const serverContainer = { resource: await createServer() };
    const resources = { ...(useBrowser ? browserContainer : serverContainer) };
    const page = await existingBrowser.newPage();
    await resources.resource.close();
    await page.close();
  `), []);
});

test('does not classify inline object spreads with mixed resource alternatives', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const resources = {
      ...(useBrowser ? { resource: browser } : { resource: server }),
    };
    const page = await existingBrowser.newPage();
    await resources.resource.close();
    await page.close();
  `), []);
});

test('clears existing ownership overwritten by mixed conditional spread alternatives', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const page = await existingBrowser.newPage();
    const resources = {
      browser,
      server,
      ...(useServer
        ? { browser: server }
        : { browser: page }),
    };
    await resources.browser.close();
    await resources.server.close();
  `), []);
});

test('rejects cleanup through an inline object-literal spread', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const resources = { ...{ browser, server } };
    await resources.browser.close();
    await resources.server.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources.browser');
  assert.equal(violations[0].server, 'resources.server');
});

test('accepts explicit properties after spread that override resource ownership', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const acquired = { browser, server };
    const resources = {
      ...acquired,
      browser: await existingBrowser.newPage(),
    };
    await resources.browser.close();
    await resources.server.close();
  `), []);
});

test('accepts later spreads that override resource ownership', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const acquired = { browser, server };
    const replacements = {
      browser: await existingBrowser.newPage(),
    };
    const resources = { ...acquired, ...replacements };
    await resources.browser.close();
    await resources.server.close();
  `), []);
});

test('accepts static computed properties after spread that override ownership', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const acquired = { browser, server };
    const resources = {
      ...acquired,
      ['browser']: await existingBrowser.newPage(),
    };
    await resources.browser.close();
    await resources.server.close();
  `), []);
});

test('accepts const string properties after spread that override ownership', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const browserKey = 'browser';
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const acquired = { browser, server };
    const resources = {
      ...acquired,
      [browserKey]: await existingBrowser.newPage(),
    };
    await resources.browser.close();
    await resources.server.close();
  `), []);
});

test('accepts const numeric properties after spread that override ownership', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const browserKey = 0;
    const browser = await launch();
    const server = await createServer();
    const acquired = { [0]: browser, server };
    const resources = {
      ...acquired,
      [browserKey]: await existingBrowser.newPage(),
    };
    await resources[0].close();
    await resources.server.close();
  `), []);
});

test('rejects cleanup through numeric properties copied by object spread', () => {
  const violations = findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const acquired = { [0]: browser, server };
    const resources = { ...acquired };
    await resources[0].close();
    await resources.server.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources.server');
});

test('copies signed numeric browser and server properties through named and inline spreads', () => {
  for (const spread of [
    '...acquired',
    '...{ ...acquired }',
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      const browser = await launch();
      const server = await createServer();
      const acquired = { [-1]: browser, [+2]: server };
      const resources = { ${spread} };
      await resources[-1].close();
      await resources[2].close();
    `);
    assert.equal(violations.length, 1, spread);
    assert.equal(violations[0].browser, 'resources[-1]', spread);
    assert.equal(violations[0].server, 'resources[2]', spread);
  }
});

test('static signed numeric definitions replace only their own ownership', () => {
  for (const replacement of [
    '[-1]: await existingBrowser.newPage()',
    'get [-1]() { return existingBrowser; }',
    '[-1]() { return existingBrowser; }',
    "['-1']: await existingBrowser.newPage()",
    '[negativeKey]: await existingBrowser.newPage()',
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      const negativeKey = -1;
      const browser = await launch();
      const server = await createServer();
      const acquired = { [-1]: browser, [-2]: server };
      const resources = { ...acquired, ${replacement} };
      await resources[-1].close();
      await resources[-2].close();
    `);
    assert.deepEqual(violations, [], replacement);
  }
  const violations = findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const acquired = { [-1]: browser, [-2]: server };
    const resources = { ...acquired, [-2]: await existingBrowser.newPage() };
    await resources[-1].close();
    await resources[-2].close();
  `);
  assert.deepEqual(violations, []);

  const unrelated = findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const acquired = { [-1]: browser, [-2]: server };
    const resources = { ...acquired, [-3]: await existingBrowser.newPage() };
    await resources[-1].close();
    await resources[-2].close();
  `);
  assert.equal(unrelated.length, 1);
  assert.equal(unrelated[0].browser, 'resources[-1]');
  assert.equal(unrelated[0].server, 'resources[-2]');
});

test('signed object keys do not replace or move tracked array indexes', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const acquired = { [-1]: browser, [0]: server };
    const resources = { ...acquired, [0]: await existingBrowser.newPage() };
    await resources[-1].close();
    await resources[0].close();
  `), []);

  const retained = findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const acquired = { [-1]: browser, [0]: server };
    const resources = { ...acquired };
    await resources[-1].close();
    await resources[0].close();
  `);
  assert.equal(retained.length, 1);
  assert.equal(retained[0].browser, 'resources[-1]');
  assert.equal(retained[0].server, 'resources[0]');

  const arrayViolations = findUnsafeBrowserCleanup(`
    const array = [await createServer(), await existingBrowser.newPage()];
    array[-1] = await launch();
    array.reverse();
    await array[-1].close();
    await array[1].close();
  `);
  assert.equal(arrayViolations.length, 1);
  assert.equal(arrayViolations[0].browser, 'array[-1]');
  assert.equal(arrayViolations[0].server, 'array[1]');
});

test('retains numeric browser ownership after nested dynamic computed definitions', () => {
  for (const definition of [
    'get [replacementKey]() { return existingBrowser; }',
    'set [replacementKey](value) { replacement = value; }',
    '[replacementKey]() { return existingBrowser; }',
    '[replacementKey]: await existingBrowser.newPage()',
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      const browser = await launch();
      const server = await createServer();
      const acquired = { [0]: browser, server };
      const resources = {
        runtime: {
          ...acquired,
          ${definition}
        },
      };
      await resources.runtime[0].close();
      await resources.runtime.server.close();
    `);

    assert.equal(violations.length, 1, definition);
    assert.equal(violations[0].browser, 'resources.runtime[0]', definition);
    assert.equal(violations[0].server, 'resources.runtime.server', definition);
  }
});

test('retains numeric server ownership after in-place dynamic computed definitions', () => {
  for (const definition of [
    'get [replacementKey]() { return existingServer; }',
    'set [replacementKey](value) { replacement = value; }',
    '[replacementKey]() { return existingServer; }',
    '[replacementKey]: existingServer',
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      const browser = await launch();
      const server = await createServer();
      let resources = { browser, [0]: server };
      resources = {
        ...resources,
        ${definition}
      };
      await resources.browser.close();
      await resources[0].close();
    `);

    assert.equal(violations.length, 1, definition);
    assert.equal(violations[0].browser, 'resources.browser', definition);
    assert.equal(violations[0].server, 'resources[0]', definition);
  }
});

test('clears nested numeric ownership after a static numeric replacement', () => {
  for (const definition of [
    'get [resourceKey]() { return existingBrowser; }',
    'set [resourceKey](value) { replacement = value; }',
    '[resourceKey]() { return existingBrowser; }',
    '[resourceKey]: await existingBrowser.newPage()',
  ]) {
    assert.deepEqual(findUnsafeBrowserCleanup(`
      const resourceKey = 0;
      const browser = await launch();
      const server = await createServer();
      const acquired = { [0]: browser, server };
      const resources = {
        runtime: {
          ...acquired,
          ${definition}
        },
      };
      await resources.runtime[0].close();
      await resources.runtime.server.close();
    `), [], definition);
  }
});

test('accepts const computed accessors and methods after spread that override ownership', () => {
  for (const member of [
    'get [browserKey]() { return existingBrowser; }',
    'set [browserKey](value) { replacement = value; }',
    '[browserKey]() { return existingBrowser; }',
  ]) {
    assert.deepEqual(findUnsafeBrowserCleanup(`
      const browserKey = 'browser';
      const browser = await launch();
      const server = await createServer();
      const acquired = { browser, server };
      const resources = {
        ...acquired,
        ${member}
      };
      await resources.browser.close();
      await resources.server.close();
    `), [], member);
  }
});

test('keeps computed property aliases conservative after reassignment', () => {
  const violations = findUnsafeBrowserCleanup(`
    let browserKey = 'browser';
    browserKey = replacementKey;
    const browser = await launch();
    const server = await createServer();
    const acquired = { browser, server };
    const resources = {
      ...acquired,
      [browserKey]: await existingBrowser.newPage(),
    };
    await resources.browser.close();
    await resources.server.close();
  `);

  assert.equal(violations.length, 1);
});

test('keeps ambiguous computed property aliases conservative', () => {
  const violations = findUnsafeBrowserCleanup(`
    const browserKey = useBrowser ? 'browser' : 'page';
    const browser = await launch();
    const server = await createServer();
    const acquired = { browser, server };
    const resources = {
      ...acquired,
      [browserKey]: await existingBrowser.newPage(),
    };
    await resources.browser.close();
    await resources.server.close();
  `);

  assert.equal(violations.length, 1);
});

test('keeps outer computed property aliases stable across nested block shadowing', () => {
  const violations = findUnsafeBrowserCleanup(`
    const browserKey = 'browser';
    const browser = await launch();
    const server = await createServer();
    const acquired = { browser, server };
    {
      const browserKey = 'label';
      const nested = {
        ...acquired,
        [browserKey]: 'nested',
      };
      await nested.browser.close();
      await nested.server.close();
    }
    const outer = {
      ...acquired,
      [browserKey]: await existingBrowser.newPage(),
    };
    await outer.browser.close();
    await outer.server.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'nested.browser');
  assert.equal(violations[0].server, 'nested.server');
});

test('keeps outer computed property aliases stable across catch and loop bindings', () => {
  for (const { shadow, name } of [
    {
      shadow: `
        try {
          await operation();
        } catch (browserKey) {
          const shadowed = {
            ...acquired,
            [browserKey]: 'caught',
          };
          await shadowed.browser.close();
          await shadowed.server.close();
        }
      `,
      name: 'catch binding',
    },
    {
      shadow: `
        for (const browserKey of replacementKeys) {
          const shadowed = {
            ...acquired,
            [browserKey]: 'iterated',
          };
          await shadowed.browser.close();
          await shadowed.server.close();
        }
      `,
      name: 'loop binding',
    },
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      const browserKey = 'browser';
      const browser = await launch();
      const server = await createServer();
      const acquired = { browser, server };
      ${shadow}
      const afterShadow = {
        ...acquired,
        [browserKey]: await existingBrowser.newPage(),
      };
      await afterShadow.browser.close();
      await afterShadow.server.close();
    `);

    assert.equal(violations.length, 1, name);
    assert.equal(violations[0].browser, 'shadowed.browser', name);
    assert.equal(violations[0].server, 'shadowed.server', name);
  }
});

test('keeps outer computed property aliases stable across function and class declarations', () => {
  for (const { declaration, name } of [
    { declaration: 'function browserKey() { return "label"; }', name: 'function declaration' },
    { declaration: 'class browserKey {}', name: 'class declaration' },
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      const browserKey = 'browser';
      const browser = await launch();
      const server = await createServer();
      const acquired = { browser, server };
      {
        ${declaration}
        const shadowed = {
          ...acquired,
          [browserKey]: await existingBrowser.newPage(),
        };
        await shadowed.browser.close();
        await shadowed.server.close();
      }
      const afterShadow = {
        ...acquired,
        [browserKey]: await existingBrowser.newPage(),
      };
      await afterShadow.browser.close();
      await afterShadow.server.close();
    `);

    assert.equal(violations.length, 1, name);
    assert.equal(violations[0].browser, 'shadowed.browser', name);
    assert.equal(violations[0].server, 'shadowed.server', name);
  }
});

test('keeps same-named computed property aliases independent in sibling scopes', () => {
  const violations = findUnsafeBrowserCleanup(`
    const browserKey = 'browser';
    const browser = await launch();
    const server = await createServer();
    const acquired = { browser, server };
    if (replaceBrowser) {
      const resourceKey = 'browser';
      const replaced = {
        ...acquired,
        [resourceKey]: await existingBrowser.newPage(),
      };
      await replaced.browser.close();
      await replaced.server.close();
    } else {
      const resourceKey = 'label';
      const retained = {
        ...acquired,
        [resourceKey]: 'retained',
      };
      await retained.browser.close();
      await retained.server.close();
    }
    const outer = {
      ...acquired,
      [browserKey]: await existingBrowser.newPage(),
    };
    await outer.browser.close();
    await outer.server.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'retained.browser');
  assert.equal(violations[0].server, 'retained.server');
});

test('accepts accessors after spread that override resource ownership', () => {
  for (const accessor of [
    'get browser() { return existingBrowser; }',
    'set browser(value) { replacement = value; }',
    "get ['browser']() { return existingBrowser; }",
    "set ['browser'](value) { replacement = value; }",
  ]) {
    assert.deepEqual(findUnsafeBrowserCleanup(`
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      const acquired = { browser, server };
      const resources = {
        ...acquired,
        ${accessor}
      };
      await resources.browser.close();
      await resources.server.close();
    `), [], accessor);
  }
});

test('accepts methods after spread that override resource ownership', () => {
  for (const method of [
    'browser() { return existingBrowser; }',
    "['browser']() { return existingBrowser; }",
  ]) {
    assert.deepEqual(findUnsafeBrowserCleanup(`
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      const acquired = { browser, server };
      const resources = {
        ...acquired,
        ${method}
      };
      await resources.browser.close();
      await resources.server.close();
    `), [], method);
  }
});

test('retains copied resource ownership when accessors override other properties', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const acquired = { browser, server };
    const resources = {
      ...acquired,
      get label() { return 'fixture'; },
    };
    await resources.browser.close();
    await resources.server.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources.browser');
  assert.equal(violations[0].server, 'resources.server');
});

test('retains copied resource ownership after dynamic computed definitions', () => {
  for (const definition of [
    'get [replacementKey]() { return existingBrowser; }',
    'set [replacementKey](value) { replacement = value; }',
    '[replacementKey]() { return existingBrowser; }',
    '[replacementKey]: await existingBrowser.newPage()',
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      const acquired = { browser, server };
      const resources = {
        ...acquired,
        ${definition}
      };
      await resources.browser.close();
      await resources.server.close();
    `);

    assert.equal(violations.length, 1, definition);
    assert.equal(violations[0].browser, 'resources.browser', definition);
    assert.equal(violations[0].server, 'resources.server', definition);
  }
});

test('retains conditionally copied ownership after dynamic computed definitions', () => {
  for (const spreadSource of [
    'preferPrimary ? primary : backup',
    'primary || backup',
    'primary && backup',
    'primary ?? backup',
  ]) {
    for (const definition of [
      'get [replacementKey]() { return existingBrowser; }',
      'set [replacementKey](value) { replacement = value; }',
      '[replacementKey]() { return existingBrowser; }',
      '[replacementKey]: await existingBrowser.newPage()',
    ]) {
      const violations = findUnsafeBrowserCleanup(`
        const browser = await launch();
        const server = await createServer();
        const primary = { browser, server };
        const backup = { browser, server };
        const resources = {
          ...(${spreadSource}),
          ${definition}
        };
        await resources.browser.close();
        await resources.server.close();
      `);

      const context = `${spreadSource}: ${definition}`;
      assert.equal(violations.length, 1, context);
      assert.equal(violations[0].browser, 'resources.browser', context);
      assert.equal(violations[0].server, 'resources.server', context);
    }
  }
});

test('clears conditionally copied ownership after static computed definitions', () => {
  for (const spreadSource of [
    'preferPrimary ? primary : backup',
    'primary || backup',
    'primary && backup',
    'primary ?? backup',
  ]) {
    for (const definition of [
      'get [browserKey]() { return existingBrowser; }',
      'set [browserKey](value) { replacement = value; }',
      '[browserKey]() { return existingBrowser; }',
      '[browserKey]: await existingBrowser.newPage()',
    ]) {
      assert.deepEqual(findUnsafeBrowserCleanup(`
        const browserKey = 'browser';
        const browser = await launch();
        const server = await createServer();
        const primary = { browser, server };
        const backup = { browser, server };
        const resources = {
          ...(${spreadSource}),
          ${definition}
        };
        await resources.browser.close();
        await resources.server.close();
      `), [], `${spreadSource}: ${definition}`);
    }
  }
});

test('retains copied resource ownership after nested dynamic computed definitions', () => {
  for (const definition of [
    'get [replacementKey]() { return existingBrowser; }',
    'set [replacementKey](value) { replacement = value; }',
    '[replacementKey]() { return existingBrowser; }',
    '[replacementKey]: await existingBrowser.newPage()',
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      const acquired = { browser, server };
      const resources = {
        runtime: {
          ...acquired,
          ${definition}
        },
      };
      await resources.runtime.browser.close();
      await resources.runtime.server.close();
    `);

    assert.equal(violations.length, 1, definition);
    assert.equal(violations[0].browser, 'resources.runtime.browser', definition);
    assert.equal(violations[0].server, 'resources.runtime.server', definition);
  }
});

test('clears copied resource ownership after nested static definitions', () => {
  for (const definition of [
    'get [browserKey]() { return existingBrowser; }',
    'set [browserKey](value) { replacement = value; }',
    '[browserKey]() { return existingBrowser; }',
    '[browserKey]: await existingBrowser.newPage()',
  ]) {
    assert.deepEqual(findUnsafeBrowserCleanup(`
      const browserKey = 'browser';
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      const acquired = { browser, server };
      const resources = {
        runtime: {
          ...acquired,
          ${definition}
        },
      };
      await resources.runtime.browser.close();
      await resources.runtime.server.close();
    `), [], definition);
  }
});

test('retains copied resource ownership after unrelated static definitions', () => {
  for (const definition of [
    "label: 'fixture'",
    "get label() { return 'fixture'; }",
    'set label(value) { replacement = value; }',
    "label() { return 'fixture'; }",
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      const acquired = { browser, server };
      const resources = {
        ...acquired,
        ${definition}
      };
      await resources.browser.close();
      await resources.server.close();
    `);

    assert.equal(violations.length, 1, definition);
    assert.equal(violations[0].browser, 'resources.browser', definition);
    assert.equal(violations[0].server, 'resources.server', definition);
  }
});

test('accepts object spreads without tracked resource properties', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const page = await existingBrowser.newPage();
    const metadata = { title: 'fixture', page };
    const resources = { ...metadata, retries: 2 };
    await resources.page.close();
    await server.close();
  `), []);
});

test('rejects cleanup through resources retained by in-place object spread', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    let resources = { browser, server };
    resources = { ...resources, label: 'updated' };
    await resources.browser.close();
    await resources.server.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources.browser');
  assert.equal(violations[0].server, 'resources.server');
});

test('retains browser and server ownership through repeated selected-source object copies', () => {
  for (const [selection, source] of [
    ['ternary', 'preferCurrent ? resources : backup'],
    ['OR', 'resources || backup'],
    ['AND', 'resources && backup'],
    ['nullish', 'resources ?? backup'],
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      const browser = await launch();
      const server = await createServer();
      const backup = { browser, server };
      let resources = { browser, server };
      resources = { ...(${source}), label: 'first copy' };
      resources = { ...(${source}), label: 'second copy' };
      await resources.browser.close();
      await resources.server.close();
    `);

    assert.equal(violations.length, 1, selection);
    assert.equal(violations[0].browser, 'resources.browser', selection);
    assert.equal(violations[0].server, 'resources.server', selection);
  }
});

test('keeps repeated selected-source copies conservative for dynamic definitions', () => {
  for (const [selection, source] of [
    ['ternary', 'preferCurrent ? resources : backup'],
    ['OR', 'resources || backup'],
    ['AND', 'resources && backup'],
    ['nullish', 'resources ?? backup'],
  ]) {
    for (const definition of [
      'get [replacementKey]() { return existingBrowser; }',
      'set [replacementKey](value) { replacement = value; }',
      '[replacementKey]() { return existingBrowser; }',
      '[replacementKey]: await existingBrowser.newPage()',
    ]) {
      const violations = findUnsafeBrowserCleanup(`
        const browser = await launch();
        const server = await createServer();
        const backup = { browser, server };
        let resources = { browser, server };
        resources = { ...(${source}), ${definition} };
        resources = { ...(${source}), ${definition} };
        await resources.browser.close();
        await resources.server.close();
      `);

      assert.equal(violations.length, 1, `${selection}: ${definition}`);
      assert.equal(violations[0].browser, 'resources.browser', `${selection}: ${definition}`);
      assert.equal(violations[0].server, 'resources.server', `${selection}: ${definition}`);
    }
  }
});

test('static computed replacements clear only matching ownership in repeated selected-source copies', () => {
  for (const [selection, source] of [
    ['ternary', 'preferCurrent ? resources : backup'],
    ['OR', 'resources || backup'],
    ['AND', 'resources && backup'],
    ['nullish', 'resources ?? backup'],
  ]) {
    for (const [replaced, remaining] of [
      ['browser', 'server'],
      ['server', 'browser'],
    ]) {
      const violations = findUnsafeBrowserCleanup(`
        const browser = await launch();
        const server = await createServer();
        const backup = { browser, server };
        const replacementKey = '${replaced}';
        let resources = { browser, server };
        resources = { ...(${source}), [replacementKey]: null };
        resources = { ...resources };
        const new${replaced} = await ${replaced === 'browser' ? 'launch()' : 'createServer()'};
        await resources.${replaced}.close();
        await resources.${remaining}.close();
        await new${replaced}.close();
      `);

      assert.equal(violations.length, 1, `${selection}: ${replaced}`);
      assert.equal(violations[0][replaced], `new${replaced}`, `${selection}: ${replaced}`);
      assert.equal(violations[0][remaining], `resources.${remaining}`, `${selection}: ${replaced}`);
    }
  }
});

test('accepts explicit overrides after an in-place object spread', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    let resources = { browser, server };
    resources = {
      ...resources,
      browser: await existingBrowser.newPage(),
    };
    await resources.browser.close();
    await resources.server.close();
  `), []);
});

test('retains copied resource ownership after in-place dynamic computed definitions', () => {
  for (const definition of [
    'get [replacementKey]() { return existingBrowser; }',
    'set [replacementKey](value) { replacement = value; }',
    '[replacementKey]() { return existingBrowser; }',
    '[replacementKey]: await existingBrowser.newPage()',
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      let resources = { browser, server };
      resources = {
        ...resources,
        ${definition}
      };
      await resources.browser.close();
      await resources.server.close();
    `);

    assert.equal(violations.length, 1, definition);
    assert.equal(violations[0].browser, 'resources.browser', definition);
    assert.equal(violations[0].server, 'resources.server', definition);
  }
});

test('clears copied resource ownership after in-place static definitions', () => {
  for (const definition of [
    'get [browserKey]() { return existingBrowser; }',
    'set [browserKey](value) { replacement = value; }',
    '[browserKey]() { return existingBrowser; }',
    '[browserKey]: await existingBrowser.newPage()',
  ]) {
    assert.deepEqual(findUnsafeBrowserCleanup(`
      const browserKey = 'browser';
      const { server } = await startViteTestServer();
      const browser = await launchBrowserForServer(server);
      let resources = { browser, server };
      resources = {
        ...resources,
        ${definition}
      };
      await resources.browser.close();
      await resources.server.close();
    `), [], definition);
  }
});

test('rejects cleanup through nested resources retained by in-place spread', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const resources = { runtime: { browser, server } };
    resources.runtime = { ...resources.runtime, label: 'updated' };
    await resources.runtime.browser.close();
    await resources.runtime.server.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources.runtime.browser');
  assert.equal(violations[0].server, 'resources.runtime.server');
});

test('accepts unrelated in-place object spreads', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const page = await existingBrowser.newPage();
    let resources = { page, label: 'fixture' };
    resources = { ...resources, label: 'updated' };
    await resources.page.close();
    await server.close();
  `), []);
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

test('deleting a tracked object property removes its ownership', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const resources = {};
    resources.browser = await launch();
    resources.server = await createServer();
    delete resources.browser;
    await resources.browser.close();
    await resources.server.close();
  `), []);
});

test('deleting a nested tracked object property removes its ownership', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const resources = {
      runtime: {
        browser: await launch(),
        server: await createServer(),
      },
    };
    delete resources.runtime.browser;
    await resources.runtime.browser.close();
    await resources.runtime.server.close();
  `), []);
});

test('constant string deletion aliases clear only the matching object property', () => {
  for (const deletedKey of ['browser', 'server']) {
    assert.deepEqual(findUnsafeBrowserCleanup(`
      const key = '${deletedKey}';
      const resources = {
        browser: await launch(),
        server: await createServer(),
      };
      delete resources[key];
      await resources.browser.close();
      await resources.server.close();
    `), [], deletedKey);
  }

  const violations = findUnsafeBrowserCleanup(`
    const key = 'browser';
    const resources = {
      browser: await launch(),
      otherBrowser: await launch(),
      server: await createServer(),
    };
    delete resources[key];
    await resources.otherBrowser.close();
    await resources.server.close();
  `);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources.otherBrowser');
  assert.equal(violations[0].server, 'resources.server');
});

test('numeric object deletion aliases clear only the matching object key', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const key = 0;
    const resources = {
      0: await launch(),
      1: await createServer(),
    };
    delete resources[key];
    await resources[0].close();
    await resources[1].close();
  `), []);

  const violations = findUnsafeBrowserCleanup(`
    const key = 2;
    const resources = {
      0: await launch(),
      1: await createServer(),
      2: 'label',
    };
    delete resources[key];
    await resources[0].close();
    await resources[1].close();
  `);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[1]');
});

test('reassigned deletion aliases do not assume their initial property', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const key = 'label';
    key = currentKey;
    const resources = {
      browser: await launch(),
      server: await createServer(),
      label: 'fixture',
    };
    delete resources[key];
    await resources.browser.close();
    await resources.server.close();
  `), []);
});

test('shadowed deletion aliases use their own scope without changing the outer alias', () => {
  const violations = findUnsafeBrowserCleanup(`
    const key = 'browser';
    const resources = {
      browser: await launch(),
      server: await createServer(),
      label: 'fixture',
    };
    {
      const key = 'label';
      delete resources[key];
    }
    await resources.browser.close();
    await resources.server.close();
  `);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources.browser');
  assert.equal(violations[0].server, 'resources.server');

  assert.deepEqual(findUnsafeBrowserCleanup(`
    const key = 'browser';
    const resources = {
      browser: await launch(),
      server: await createServer(),
    };
    {
      const key = 'server';
      delete resources[key];
    }
    await resources.browser.close();
    await resources.server.close();
  `), []);

  assert.deepEqual(findUnsafeBrowserCleanup(`
    const key = 'label';
    const resources = {
      browser: await launch(),
      server: await createServer(),
      label: 'fixture',
    };
    {
      const key = currentKey;
      delete resources[key];
    }
    await resources.browser.close();
    await resources.server.close();
  `), []);
});

test('dynamic object property deletion clears possible stale ownership', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const resources = {
      browser: await launch(),
      server: await createServer(),
    };
    delete resources[propertyToDelete];
    await resources.browser.close();
    await resources.server.close();
  `), []);
});

test('deleting unrelated and page-only properties retains real cleanup violations', () => {
  for (const deletion of [
    'delete resources.label;',
    'delete resources.page;',
    "delete resources['label'];",
    'delete resources[pageKey];',
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      const pageKey = 'page';
      const resources = {
        browser: await launch(),
        server: await createServer(),
        page: await existingBrowser.newPage(),
        label: 'fixture',
      };
      ${deletion}
      await resources.browser.close();
      await resources.server.close();
    `);

    assert.equal(violations.length, 1, deletion);
    assert.equal(violations[0].browser, 'resources.browser', deletion);
    assert.equal(violations[0].server, 'resources.server', deletion);
  }
});

test('reassigned object properties regain ownership after deletion', () => {
  const violations = findUnsafeBrowserCleanup(`
    const resources = {
      browser: await launch(),
      server: await createServer(),
    };
    delete resources.browser;
    resources.browser = await launch();
    await resources.browser.close();
    await resources.server.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources.browser');
  assert.equal(violations[0].server, 'resources.server');
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

test('clears ownership beyond a statically shortened array length', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const resources = [browser, server];
    resources.length = 1;
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('updates array ownership for static computed length assignments', () => {
  for (const setup of [
    "resources['length'] = 1",
    'resources["length"] = 1',
    "const key = 'length'; resources[key] = 1",
  ]) {
    assert.deepEqual(findUnsafeBrowserCleanup(`
      const browser = await launch();
      const server = await createServer();
      const resources = [browser, server];
      ${setup};
      await resources[0].close();
      await resources[1].close();
    `), [], setup);
  }

  const violations = findUnsafeBrowserCleanup(`
    const resources = [await launch(), await createServer()];
    resources['length'] = 4;
    await resources[0].close();
    await resources[1].close();
  `);
  assert.equal(violations.length, 1);
});

test('keeps dynamic computed length assignments conservative', () => {
  const violations = findUnsafeBrowserCleanup(`
    const resources = [await launch(), await createServer()];
    resources[key] = 1;
    await resources[0].close();
    await resources[1].close();
  `);
  assert.equal(violations.length, 1);

  assert.deepEqual(findUnsafeBrowserCleanup(`
    const resources = [await launch(), await createServer()];
    resources['length'] = nextLength;
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('clears ownership beyond a shortened array length when a spread makes length unknown', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const resources = [browser, server, ...pages];
    resources.length = 1;
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('does not apply array length truncation semantics to numeric object properties', () => {
  const violations = findUnsafeBrowserCleanup(`
    const resources = {};
    resources[0] = await launch();
    resources[1] = await createServer();
    resources.length = 1;
    await resources[0].close();
    await resources[1].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[1]');
});

test('does not truncate numeric object properties through computed length updates', () => {
  for (const update of [
    "resources['length'] = 1",
    "resources['length'] -= 1",
    "resources['length']--",
    "const key = 'length'; --resources[key]",
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      const resources = {};
      resources[0] = await launch();
      resources[1] = await createServer();
      ${update};
      await resources[0].close();
      await resources[1].close();
    `);
    assert.equal(violations.length, 1, update);
  }
});

test('retains ownership below a statically shortened array length', () => {
  const violations = findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const resources = [browser, server, await existingBrowser.newPage()];
    resources.length = 2;
    await resources[0].close();
    await resources[1].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[1]');
});

test('retains ownership when a static length assignment extends an array', () => {
  const violations = findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const resources = [browser, server];
    resources.length = 4;
    await resources[0].close();
    await resources[1].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[1]');
});

test('clears array ownership after an unknown length assignment', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const resources = [browser, server];
    resources.length = nextLength;
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('clears ownership beyond statically reduced compound array lengths', () => {
  for (const assignment of ['-= 1', '*= 0.5', '>>= 1']) {
    assert.deepEqual(findUnsafeBrowserCleanup(`
      const browser = await launch();
      const server = await createServer();
      const resources = [browser, server];
      resources.length ${assignment};
      await resources[0].close();
      await resources[1].close();
    `), [], assignment);
  }
});

test('updates ownership for static computed compound array lengths', () => {
  for (const update of [
    "resources['length'] -= 1",
    "resources['length'] >>= 1",
    "const key = 'length'; resources[key] *= 0",
  ]) {
    assert.deepEqual(findUnsafeBrowserCleanup(`
      const resources = [await launch(), await createServer()];
      ${update};
      await resources[0].close();
      await resources[1].close();
    `), [], update);
  }
  const violations = findUnsafeBrowserCleanup(`
    const resources = [await launch(), await createServer()];
    resources['length'] += 1;
    await resources[0].close();
    await resources[1].close();
  `);
  assert.equal(violations.length, 1);
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const resources = [await launch(), await createServer()];
    resources['length'] -= removedCount;
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('retains ownership when a compound array length assignment grows the array', () => {
  const violations = findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const resources = [browser, server];
    resources.length += 2;
    await resources[0].close();
    await resources[1].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[1]');
});

test('clears array ownership after an unknown compound length assignment', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const resources = [browser, server];
    resources.length -= removedCount;
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('updates known array lengths through increment and decrement operators', () => {
  const decrementForms = ['resources.length--', '--resources.length'];
  for (const expression of decrementForms) {
    assert.deepEqual(findUnsafeBrowserCleanup(`
      const browser = await launch();
      const server = await createServer();
      const resources = [browser, server];
      ${expression};
      await resources[0].close();
      await resources[1].close();
    `), [], expression);
  }

  for (const expression of ['resources.length++', '++resources.length']) {
    const violations = findUnsafeBrowserCleanup(`
      const browser = await launch();
      const server = await createServer();
      const resources = [browser, server];
      ${expression};
      await resources[0].close();
      await resources[1].close();
    `);
    assert.equal(violations.length, 1, expression);
  }
});

test('updates known array lengths through computed increment and decrement', () => {
  for (const expression of [
    "resources['length']--",
    '--resources["length"]',
    "const key = 'length'; resources[key]--",
  ]) {
    assert.deepEqual(findUnsafeBrowserCleanup(`
      const resources = [await launch(), await createServer()];
      ${expression};
      await resources[0].close();
      await resources[1].close();
    `), [], expression);
  }
  for (const expression of ["resources['length']++", "++resources['length']"]) {
    const violations = findUnsafeBrowserCleanup(`
      const resources = [await launch(), await createServer()];
      ${expression};
      await resources[0].close();
      await resources[1].close();
    `);
    assert.equal(violations.length, 1, expression);
  }
});

test('accepts page-only entries after incremental array length changes', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const page = await existingBrowser.newPage();
    const resources = [page, server];
    resources.length--;
    resources.length += 2;
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('deleted array indexes no longer participate in cleanup pairing', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const resources = [browser, server];
    delete resources[0];
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('deletes tracked indexes when an array spread makes length unknown', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const resources = [browser, server, ...pages];
    delete resources[0];
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('deletes directly assigned tracked indexes without a known array length', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const resources = {};
    resources[0] = await launch();
    resources[1] = await createServer();
    delete resources[0];
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('clears array ownership after a dynamic index deletion', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const resources = [browser, server];
    delete resources[indexToDelete];
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('clears unknown-length array ownership after a dynamic index deletion', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const resources = [browser, server, ...pages];
    delete resources[indexToDelete];
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('retains normal array ownership after deleting negative or fractional keys', () => {
  for (const deletedKey of ['-1', '1.5']) {
    const violations = findUnsafeBrowserCleanup(`
      const resources = [await launch(), await createServer()];
      delete resources[${deletedKey}];
      await resources[0].close();
      await resources[1].close();
    `);

    assert.equal(violations.length, 1, deletedKey);
    assert.equal(violations[0].browser, 'resources[0]', deletedKey);
    assert.equal(violations[0].server, 'resources[1]', deletedKey);
  }
});

test('deleting a static negative array property clears only its ownership', () => {
  for (const deletion of [
    'delete resources[-1];',
    "delete resources['-1'];",
    'delete resources[negativeKey];',
    'delete resources[stringKey];',
  ]) {
    const violations = findUnsafeBrowserCleanup(`
      const negativeKey = -1;
      const stringKey = '-1';
      const resources = [await existingBrowser.newPage(), await createServer()];
      resources[-1] = await launch();
      resources[-2] = await launch();
      ${deletion}
      await resources[-1].close();
      await resources[1].close();
    `);
    assert.deepEqual(violations, [], deletion);

    const unaffected = findUnsafeBrowserCleanup(`
      const negativeKey = -1;
      const stringKey = '-1';
      const resources = [await launch(), await createServer()];
      resources[-1] = await launch();
      ${deletion}
      await resources[0].close();
      await resources[1].close();
    `);
    assert.equal(unaffected.length, 1, deletion);
    assert.equal(unaffected[0].browser, 'resources[0]', deletion);
    assert.equal(unaffected[0].server, 'resources[1]', deletion);

    const otherNegativeKey = findUnsafeBrowserCleanup(`
      const negativeKey = -1;
      const stringKey = '-1';
      const resources = [await existingBrowser.newPage(), await createServer()];
      resources[-1] = await launch();
      resources[-2] = await launch();
      ${deletion}
      await resources[-2].close();
      await resources[1].close();
    `);
    assert.equal(otherNegativeKey.length, 1, deletion);
    assert.equal(otherNegativeKey[0].browser, 'resources[-2]', deletion);
    assert.equal(otherNegativeKey[0].server, 'resources[1]', deletion);
  }
});

test('retains ownership for array indexes not deleted', () => {
  const violations = findUnsafeBrowserCleanup(`
    const browser = await launch();
    const server = await createServer();
    const resources = [browser, await existingBrowser.newPage(), server];
    delete resources[1];
    await resources[0].close();
    await resources[2].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[2]');
});

test('accepts page-only and reassigned entries after array deletion', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const server = await createServer();
    const resources = [
      await launch(),
      await existingBrowser.newPage(),
      server,
    ];
    delete resources[0];
    resources[2] = await connectToExistingServer();
    await resources[1].close();
    await resources[2].close();
    await server.close();
  `), []);
});

test('rejects cleanup through constant numeric array index aliases', () => {
  const violations = findUnsafeBrowserCleanup(`
    const BROWSER_INDEX = 0;
    const SERVER_INDEX = 1;
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const resources = [browser, server];
    await resources[BROWSER_INDEX].close();
    await resources[SERVER_INDEX].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[1]');
});

test('rejects assigned resources through constant numeric array index aliases', () => {
  const violations = findUnsafeBrowserCleanup(`
    const SERVER_INDEX = 0;
    const BROWSER_INDEX = 1;
    const resources = [];
    resources[SERVER_INDEX] = await createServer();
    resources[BROWSER_INDEX] = await launch();
    await resources[BROWSER_INDEX].close();
    await resources[SERVER_INDEX].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[1]');
  assert.equal(violations[0].server, 'resources[0]');
});

test('does not resolve reassigned or non-numeric array index aliases', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const resources = [browser, server];
    const BROWSER_INDEX = 0;
    BROWSER_INDEX = 1;
    const SERVER_INDEX = '1';
    await resources[BROWSER_INDEX].close();
    await resources[SERVER_INDEX].close();
  `), []);
});

test('accepts unrelated page elements through constant numeric index aliases', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const PAGE_INDEX = 0;
    const { server } = await startViteTestServer();
    const page = await existingBrowser.newPage();
    const resources = [page];
    await resources[PAGE_INDEX].close();
    await server.close();
  `), []);
});

test('resolves a shadowed numeric index alias only inside its block', () => {
  const violations = findUnsafeBrowserCleanup(`
    const RESOURCE_INDEX = 0;
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const resources = [browser, server];
    {
      const RESOURCE_INDEX = 1;
      await resources[RESOURCE_INDEX].close();
    }
    await resources[RESOURCE_INDEX].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[1]');
});

test('a shadowed numeric index alias does not change later resource paths', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const RESOURCE_INDEX = 0;
    const { server } = await startViteTestServer();
    const page = await existingBrowser.newPage();
    const resources = [page, server];
    {
      const RESOURCE_INDEX = 1;
      await resources[RESOURCE_INDEX].close();
    }
    await resources[RESOURCE_INDEX].close();
  `), []);
});

test('duplicate numeric index aliases in sibling blocks remain independent', () => {
  const violations = findUnsafeBrowserCleanup(`
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const resources = [browser, server];
    {
      const RESOURCE_INDEX = 0;
      await resources[RESOURCE_INDEX].close();
    }
    {
      const RESOURCE_INDEX = 1;
      await resources[RESOURCE_INDEX].close();
    }
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[1]');
});

test('non-numeric and mutable block bindings shadow numeric index aliases', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const RESOURCE_INDEX = 0;
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const resources = [browser, server];
    {
      const RESOURCE_INDEX = getResourceIndex();
      await resources[RESOURCE_INDEX].close();
    }
    {
      let RESOURCE_INDEX = 0;
      await resources[RESOURCE_INDEX].close();
    }
    await resources[1].close();
  `), []);
});

test('a catch binding shadows an outer numeric alias only inside its catch clause', () => {
  const violations = findUnsafeBrowserCleanup(`
    const RESOURCE_INDEX = 0;
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const resources = [browser, server];
    try {
      await performWork();
    } catch (RESOURCE_INDEX) {
      await resources[RESOURCE_INDEX].close();
    }
    await resources[RESOURCE_INDEX].close();
    await resources[1].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[1]');
});

test('a for-loop index alias does not shadow the outer alias after the loop', () => {
  const violations = findUnsafeBrowserCleanup(`
    const RESOURCE_INDEX = 0;
    const { server } = await startViteTestServer();
    const browser = await launchBrowserForServer(server);
    const resources = [browser, server];
    for (const RESOURCE_INDEX = 1; shouldClose(); stop()) {
      await resources[RESOURCE_INDEX].close();
    }
    await resources[RESOURCE_INDEX].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[1]');
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

test('tracks resource indexes after fixed inline spreads in array literals', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [await existingBrowser.newPage(), ...[browser], server];
    await resources[1].close();
    await resources[2].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[1]');
  assert.equal(violations[0].server, 'resources[2]');
});

test('tracks resource indexes inside known-length spreads in array literals', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const owned = [browser, server];
    const resources = [await existingBrowser.newPage(), ...owned];
    await resources[1].close();
    await resources[2].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[1]');
  assert.equal(violations[0].server, 'resources[2]');
});

for (const [construction, buildResources] of [
  ['array literals', spread => `const resources = [await existingBrowser.newPage(), ...${spread}];`],
  ['push calls', spread => `const resources = [await existingBrowser.newPage()]; resources.push(...${spread});`],
]) {
  for (const [wrapper, spread] of [
    ['parenthesized inline arrays', '([browser, server])'],
    ['asserted inline arrays', '([browser, server] as const)'],
    ['asserted known-length arrays', '(owned as readonly [typeof browser, typeof server])'],
  ]) {
    test(`preserves browser and server indexes for ${wrapper} in ${construction}`, () => {
      const violations = findUnsafeBrowserCleanup(`
        const server = await createServer();
        const browser = await launch();
        const owned = [browser, server];
        ${buildResources(spread)}
        await resources[1].close();
        await resources[2].close();
      `);

      assert.equal(violations.length, 1);
      assert.equal(violations[0].browser, 'resources[1]');
      assert.equal(violations[0].server, 'resources[2]');
    });
  }

  for (const [wrapper, spread] of [
    ['parenthesized', '(getResources())'],
    ['asserted', '(getResources() as unknown[])'],
  ]) {
    test(`keeps ${wrapper} unknown-length spreads conservative in ${construction}`, () => {
      assert.deepEqual(findUnsafeBrowserCleanup(`
        const server = await createServer();
        const browser = await launch();
        ${buildResources(spread)}
        await resources[1].close();
        await resources[2].close();
      `), []);
    });
  }
}

test('tracks resource indexes through self-spread array reassignment', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    let resources = [browser, server];
    resources = [...resources];
    await resources[0].close();
    await resources[1].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[1]');
});

test('offsets resource indexes through self-spread array reassignment', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    let resources = [browser, server];
    resources = [await existingBrowser.newPage(), ...resources];
    await resources[1].close();
    await resources[2].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[1]');
  assert.equal(violations[0].server, 'resources[2]');
});

test('keeps unknown-length array-literal spreads conservative', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [browser, ...getResources(), server];
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('accepts page-only entries in fixed array-literal spreads', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const server = await createServer();
    const pages = [await existingBrowser.newPage()];
    const resources = [...pages];
    await resources[0].close();
    await server.close();
  `), []);
});

for (const [construction, buildResources] of [
  ['array literals', 'const resources = [...[, ...owned]];'],
  ['push calls', 'const resources = []; resources.push(...[, ...owned]);'],
]) {
  test(`preserves omitted and nested known-length spread indexes in ${construction}`, () => {
    const violations = findUnsafeBrowserCleanup(`
      const server = await createServer();
      const browser = await launch();
      const owned = [browser, server];
      ${buildResources}
      await resources[1].close();
      await resources[2].close();
    `);

    assert.equal(violations.length, 1);
    assert.equal(violations[0].browser, 'resources[1]');
    assert.equal(violations[0].server, 'resources[2]');
  });
}

test('rejects cleanup through resources appended to arrays', () => {
  const violations = findUnsafeBrowserCleanup(`
    const resources = [];
    const server = await createServer();
    const browser = await launch();
    resources.push(server);
    resources.push(browser);
    await resources[0].close();
    await resources[1].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[1]');
  assert.equal(violations[0].server, 'resources[0]');
});

test('tracks stable indexes for multiple appended resources', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [await existingBrowser.newPage()];
    resources.push(browser, server);
    await resources[1].close();
    await resources[2].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[1]');
  assert.equal(violations[0].server, 'resources[2]');
});

test('tracks stable indexes for resources appended through inline array spreads', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [await existingBrowser.newPage()];
    resources.push(...[browser, server]);
    await resources[1].close();
    await resources[2].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[1]');
  assert.equal(violations[0].server, 'resources[2]');
});

test('tracks stable indexes through nested inline array spreads', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [];
    resources.push(...[...[browser], server]);
    await resources[0].close();
    await resources[1].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[1]');
});

test('tracks stable indexes for resources appended through known-length array spreads', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const appended = [browser, server];
    const resources = [];
    resources.push(...appended);
    await resources[0].close();
    await resources[1].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[1]');
});

test('preserves original and appended ownership when an array pushes its own contents', () => {
  for (const [browserIndex, serverIndex] of [[0, 1], [2, 3]]) {
    const violations = findUnsafeBrowserCleanup(`
      const server = await createServer();
      const browser = await launch();
      const resources = [browser, server];
      resources.push(...resources);
      await resources[${browserIndex}].close();
      await resources[${serverIndex}].close();
    `);

    assert.equal(violations.length, 1, `indexes ${browserIndex}, ${serverIndex}`);
    assert.equal(violations[0].browser, `resources[${browserIndex}]`);
    assert.equal(violations[0].server, `resources[${serverIndex}]`);
  }
});

test('keeps unknown-length push spreads conservative', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [];
    resources.push(...getResources(), browser, server);
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('accepts page-only entries appended through array spreads', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const server = await createServer();
    const resources = [];
    resources.push(...[await existingBrowser.newPage()]);
    await resources[0].close();
    await server.close();
  `), []);
});

test('rejects cleanup through resources shifted by unshift', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [browser, server];
    resources.unshift(await existingBrowser.newPage());
    await resources[1].close();
    await resources[2].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[1]');
  assert.equal(violations[0].server, 'resources[2]');
});

test('rejects cleanup through resources shifted by shift', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [await existingBrowser.newPage(), browser, server];
    resources.shift();
    await resources[0].close();
    await resources[1].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[1]');
});

test('tracks shifted resources through a static bracket method', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [await existingBrowser.newPage(), browser, server];
    resources['shift']();
    await resources[0].close();
    await resources[1].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[1]');
});

test('rejects cleanup through resources shifted by splice', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [await existingBrowser.newPage(), browser, server];
    resources.splice(0, 1, await existingBrowser.newPage(), await existingBrowser.newPage());
    await resources[2].close();
    await resources[3].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[2]');
  assert.equal(violations[0].server, 'resources[3]');
});

test('preserves cleanup ownership when splice has no arguments', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [browser, server];
    resources.splice();
    await resources[0].close();
    await resources[1].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[1]');
});

test('clears tracked ownership after an unknown splice shift', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [browser, server];
    resources.splice(dynamicStart, 1);
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('rejects cleanup through browser and server resources reordered by reverse', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [browser, await existingBrowser.newPage(), server];
    resources.reverse();
    await resources[0].close();
    await resources[2].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[2]');
  assert.equal(violations[0].server, 'resources[0]');
});

test('clears indexed ownership after sort reorders resources unpredictably', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [browser, server];
    resources.sort(compareResources);
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('rejects cleanup through nested resource paths copied by copyWithin', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [
      { connection: await existingBrowser.newPage() },
      { connection: browser },
      { connection: server },
      { connection: await existingBrowser.newPage() },
    ];
    resources.copyWithin(0, 1, 3);
    await resources[0].connection.close();
    await resources[1].connection.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0].connection');
  assert.equal(violations[0].server, 'resources[1].connection');
});

test('clears ownership after copyWithin uses dynamic indexes', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [await existingBrowser.newPage(), browser, server];
    resources.copyWithin(dynamicTarget, 1);
    await resources[1].close();
    await resources[2].close();
  `), []);
});

test('does not copy ownership from an unrelated same-length array path', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [
      await existingBrowser.newPage(),
      await existingBrowser.newPage(),
    ];
    const something = [browser, server];
    resources.copyWithin(0, 1);
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('replaces browser and server ownership only inside a static fill range', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [browser, server, browser];
    resources.fill(await existingBrowser.newPage(), 1, 2);
    await resources[0].close();
    await resources[2].close();
  `);

  assert.equal(violations.length, 0);
});

test('replaces only the selected ownership range through a static bracket fill', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [browser, server, server];
    resources['fill'](await existingBrowser.newPage(), 1, 2);
    await resources[0].close();
    await resources[1].close();
    await resources[2].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[2]');
});

test('recognizes a stable string alias for a bracket mutation method', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [browser, server];
    const method = 'fill';
    resources[method](browser, 1);
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('recognizes a plain template-literal bracket mutation method', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [browser, server];
    resources[\`fill\`](browser, 1);
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('does not retain stale array ownership for a dynamic bracket method', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [browser, server];
    resources[method](browser, 1);
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('tracks browser ownership copied over server entries by fill', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [browser, server];
    resources.fill(browser, 1);
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('normalizes negative fill bounds without clearing unaffected ownership', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [browser, await existingBrowser.newPage(), server];
    resources.fill(await existingBrowser.newPage(), -2, -1);
    await resources[0].close();
    await resources[2].close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0]');
  assert.equal(violations[0].server, 'resources[2]');
});

test('clears array ownership conservatively when fill bounds are dynamic', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [browser, server];
    resources.fill(await existingBrowser.newPage(), dynamicStart);
    await resources[0].close();
    await resources[1].close();
  `), []);
});

test('copies nested resource ownership through fill before replacing its source index', () => {
  const violations = findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [
      { connection: browser },
      { connection: server },
    ];
    resources.fill(resources[0]);
    await resources[0].connection.close();
    await resources[1].connection.close();
    await server.close();
  `);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].browser, 'resources[0].connection');
  assert.equal(violations[0].server, 'server');
});

test('accepts page-only and reassigned entries after array shifts', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    const resources = [browser, server];
    resources.unshift(await existingBrowser.newPage());
    resources[1] = await existingBrowser.newPage();
    await resources[0].close();
    await resources[1].close();
    await resources[2].close();
  `), []);
});

test('accepts page-only entries appended to arrays', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const server = await createServer();
    const resources = [];
    resources.push(await existingBrowser.newPage());
    await resources[0].close();
    await server.close();
  `), []);
});

test('clears appended ownership when an array is reset', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    let resources = [];
    resources.push(browser);
    resources = [];
    resources.push(await existingBrowser.newPage());
    await resources[0].close();
    await server.close();
  `), []);
});

test('clears appended ownership when an array is reassigned', () => {
  assert.deepEqual(findUnsafeBrowserCleanup(`
    const server = await createServer();
    const browser = await launch();
    let resources = [];
    resources.push(browser);
    resources = getPageResources();
    await resources[0].close();
    await server.close();
  `), []);
});

test('current browser fixtures use safe cleanup', () => {
  assert.deepEqual(checkBrowserCleanupFiles(), []);
});
