import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('released pack library has a protected entitlement boundary and locked visitor path', async () => {
  const source = await readFile(new URL('../src/components/ReleasedPackLibrary/ReleasedPackLibrary.tsx', import.meta.url), 'utf8');
  assert.match(source, /hasCollectorCapability\(status\)/);
  assert.ok(source.includes("fetch('/.netlify/functions/actor-pack-depth'"));
  assert.match(source, /if \(!entitled\)/);
  assert.match(source, /Email sign-in link/);
  assert.match(source, /Become a Fandom Collector/);
});

test('released pack navigation preserves actor and vibe selection from daily drop', async () => {
  const [app, routes] = await Promise.all([
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/utils/fandomRoutes.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /view=released&actorId=/);
  assert.match(app, /vibeIdx=/);
  assert.match(app, /value !== null && value !== ''/);
  assert.match(app, /<ReleasedPackLibrary/);
  assert.match(routes, /if \(view === 'released'\) return 'released'/);
});

test('only today’s homepage exposes the current released Vibe Pack for free', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /id="todays-released-pack"/);
  assert.match(app, /Free today · Star of the Day released Vibe Pack/);
  assert.match(app, /rawData && !selectedEditionDate/);
  assert.match(app, /href="#todays-released-pack"/);
  assert.match(app, /The full released-pack library stays available to Fandom Collectors/);
});