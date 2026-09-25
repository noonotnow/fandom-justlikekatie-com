import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
  assertBrowserEnginesInstalled,
  assertBrowserEnginesLaunchable,
  BROWSER_ENGINES,
} from '../tests/browser/browserEngines.ts';

const mode = process.argv[2];
const require = createRequire(import.meta.url);
const playwrightCli = join(dirname(require.resolve('playwright')), 'cli.js');

if (mode === '--install' || mode === '--install-with-deps') {
  const result = spawnSync(
    process.execPath,
    [
      playwrightCli,
      'install',
      ...(mode === '--install-with-deps' ? ['--with-deps'] : []),
      ...BROWSER_ENGINES.map(engine => engine.id),
    ],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
} else if (mode !== '--check') {
  throw new Error(
    'Usage: setup-browser-engines.ts --install|--install-with-deps|--check',
  );
}

assertBrowserEnginesInstalled();
await assertBrowserEnginesLaunchable();
console.log(
  `Playwright browser engine smoke check passed: ${
    BROWSER_ENGINES.map(engine => engine.name).join(', ')
  }`,
);