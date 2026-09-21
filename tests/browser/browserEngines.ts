import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
  type Page,
} from '@playwright/test';
import {
  createServer,
  type InlineConfig,
  type ViteDevServer,
} from 'vite';

export const BROWSER_ENGINES = [
  { id: 'chromium', name: 'Chromium', type: chromium },
  { id: 'firefox', name: 'Firefox', type: firefox },
  { id: 'webkit', name: 'WebKit', type: webkit },
] as const;

export type BrowserEngine = (typeof BROWSER_ENGINES)[number];

const isReplitNix = Boolean(process.env.REPLIT_PID2);
if (isReplitNix) {
  // Playwright checks dlopen-only libraries through ldconfig, which cannot see
  // libraries supplied from the Nix store. A real launch probe still runs.
  process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS ??= '1';
}

export function replitNixLibraryPath(
  runtimePath = process.env.REPLIT_LD_LIBRARY_PATH,
  pathExists: (path: string) => boolean = existsSync,
): string {
  const declaredRuntimeDirectories = runtimePath?.split(':').filter(Boolean) ?? [];
  const requiredRuntimeFiles = [
    {
      name: 'gst_all_1.gst-libav',
      matches: declaredRuntimeDirectories.some(directory => (
        pathExists(join(directory, 'gstreamer-1.0', 'libgstlibav.so'))
      )),
    },
    {
      name: 'libjpeg8',
      matches: declaredRuntimeDirectories.some(directory => (
        pathExists(join(directory, 'libjpeg.so.8'))
      )),
    },
  ];
  const missingPackages = requiredRuntimeFiles
    .filter(requirement => !requirement.matches)
    .map(requirement => requirement.name);
  if (missingPackages.length > 0) {
    throw new Error(
      `Missing declared WebKit runtime paths for: ${missingPackages.join(', ')}. `
      + 'Ensure .replit declares these Nix packages, then reload the Replit environment.',
    );
  }

  const nixLibraryDirectories = [...(process.env.NIX_LDFLAGS?.matchAll(/(?:^|\s)-L(\S+)/g) ?? [])]
    .flatMap(match => [match[1], join(match[1], 'gstreamer-1.0')])
    .filter(pathExists);
  const compilerLibraryDirectory = dirname(
    execFileSync('gcc', ['-print-file-name=libatomic.so.1'], { encoding: 'utf8' }).trim(),
  );
  return [
    ...nixLibraryDirectories,
    compilerLibraryDirectory,
    ...declaredRuntimeDirectories,
    process.env.LD_LIBRARY_PATH,
  ]
    .filter((path): path is string => Boolean(path))
    .join(':');
}

export function missingBrowserEngines(
  engines: readonly BrowserEngine[] = BROWSER_ENGINES,
  executableExists: (path: string) => boolean = existsSync,
): BrowserEngine[] {
  return engines.filter(engine => !executableExists(engine.type.executablePath()));
}

export function assertBrowserEnginesInstalled(
  engines: readonly BrowserEngine[] = BROWSER_ENGINES,
  executableExists: (path: string) => boolean = existsSync,
): void {
  const missing = missingBrowserEngines(engines, executableExists);
  if (missing.length === 0) return;

  throw new Error(
    `Missing Playwright browser binaries: ${missing.map(engine => engine.name).join(', ')}. `
    + 'Run "npm run browser:install" before running browser tests.',
  );
}

export async function assertBrowserEnginesLaunchable(
  engines: readonly BrowserEngine[] = BROWSER_ENGINES,
  launch: (engine: BrowserEngine) => Promise<Browser> = engine => launchBrowser(engine.type),
): Promise<void> {
  const failures: Array<{ engine: BrowserEngine; error: unknown }> = [];

  for (const engine of engines) {
    let browser: Browser | undefined;
    try {
      browser = await launch(engine);
      const page = await browser.newPage();
      await page.setContent(`<main data-browser-engine="${engine.id}">${engine.name}</main>`);
      const renderedEngine = await page.locator('[data-browser-engine]').textContent();
      if (renderedEngine !== engine.name) {
        throw new Error(
          `page operation returned ${JSON.stringify(renderedEngine)} instead of ${JSON.stringify(engine.name)}`,
        );
      }
    } catch (error) {
      failures.push({ engine, error });
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (error) {
          failures.push({
            engine,
            error: new Error(`browser cleanup failed: ${String(error)}`),
          });
        }
      }
    }
  }

  if (failures.length === 0) return;

  const details = failures
    .map(({ engine, error }) => `${engine.name}: ${String(error)}`)
    .join('\n\n');
  throw new Error(
    `Playwright browser smoke check failed: ${
      failures.map(({ engine }) => engine.name).join(', ')
    }.\n`
    + 'In Replit, ensure .replit declares the required native browser libraries, then reload the environment. '
    + 'In CI or Debian/Ubuntu, run "npm run browser:install:ci".\n\n'
    + details,
  );
}

export async function startViteTestServer(
  config: InlineConfig = {
    configFile: 'vite.config.ts',
    server: { host: '127.0.0.1', port: 5000, strictPort: false },
  },
  createTestServer: (config: InlineConfig) => Promise<ViteDevServer> = createServer,
): Promise<{ server: ViteDevServer; origin: string }> {
  const server = await createTestServer(config);
  try {
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') {
      throw new Error('The browser test server did not expose a TCP port.');
    }
    return { server, origin: `http://127.0.0.1:${address.port}` };
  } catch (startError) {
    try {
      await server.close();
    } catch (closeError) {
      throw new AggregateError(
        [startError, closeError],
        'The browser test server failed to start and failed to close.',
      );
    }
    throw startError;
  }
}

export async function launchBrowser(browserType: BrowserType = chromium): Promise<Browser> {
  if (isReplitNix && browserType === webkit) {
    const webkitRoot = dirname(browserType.executablePath());
    const miniBrowserRoot = join(webkitRoot, 'minibrowser-wpe');
    return browserType.launch({
      executablePath: join(miniBrowserRoot, 'bin', 'MiniBrowser'),
      env: {
        ...process.env,
        LD_LIBRARY_PATH: [
          join(miniBrowserRoot, 'lib'),
          join(miniBrowserRoot, 'sys', 'lib'),
          replitNixLibraryPath(),
        ].join(':'),
        WEBKIT_EXEC_PATH: join(miniBrowserRoot, 'bin'),
        WEBKIT_INJECTED_BUNDLE_PATH: join(miniBrowserRoot, 'lib'),
        WEBKIT_INSPECTOR_RESOURCES_PATH: join(miniBrowserRoot, 'share'),
      },
    });
  }

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
