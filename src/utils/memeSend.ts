import type { ForgeDraft } from './cdramaForge.ts';

/**
 * Operator-only "Send to CREATE" state for MemeForge.
 *
 * Identity model: `memeGroupId` names the meme; `sendIntentId` names ONE intended Post.
 * Retrying a send reuses the intent (CREATE replays, never duplicates). "Create another Post"
 * mints a new intent for the same meme, so deliberate duplicates stay possible.
 */
export const MEME_SEND_KEY = 'fandom-cdrama-memeforge-send-v1';
export const MEME_SEND_URL = '/api/workstation-meme-handoff';
export const MEME_SEND_SCHEMA = 'fandom.meme-send.v1';

export type SendBackup = { state: 'verified' | 'missing' | 'mismatch' | 'failed'; detail: string; assetId?: string };
export type SendReceipt = {
  postId: string; postUrl: string; deepLink?: string; status: 'Draft'; sourceVersion: number;
  disposition: 'created' | 'replayed' | 'updated'; mediaSyncState: 'synced' | 'operator-diverged'; warnings: string[];
};
export type SendState = {
  memeGroupId: string;
  intents: Partial<Record<'tiktok' | 'instagram', { id: string; receipt?: SendReceipt; backup?: SendBackup; assetId?: string; sentSignature?: string }>>;
};

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
const id = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9._-]/g, '');

export function loadSendState(storage: Storage): SendState {
  try {
    const parsed = JSON.parse(storage.getItem(MEME_SEND_KEY) ?? 'null');
    if (parsed && typeof parsed.memeGroupId === 'string' && parsed.intents && typeof parsed.intents === 'object') return parsed;
  } catch { /* unreadable state starts fresh */ }
  return { memeGroupId: `meme-${id()}`, intents: {} };
}
export function saveSendState(storage: Storage, state: SendState) {
  try { storage.setItem(MEME_SEND_KEY, JSON.stringify(state)); } catch { /* the send still worked; only retry memory is lost */ }
}
export function clearSendState(storage: Storage) { try { storage.removeItem(MEME_SEND_KEY); } catch { /* ignore */ } }

export function intentFor(state: SendState, format: ForgeDraft['format']) {
  const existing = state.intents[format];
  if (existing) return { state, intent: existing };
  const intent = { id: `send-${id()}` };
  return { state: { ...state, intents: { ...state.intents, [format]: intent } }, intent };
}
/** Deliberately start a second Post for this meme and platform. */
export function newIntent(state: SendState, format: ForgeDraft['format']): SendState {
  return { ...state, intents: { ...state.intents, [format]: { id: `send-${id()}` } } };
}

export function buildMemeSendBody(draft: ForgeDraft, state: SendState, intentId: string, pngBase64: string) {
  const idea = draft.ideas[draft.selected];
  const still = draft.still;
  const copy = draft.copy;
  if (!idea || !still || !copy) throw new Error('Choose an idea, a still and post copy before sending.');
  const caption = (draft.format === 'tiktok' ? copy.tiktok : copy.instagram).trim();
  return {
    schema: MEME_SEND_SCHEMA,
    memeGroupId: state.memeGroupId,
    sendIntentId: intentId,
    format: draft.format === 'tiktok' ? 'tiktok-9x16' : 'instagram-4x5',
    hook: copy.hook,
    setup: idea.setup,
    punchline: idea.punchline,
    caption,
    hashtags: copy.hashtags,
    ...(idea.visualDirection ? { visualDirection: idea.visualDirection } : {}),
    framing: { framing: draft.framing, focusX: draft.focusX, focusY: draft.focusY, textPlacement: draft.textPlacement },
    stillSource: {
      kind: still.kind,
      ...(still.title ? { title: still.title.slice(0, 500) } : {}),
      ...(still.kind === 'search' && /^https:\/\//.test(still.link) ? { link: still.link } : {}),
      ...(still.kind === 'search' && still.source ? { publisher: still.source.slice(0, 500) } : {}),
      ...(still.kind === 'search' && still.query ? { query: still.query.slice(0, 500) } : {}),
    },
    png: pngBase64,
  };
}

/** Cheap signature so the UI can say "Update" when the draft changed since the last send. */
export function draftSignature(draft: ForgeDraft) {
  const idea = draft.ideas[draft.selected];
  return JSON.stringify([draft.format, idea?.setup, idea?.punchline, draft.copy, draft.still?.thumbnail?.length, draft.still?.link, draft.framing, draft.focusX, draft.focusY, draft.textPlacement]);
}

export async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function sendMemeToCreate(body: unknown, fetchImpl: typeof fetch = fetch) {
  let response: Response;
  try {
    response = await fetchImpl(MEME_SEND_URL, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
    });
  } catch { throw new Error('The send timed out or could not be reached. Retrying is safe: it will not create a duplicate.'); }
  let payload: { receipt?: SendReceipt; backup?: SendBackup; assetId?: string; error?: string } = {};
  try { payload = await response.json(); } catch { /* handled below */ }
  if (!response.ok) throw new Error(payload.error || `Send failed (HTTP ${response.status}).`);
  if (!payload.receipt?.postId) throw new Error('CREATE returned an unreadable receipt.');
  return payload as { receipt: SendReceipt; backup?: SendBackup; assetId?: string };
}
