import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDraft, type ForgeDraft } from '../src/utils/cdramaForge.ts';
import { buildMemeSendBody, draftSignature, newMemeState, intentFor, loadSendState, newIntent, saveSendState, sendMemeToCreate } from '../src/utils/memeSend.ts';

const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
const draft = (): ForgeDraft => ({
  ...emptyDraft(), ideas: [{ setup: 'S', punchline: 'P', visualDirection: 'V', searchQuery: 'q' }],
  still: { kind: 'search', title: 'T', thumbnail: 'data:x', link: 'https://example.com/a', source: 'Pub', query: 'q' },
  copy: { hook: 'H', tiktok: 'tt caption', instagram: 'ig caption', hashtags: '#a' },
});

test('retry reuses the intent; Create another mints a new one for the same meme', () => {
  const s = store();
  let state = loadSendState(s);
  const first = intentFor(state, 'tiktok'); state = first.state; saveSendState(s, state);
  const retry = intentFor(loadSendState(s), 'tiktok');
  assert.equal(retry.intent.id, first.intent.id);
  const another = intentFor(newIntent(state, 'tiktok'), 'tiktok');
  assert.notEqual(another.intent.id, first.intent.id);
  assert.equal(another.state.memeGroupId, state.memeGroupId);
});

test('body carries caption for the chosen platform, source and no rights claim', () => {
  const state = loadSendState(store());
  const body = buildMemeSendBody(draft(), state, 'send-1', 'AAAA') as Record<string, unknown>;
  assert.equal(body.caption, 'tt caption');
  assert.equal(body.format, 'tiktok-9x16');
  assert.equal((body.stillSource as { link: string }).link, 'https://example.com/a');
  assert.ok(!('rights' in body));
  const ig = buildMemeSendBody({ ...draft(), format: 'instagram' }, state, 'send-1', 'AAAA') as Record<string, unknown>;
  assert.equal(ig.caption, 'ig caption');
  assert.equal(ig.format, 'instagram-4x5');
});

test('send errors never hide that a retry is safe', async () => {
  await assert.rejects(sendMemeToCreate({}, (async () => { throw new Error('net'); }) as unknown as typeof fetch), /will not create a duplicate/);
  await assert.rejects(sendMemeToCreate({}, (async () => Response.json({ error: 'An admin account is required to send to CREATE.' }, { status: 403 })) as unknown as typeof fetch), /admin account/);
});

test('an untouched suggested caption is what gets sent, and counts for the changed-since-send signature', () => {
  const untouched = { ...draft(), copy: null };
  const suggested = { hook: 'Suggested hook', tiktok: 'suggested tiktok', instagram: 'suggested ig', hashtags: '#s' };
  assert.throws(() => buildMemeSendBody(untouched, loadSendState(store()), 'send-1', 'AAAA'), /post copy/);
  const body = buildMemeSendBody(untouched, loadSendState(store()), 'send-1', 'AAAA', suggested) as Record<string, unknown>;
  assert.equal(body.caption, 'suggested tiktok');
  assert.equal(body.hashtags, '#s');
  assert.notEqual(draftSignature(untouched, suggested), draftSignature(untouched, { ...suggested, tiktok: 'edited' }));
});

test('a new meme gets a new identity; a failed save or retry does not', () => {
  const s = store();
  const state = loadSendState(s);
  const { state: withIntent, intent } = intentFor(state, 'tiktok');
  saveSendState(s, withIntent);
  // autosave failing never touches send state: reloading still yields the same meme and intent
  assert.equal(loadSendState(s).memeGroupId, state.memeGroupId);
  assert.equal(intentFor(loadSendState(s), 'tiktok').intent.id, intent.id);
  const fresh = newMemeState();
  assert.notEqual(fresh.memeGroupId, state.memeGroupId);
  assert.deepEqual(fresh.intents, {});
});

test('a rejected send shows CREATE\'s error code in the message the operator sees, and ignores malformed codes', async () => {
  const rejected = (body: unknown, status = 502) => (async () => Response.json(body, { status })) as unknown as typeof fetch;
  await assert.rejects(sendMemeToCreate({}, rejected({ error: 'CREATE rejected the draft (HTTP 400): meme.hook must not be empty.', code: 'FANDOM_PROJECT_VALIDATION_ERROR' })), /meme\.hook must not be empty\. \[FANDOM_PROJECT_VALIDATION_ERROR\]$/);
  await assert.rejects(sendMemeToCreate({}, rejected({ error: 'CREATE rejected the draft (HTTP 503).', code: '<b>x</b>' })), (e: Error) => e.message === 'CREATE rejected the draft (HTTP 503).');
  await assert.rejects(sendMemeToCreate({}, rejected({ error: 'Nope' }, 403)), (e: Error) => e.message === 'Nope');
});
