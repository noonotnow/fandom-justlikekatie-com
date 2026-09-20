import { existsSync } from 'node:fs';
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
  type Page,
} from '@playwright/test';
import type { ViteDevServer } from 'vite';

export const BROWSER_ENGINES = [
  { name: 'Chromium', type: chromium },
  { name: 'Firefox', type: firefox },
  { name: 'WebKit', type: webkit },
] as const;

export async function launchBrowser(browserType: BrowserType = chromium): Promise<Browser> {
  try {
    return await browserType.launch();
  } catch (defaultLaunchError) {
    if (browserType !== chromium) throw defaultLaunchError;
    const executablePath = process.env.PATH
      ?.split(':')
      .map(directory => `${directory}/chromium`)
      .find(existsSync);
    if (!executablePath) throw defaultLaunchError;
    return chromium.launch({ executablePath, args: ['--no-sandbox'] });
  }
}

export async function launchBrowserForServer(
  server: Pick<ViteDevServer, 'close'>,
  browserType: BrowserType = chromium,
): Promise<Browser> {
  try {
    return await launchBrowser(browserType);
  } catch (launchError) {
    try {
      await server.close();
    } catch (closeError) {
      throw new AggregateError(
        [launchError, closeError],
        'The browser failed to launch and the browser test server failed to close.',
      );
    }
    throw launchError;
  }
}

export async function launchBrowserWithServer<
  ServerResult extends { server: Pick<ViteDevServer, 'close'> },
>(
  serverResultPromise: Promise<ServerResult>,
  browserType: BrowserType = chromium,
): Promise<[ServerResult, Browser]> {
  const [serverResult, browserResult] = await Promise.allSettled([
    serverResultPromise,
    launchBrowser(browserType),
  ]);

  if (serverResult.status === 'fulfilled' && browserResult.status === 'fulfilled') {
    return [serverResult.value, browserResult.value];
  }

  const startupErrors: unknown[] = [];
  if (serverResult.status === 'rejected') startupErrors.push(serverResult.reason);
  if (browserResult.status === 'rejected') startupErrors.push(browserResult.reason);

  const cleanupResults = await Promise.allSettled([
    serverResult.status === 'fulfilled' ? serverResult.value.server.close() : Promise.resolve(),
    browserResult.status === 'fulfilled' ? browserResult.value.close() : Promise.resolve(),
  ]);
  for (const cleanupResult of cleanupResults) {
    if (cleanupResult.status === 'rejected') startupErrors.push(cleanupResult.reason);
  }

  if (startupErrors.length === 1) throw startupErrors[0];
  throw new AggregateError(
    startupErrors,
    'The browser test server and browser did not start together cleanly.',
  );
}

export async function closeBrowserAndServer(
  browser: Pick<Browser, 'close'>,
  server: Pick<ViteDevServer, 'close'>,
): Promise<void> {
  const results = await Promise.allSettled([
    browser.close(),
    server.close(),
  ]);
  const errors = results.flatMap(result => (
    result.status === 'rejected' ? [result.reason] : []
  ));
  if (errors.length > 0) {
    throw new AggregateError(errors, 'The browser test resources failed to close.');
  }
}

export async function launchPageForServer(
  server: Pick<ViteDevServer, 'close'>,
  browserType: BrowserType = chromium,
): Promise<{ browser: Browser; page: Page }> {
  const browser = await launchBrowserForServer(server, browserType);
  try {
    return { browser, page: await browser.newPage() };
  } catch (pageError) {
    try {
      await closeBrowserAndServer(browser, server);
    } catch (closeError) {
      throw new AggregateError(
        [pageError, closeError],
        'The browser page failed to open and the browser test resources failed to close.',
      );
    }
    throw pageError;
  }
}
