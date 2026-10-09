import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(([, attrs]) => !/\bsrc\s*=|\btype\s*=/.test(attrs))
  .map(([, , body]) => body);

function bootstrap(url) {
  const loads = [];
  const location = new URL(url);
  const window = { location, history: { state: null, replaceState(state, unused, path) {
    this.state = state;
    window.location = new URL(path, window.location.origin);
  } } };
  const context = vm.createContext({ window, URLSearchParams, Date,
    document: {
      head: { appendChild(tag) { loads.push(tag.src); } },
      createElement() { return {}; },
      getElementsByTagName() { return [{ parentNode: { insertBefore(tag) { loads.push(tag.src); } } }]; },
      documentElement: { classList: { remove() {} } },
    },
    localStorage: { getItem() { return null; } },
  });
  for (const script of scripts) vm.runInContext(script, context);
  vm.runInContext("gtag('event', 'guard_test', { safe: true });", context);
  return { window, loads, entries: JSON.parse(JSON.stringify((window.dataLayer || []).map(value =>
    value && typeof value === 'object' && 'length' in value ? Array.from(value) : value))) };
}

for (const host of ['localhost', '127.0.0.1', '[::1]', 'earnest-gecko-17eb0c.netlify.app',
  'main--earnest-gecko-17eb0c.netlify.app', 'deploy-preview-182--earnest-gecko-17eb0c.netlify.app',
  '6ac053a1f800e64b68e905d0--earnest-gecko-17eb0c.netlify.app', 'fandom.justlikekatie.com.evil.example']) {
  test(`no Google tracking on ${host}`, () => {
    const result = bootstrap(`https://${host}/vibe-atlas?view=released`);
    assert.equal(result.window.__analyticsProductionHost, false);
    assert.deepEqual(result.loads, []);
    assert.deepEqual(result.entries, []);
  });
}

test('production retains one GA4 config, one GTM loader and event delivery', () => {
  const result = bootstrap('https://fandom.justlikekatie.com/vibe-atlas');
  assert.equal(result.window.__analyticsProductionHost, true);
  assert.equal(result.loads.filter(src => src.includes('/gtag/js?id=G-FHZJ1T74TG')).length, 1);
  assert.equal(result.loads.filter(src => src.includes('/gtm.js?id=GTM-5T5P2C9S')).length, 1);
  assert.equal(result.entries.filter(value => value[0] === 'config').length, 1);
  assert.equal(result.entries.filter(value => value[0] === 'event' && value[1] === 'guard_test').length, 1);
});

test('production still sanitizes veteran capability before tracking', () => {
  const result = bootstrap('https://fandom.justlikekatie.com/vibe-atlas/veteran-journal?journal=PrivateGuardSentinel&source=private');
  assert.equal(result.window.location.href, 'https://fandom.justlikekatie.com/vibe-atlas/veteran-journal');
  assert.equal(result.window.history.state.veteranJournalId, 'PrivateGuardSentinel');
  assert.ok(!JSON.stringify(result.entries).includes('PrivateGuardSentinel'));
  assert.deepEqual(result.entries.find(value => value[0] === 'config'), [
    'config', 'G-FHZJ1T74TG', { page_location: 'https://fandom.justlikekatie.com/vibe-atlas/veteran-journal' },
  ]);
});

test('no unconditional tracking iframe or external script survives on preview HTML', () => {
  assert.doesNotMatch(html, /<iframe[^>]+googletagmanager/);
  assert.doesNotMatch(html, /<script[^>]+src=["']https:\/\/www\.googletagmanager/);
});
