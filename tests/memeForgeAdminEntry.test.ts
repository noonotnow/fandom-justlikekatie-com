import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath: string) => readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('Vibe Atlas keeps MemeForge out of its product navigation', () => {
  const appSource = readSource('src/App.tsx');
  const entryIndex = appSource.indexOf('className="memeforge-workbench-link"');

  assert.equal(entryIndex, -1, 'Vibe Atlas must not render a MemeForge workbench link');
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