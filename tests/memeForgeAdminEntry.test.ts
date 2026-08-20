import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath: string) => readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('authenticated Vibe Atlas admins have a direct, clearly separate MemeForge entry point', () => {
  const appSource = readSource('src/App.tsx');
  const entryIndex = appSource.indexOf('className="memeforge-workbench-link"');

  assert.notEqual(entryIndex, -1, 'Vibe Atlas must render a MemeForge workbench link');
  const entry = appSource.slice(Math.max(0, entryIndex - 250), entryIndex + 350);
  assert.ok(entry.includes('isAdmin &&'), 'the MemeForge entry must be limited to authenticated admins');
  assert.ok(entry.includes('href="/memeforge/middle-earth"'), 'the entry must go directly to the Middle-earth route');
  assert.ok(
    entry.includes('Separate workbench · not Vibe Atlas or CREATE'),
    'the entry must explain that it does not enter the Vibe Atlas or CREATE flow',
  );
});

test('MemeForge discovery and workspace copy describe it as independent from Vibe Atlas and CREATE', () => {
  const launchpadSource = readSource('src/components/FandomLaunchpad/FandomLaunchpad.tsx');
  const workspaceSource = readSource('src/components/MiddleEarthWorkspace/MiddleEarthWorkspace.tsx');

  assert.ok(
    launchpadSource.includes('independent from Vibe Atlas admin and CREATE'),
    'the launchpad must identify MemeForge as an independent workbench',
  );
  assert.ok(
    workspaceSource.includes('separate from C-drama Vibe Atlas and its CREATE handoff'),
    'the workspace must reinforce its separate flow after navigation',
  );
});