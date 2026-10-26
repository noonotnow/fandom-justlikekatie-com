import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const gateSource = readFileSync(new URL('../public/audience-gate.js', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(([, attrs]) => !/\btype\s*=/.test(attrs))
  .map(([, attrs, body]) => (/src="\/audience-gate\.js"/.test(attrs) ? gateSource : body))
  .filter(body => !/\bsrc\s*=/.test(body) || body.length > 40);

const flush = () => new Promise(resolve => setTimeout(resolve, 5));
const sessionResponse = (user, init = {}) => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  headers: { get: () => (init.contentType ?? 'application/json; charset=utf-8') },
  json: async () => {
    if (init.jsonError) throw new Error('invalid JSON');
    return init.body ?? { user };
  },
});

// `session` is a user object / null, or an Error / { ok: false } to simulate a failed lookup.
function bootstrap(url, session = null) {
  const loads = [];
  const fetches = [];
  const location = new URL(url);
  const listeners = {};
  const window = {
    location,
    setTimeout, clearTimeout,
    history: { state: null, replaceState(state, unused, path) {
      this.state = state;
      window.location = new URL(path, window.location.origin);
    } },
    fetch(target, options) {
      fetches.push({ target, options });
      if (session instanceof Error) return Promise.reject(session);
      if (session && session.__failed) return Promise.resolve(sessionResponse(null, session));
      if (session && session.__body) return Promise.resolve(sessionResponse(null, session));
      return Promise.resolve(sessionResponse(session));
    },
  };
  const context = vm.createContext({ window, URLSearchParams, Date, Promise,
    document: {
      visibilityState: 'visible',
      addEventListener(name, fn) { listeners[name] = fn; },
      head: { appendChild(tag) { loads.push(tag.src); } },
      createElement() { return {}; },
      getElementsByTagName() { return [{ parentNode: { insertBefore(tag) { loads.push(tag.src); } } }]; },
      documentElement: { classList: { remove() {} } },
    },
    localStorage: { getItem() { return null; } },
  });
  for (const script of scripts) vm.runInContext(script, context);
  const entries = () => JSON.parse(JSON.stringify((window.dataLayer || []).map(value =>
    value && typeof value === 'object' && 'length' in value ? Array.from(value) : value)));
  return { window, loads, fetches, entries, listeners, context };
}

async function production(url, session) {
  const result = bootstrap(url, session);
  vm.runInContext("window.gtag('event', 'guard_test', { safe: true });", result.context);
  await flush();
  return result;
}

for (const host of ['localhost', '127.0.0.1', '[::1]', 'earnest-gecko-17eb0c.netlify.app',
  'main--earnest-gecko-17eb0c.netlify.app', 'deploy-preview-182--earnest-gecko-17eb0c.netlify.app',
  '6ac053a1f800e64b68e905d0--earnest-gecko-17eb0c.netlify.app', 'fandom.justlikekatie.com.evil.example']) {
  test(`no Google tracking on ${host}`, async () => {
    const result = await production(`https://${host}/vibe-atlas?view=released`);
    assert.equal(result.window.__analyticsProductionHost, false);
    assert.deepEqual(result.loads, []);
    assert.deepEqual(result.entries(), []);
    assert.deepEqual(result.fetches, []);
  });
}

test('non-production session changes do not suppress local analytics', () => {
  const result = bootstrap('https://localhost/vibe-atlas');
  result.window.__audienceGate.unknown();
  assert.equal(result.window.__audienceGate.state(), 'public');
  let ran = false;
  result.window.__audienceGate.run(() => { ran = true; });
  assert.equal(ran, true);
});

test('production anonymous visitor retains one GA4 config, one GTM loader and event delivery (positive control)', async () => {
  const result = await production('https://fandom.justlikekatie.com/vibe-atlas', null);
  assert.equal(result.window.__analyticsProductionHost, true);
  assert.equal(result.window.__audienceGate.state(), 'public');
  assert.equal(result.loads.filter(src => src.includes('/gtag/js?id=G-FHZJ1T74TG')).length, 1);
  assert.equal(result.loads.filter(src => src.includes('/gtm.js?id=GTM-5T5P2C9S')).length, 1);
  assert.equal(result.entries().filter(value => value[0] === 'config').length, 1);
  assert.equal(result.entries().filter(value => value[0] === 'event' && value[1] === 'guard_test').length, 1);
  assert.equal(result.window['ga-disable-G-FHZJ1T74TG'], false);
});

