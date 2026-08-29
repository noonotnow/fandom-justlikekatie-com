import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath: string) => readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('Vibe Atlas has a public, direct MemeForge entry point', () => {
  const appSource = readSource('src/App.tsx');
  const entryIndex = appSource.indexOf('className="memeforge-workbench-link"');

  assert.notEqual(entryIndex, -1, 'Vibe Atlas must render a MemeForge workbench link');
  const entry = appSource.slice(Math.max(0, entryIndex - 250), entryIndex + 350);
  assert.ok(!entry.includes('isAdmin &&'), 'the MemeForge entry must be publicly discoverable');
  assert.ok(entry.includes('href="/memeforge/middle-earth"'), 'the entry must go directly to the Middle-earth route');
  assert.ok(
    entry.includes('Reaction studio'),
    'the entry must describe MemeForge in public product language',
  );
});

test('MemeForge discovery and workspace copy avoid private workflow architecture', () => {
  const launchpadSource = readSource('src/components/FandomLaunchpad/FandomLaunchpad.tsx');
  const workspaceSource = readSource('src/components/MiddleEarthWorkspace/MiddleEarthWorkspace.tsx');

  assert.ok(
    launchpadSource.includes('forge a Middle-earth reaction artifact worth sending'),
    'the launchpad must describe the public MemeForge outcome',
  );
  assert.ok(
    workspaceSource.includes('with its own reaction-card craft'),
    'the workspace must reinforce its distinct public product after navigation',
  );
  assert.ok(!launchpadSource.includes('CREATE'), 'launchpad copy must not expose CREATE');
  assert.ok(!workspaceSource.includes('Sign in through packet staging'), 'public MemeForge must not advertise packet staging');
});