test('ordinary signed-in member (including paid) is tracked exactly once', async () => {
  const result = await production('https://fandom.justlikekatie.com/zh-cn/vibe-atlas', { accountId: 'usr_x', email: 'member@example.com', isAdmin: false });
  assert.equal(result.window.__audienceGate.state(), 'public');
  assert.equal(result.entries().filter(value => value[0] === 'config').length, 1);
  assert.equal(result.entries().filter(value => value[1] === 'guard_test').length, 1);
  assert.ok(!JSON.stringify(result.entries()).includes('member@example.com'));
});

test('verified operator never starts or sends audience tracking, including the automatic pageview', async () => {
  for (const path of ['/vibe-atlas', '/zh-cn/vibe-atlas', '/c-drama-fandom/glossary/jianghu/', '/vibe-atlas?admin=true']) {
    const result = await production(`https://fandom.justlikekatie.com${path}`, { accountId: 'usr_o', email: 'owner@example.com', isAdmin: true });
    assert.equal(result.window.__audienceGate.state(), 'operator');
    assert.deepEqual(result.loads, []);
    assert.deepEqual(result.entries(), []);
    assert.equal(result.window['ga-disable-G-FHZJ1T74TG'], true);
    assert.equal(result.fetches[0].target, '/api/auth/session');
    assert.equal(result.fetches[0].options.credentials, 'same-origin');
  }
});

test('nothing is sent before the session classification resolves', () => {
  const result = bootstrap('https://fandom.justlikekatie.com/vibe-atlas', null);
  vm.runInContext("window.gtag('event', 'early', {});", result.context);
  assert.equal(result.window.__audienceGate.state(), 'pending');
  assert.deepEqual(result.loads, []);
  assert.deepEqual(result.entries(), []);
});

test('buffered pre-classification events are dropped for operators and flushed once for public visitors', async () => {
  const operator = bootstrap('https://fandom.justlikekatie.com/vibe-atlas', { isAdmin: true });
  vm.runInContext("window.gtag('event', 'early', {});", operator.context);
  await flush();
  assert.deepEqual(operator.entries(), []);
  const visitor = bootstrap('https://fandom.justlikekatie.com/vibe-atlas', null);
  vm.runInContext("window.gtag('event', 'early', {});", visitor.context);
  await flush();
  assert.equal(visitor.entries().filter(value => value[1] === 'early').length, 1);
});

test('failed or malformed classification is suppressed (fail closed) and does not throw', async () => {
  for (const session of [new Error('offline'), { __failed: true, ok: false, status: 503 },
    { __failed: true, ok: true, contentType: 'text/html' },
    ...[
      {},
      { user: undefined },
      { user: {} },
      { user: [] },
      { user: { isAdmin: 'true' } },
      { user: { isAdmin: null } },
      [],
    ].map(body => ({ __body: true, body })),
    { __body: true, jsonError: true }]) {
    const result = await production('https://fandom.justlikekatie.com/vibe-atlas', session);
    assert.equal(result.window.__audienceGate.state(), 'unknown');
    assert.deepEqual(result.loads, []);
    assert.deepEqual(result.entries(), []);
  }
});

test('direct classification requires an explicit anonymous or boolean operator role', async () => {
  const result = await production('https://fandom.justlikekatie.com/vibe-atlas', null);
  const gate = result.window.__audienceGate;
  const initialLoads = result.loads.length;
  for (const user of [undefined, {}, [], { isAdmin: 'true' }, { isAdmin: null }]) {
    gate.classify(user);
    assert.equal(gate.state(), 'unknown');
    assert.equal(result.loads.length, initialLoads);
  }
  gate.classify({ isAdmin: false });
  assert.equal(gate.state(), 'public');
  gate.classify({ isAdmin: true });
  assert.equal(gate.state(), 'operator');
  gate.classify(null);
  assert.equal(gate.state(), 'public');
});

test('operator sign-in, logout and account switch re-classify; opt-out is never persisted', async () => {
  const result = await production('https://fandom.justlikekatie.com/vibe-atlas', null);
  const gate = result.window.__audienceGate;
  const before = result.entries().length;
  gate.classify({ isAdmin: true });
  vm.runInContext("window.gtag('event', 'operator_event', {});", result.context);
  assert.equal(result.window['ga-disable-G-FHZJ1T74TG'], true);
  assert.equal(result.entries().length, before);
  gate.classify(null);
  vm.runInContext("window.gtag('event', 'after_logout', {});", result.context);
  assert.equal(result.window['ga-disable-G-FHZJ1T74TG'], false);
  assert.equal(result.entries().filter(value => value[1] === 'after_logout').length, 1);
  assert.equal(result.loads.filter(src => src.includes('/gtag/js')).length, 1, 'tags are never loaded twice');
  gate.classify({ isAdmin: false });
  assert.equal(gate.state(), 'public');
  assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(gateSource));
});

test('operator who starts suppressed can be counted publicly only after an explicit logout classification', async () => {
  const result = await production('https://fandom.justlikekatie.com/vibe-atlas', { isAdmin: true });
  assert.deepEqual(result.loads, []);
  result.window.__audienceGate.classify(null);
  assert.equal(result.loads.filter(src => src.includes('/gtag/js')).length, 1);
  assert.equal(result.loads.filter(src => src.includes('/gtm.js')).length, 1);
});

test('visibility return re-checks the session and keeps a verified state on transient failure', async () => {
  const result = await production('https://fandom.justlikekatie.com/vibe-atlas', null);
  assert.equal(result.fetches.length, 1);
  result.window.fetch = () => Promise.reject(new Error('offline'));
  result.listeners.visibilitychange();
  await flush();
  assert.equal(result.window.__audienceGate.state(), 'public');
  result.window.fetch = () => Promise.resolve(sessionResponse({ isAdmin: true }));
  result.listeners.visibilitychange();
  await flush();
  assert.equal(result.window.__audienceGate.state(), 'operator');
});

test('sign-in link pages stay suppressed without fetching and never expose the token fragment', async () => {
  for (const path of ['/auth/verify', '/zh-cn/auth/verify']) {
    const result = await production(`https://fandom.justlikekatie.com${path}#token=SecretTokenSentinel&next=admin`, null);
    assert.equal(result.window.__audienceGate.state(), 'unknown');
    assert.equal(result.window.__audienceGate.verificationInProgress(), true);
    assert.deepEqual(result.fetches, []);
    assert.deepEqual(result.loads, []);
    assert.ok(!JSON.stringify(result.entries()).includes('SecretTokenSentinel'));
    result.window.__audienceGate.classify(null);
    assert.equal(result.window.__audienceGate.state(), 'unknown');
    result.window.__audienceGate.completeVerification({ isAdmin: true });
    assert.equal(result.window.__audienceGate.verificationInProgress(), false);
    assert.equal(result.window.__audienceGate.state(), 'operator');
    assert.ok(!JSON.stringify(result.entries()).includes('SecretTokenSentinel'));
    assert.ok(!JSON.stringify(result.entries()).includes('#token'));
  }
});

test('production still sanitizes veteran capability before tracking', async () => {
  const result = await production('https://fandom.justlikekatie.com/vibe-atlas/veteran-journal?journal=PrivateGuardSentinel&source=private', null);
  assert.equal(result.window.location.href, 'https://fandom.justlikekatie.com/vibe-atlas/veteran-journal');
  assert.equal(result.window.history.state.veteranJournalId, 'PrivateGuardSentinel');
  assert.ok(!JSON.stringify(result.entries()).includes('PrivateGuardSentinel'));
  assert.deepEqual(result.entries().find(value => value[0] === 'config'), [
    'config', 'G-FHZJ1T74TG', { page_location: 'https://fandom.justlikekatie.com/vibe-atlas/veteran-journal' },
  ]);
});

test('static public pages load the shared gate instead of an unconditional Google tag', () => {
  const pages = ['c-drama-fandom/glossary/jianghu/index.html', 'c-drama-fandom/index.html', 'zh-cn/c-drama-fandom/trope-decoder/index.html'];
  for (const page of pages) {
    const body = readFileSync(new URL(`../public/${page}`, import.meta.url), 'utf8');
    assert.match(body, /<script src="\/audience-gate\.js"><\/script>/);
    assert.doesNotMatch(body, /googletagmanager\.com\/gtag\/js/);
    assert.ok(body.indexOf('/audience-gate.js') < body.indexOf('editorial.js') || !body.includes('editorial.js'));
  }
});

test('no unconditional tracking iframe or external script survives on preview HTML', () => {
  assert.doesNotMatch(html, /<iframe[^>]+googletagmanager/);
  assert.doesNotMatch(html, /<script[^>]+src=["']https:\/\/www\.googletagmanager/);
});
