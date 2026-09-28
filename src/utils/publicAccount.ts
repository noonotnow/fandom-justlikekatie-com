import { PUBLIC_ROUTE_PATHS } from '../../shared/public-routes.js';
import {
  dbApplySyncResponse,
  dbBuildCardSyncRequest,
  dbBuildGridSyncRequest,
  dbBuildSyncRequest,
  dbLegacyReconciliationCandidates,
  collectionScopeForCard,
  dbGetVisibleCards,
  dbGetSyncState,
  dbReplaceCardImage,
  dbRemoveAccountCache,
  dbResolveRemoteDeletion,
  dbSetActiveAccount,
  dbSetMergeDecision,
} from './collectionDB';
import { uploadCollectionImage } from './collectionMedia';

export interface PublicUser {
  accountId: string;
  email: string;
  isAdmin?: boolean;
}

export async function getPublicSession(): Promise<PublicUser | null> {
  const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
  const isJson = response.headers.get('content-type')?.toLowerCase().includes('application/json');
  if (!response.ok || !isJson) {
    await dbSetActiveAccount();
    return null;
  }
  const user = (await response.json()).user as PublicUser | null;
  await dbSetActiveAccount(user?.accountId);
  return user;
}

export async function requestMagicLink(email: string, next?: string): Promise<string> {
  const response = await postJson('/api/auth/magic-link', { email, ...(next ? { next } : {}) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not send the sign-in link.');
  return body.message;
}

/**
 * Consumes a magic-link token from the current URL (when on /auth/verify).
 * Returns the destination view to navigate to on success, or `false` if there
 * was no magic link to consume.
 */
export async function consumeMagicLinkFromLocation(): Promise<
  'admin' | 'collection' | 'membership' | `archive:${string}` | false
> {
  if (window.location.pathname !== '/auth/verify') return false;
  const fragment = window.location.hash.slice(1);
  const params = new URLSearchParams(fragment);
  const token = params.get('token');
  const next = params.get('next');
  const archiveDate = next?.match(/^archive:(\d{4}-\d{2}-\d{2})$/)?.[1];
  try {
    decodeURIComponent(fragment.replace(/\+/g, '%20'));
  } catch {
    replaceCallbackHistoryWithCollection();
    throw new Error('This sign-in link is damaged. Request a new link and try again.');
  }
  if (!token) {
    replaceCallbackHistoryWithCollection();
    throw new Error('This sign-in link is incomplete. Request a new link and try again.');
  }
  window.history.replaceState(
    {},
    '',
    next === 'plan' || next === 'admin'
      ? `${PUBLIC_ROUTE_PATHS.vibeAtlas}?admin=true`
      : archiveDate
        ? `${PUBLIC_ROUTE_PATHS.vibeAtlas}?date=${encodeURIComponent(archiveDate)}`
      : next === 'membership'
        ? `${PUBLIC_ROUTE_PATHS.vibeAtlas}?view=membership`
        : `${PUBLIC_ROUTE_PATHS.vibeAtlas}?view=collection`,
  );
  const response = await postJson('/api/auth/verify', { token });
  if (!response.ok) throw new Error((await response.json()).error || 'The sign-in link could not be used.');
  notifyCollection('session-changed');
  if (archiveDate) return `archive:${archiveDate}`;
  return next === 'plan' || next === 'admin' ? 'admin' : next === 'membership' ? 'membership' : 'collection';
}

function replaceCallbackHistoryWithCollection(): void {
  window.history.replaceState({}, '', `${PUBLIC_ROUTE_PATHS.vibeAtlas}?view=collection`);
}

export async function logoutPublicAccount(user: PublicUser): Promise<void> {
  const response = await postJson('/api/auth/logout', {});
  if (!response.ok) throw new Error('Could not sign out.');
  await dbRemoveAccountCache(user.accountId);
  await dbSetActiveAccount();
  notifyCollection('session-changed');
}

export async function hasMergeDecision(accountId: string): Promise<boolean> {
  const state = await dbGetSyncState();
  return Object.hasOwn(state.mergeDecisions, accountId);
}

export async function shouldSyncCollection(accountId: string): Promise<boolean> {
  const state = await dbGetSyncState();
  return state.mergeDecisions[accountId] === true;
}

export async function setDeviceMerge(accountId: string, merge: boolean): Promise<void> {
  await dbSetMergeDecision(accountId, merge);
}

export async function resolvePublicCollectionDeletion(
  user: PublicUser,
  kind: 'card' | 'grid',
  localId: string,
  decision: 'restore' | 'discard',
): Promise<void> {
  const run = async () => {
    const session = await getPublicSession();
    if (session?.accountId !== user.accountId) throw new Error('The active account changed. Refresh before resolving this copy.');
    await dbResolveRemoteDeletion(user.accountId, kind, localId, decision);
  };
  if (navigator.locks) await navigator.locks.request('fandom-collection-sync', run);
  else await run();
  notifyCollection('local-change');
}

export async function syncPublicCollection(user: PublicUser): Promise<void> {
  const run = async () => {
    const session = await getPublicSession();
    if (session?.accountId !== user.accountId) throw new Error('The active account changed. Refresh before syncing.');
    await persistEmbeddedCollectionImages(user.accountId, session.isAdmin === true);
    const legacyCandidates = await dbLegacyReconciliationCandidates(user.accountId, session.isAdmin === true);
    if (Object.keys(legacyCandidates).length > 0) {
      // A read-only sync must happen before the first upgraded upsert: the
      // server otherwise applies stale mutations before reporting tombstones.
      const probe = await dbBuildSyncRequest(user.accountId, session.isAdmin === true);
      const response = await postJson('/api/collection/sync', { ...probe, operations: [] });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Collection reconciliation failed.');
      await dbApplySyncResponse(user.accountId, body, [], legacyCandidates);
    }
    for (let batch = 0; batch < 100; batch += 1) {
      const payload = await dbBuildSyncRequest(user.accountId, session.isAdmin === true);
      const response = await postJson('/api/collection/sync', payload);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Collection sync failed.');
      await dbApplySyncResponse(user.accountId, body, payload.operations);
      if (payload.operations.length === 0) break;
      if (batch === 99) throw new Error('Collection sync exceeded the safe batch limit.');
    }
    notifyCollection('synced');
  };
  if (navigator.locks) {
    await navigator.locks.request('fandom-collection-sync', run);
  } else {
    await run();
  }
}

/** Sync only the grid a creator explicitly selected, regardless of merge preference. */
export async function syncPublicGrid(user: PublicUser, gridId: string): Promise<void> {
  const run = async () => {
    const session = await getPublicSession();
    if (session?.accountId !== user.accountId) throw new Error('The active account changed. Refresh before syncing.');
    const payload = await dbBuildGridSyncRequest(user.accountId, gridId);
    const response = await postJson('/api/collection/sync', payload);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Selected grid sync failed.');
    await dbApplySyncResponse(user.accountId, body, payload.operations);
    notifyCollection('synced');
  };
  if (navigator.locks) {
    await navigator.locks.request('fandom-collection-sync', run);
  } else {
    await run();
  }
}

/** Sync one deliberately saved card without opting the device into bulk merge. */
export async function syncPublicCard(user: PublicUser, imageUrl: string): Promise<void> {
  const run = async () => {
    const session = await getPublicSession();
    if (session?.accountId !== user.accountId) throw new Error('The active account changed. Refresh before syncing.');
    const payload = await dbBuildCardSyncRequest(user.accountId, imageUrl);
    const response = await postJson('/api/collection/sync', payload);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Selected image sync failed.');
    await dbApplySyncResponse(user.accountId, body, payload.operations);
    notifyCollection('synced');
  };
  if (navigator.locks) {
    await navigator.locks.request('fandom-collection-sync', run);
  } else {
    await run();
  }
}

async function persistEmbeddedCollectionImages(accountId: string, includeMiddleEarth: boolean): Promise<void> {
  const cards = await dbGetVisibleCards(accountId);
  const conflicts = (await dbGetSyncState()).remoteDeletionConflictsByAccount?.[accountId] || {};
  for (const card of cards) {
    if (card.localId && conflicts[card.localId]) continue;
    if (!includeMiddleEarth && collectionScopeForCard(card) === 'middle-earth') continue;
    if (!card.imageUrl.startsWith('data:image/')) continue;
    if (!card.localId) throw new Error('Collection image is missing its local identity.');
    const uploaded = await uploadCollectionImage(
      card.imageUrl,
      collectionScopeForCard(card),
      card.localId,
    );
    await dbReplaceCardImage(card.imageUrl, uploaded);
  }
}

let retryOnReconnect = false;

export function schedulePublicCollectionSync(): void {
  notifyCollection('local-change');
  void getPublicSession()
    .then(async user => {
      if (!user || !await shouldSyncCollection(user.accountId)) return;
      await syncPublicCollection(user);
      retryOnReconnect = false;
    })
    .catch(error => {
      if (!navigator.onLine || error instanceof TypeError) {
        if (retryOnReconnect) return;
        retryOnReconnect = true;
        window.addEventListener('online', () => {
          retryOnReconnect = false;
          schedulePublicCollectionSync();
        }, { once: true });
        return;
      }
      sessionStorage.setItem(
        'fandom_auth_notice',
        error instanceof Error ? error.message : 'Collection sync failed.',
      );
      notifyCollection('session-changed');
    });
}

function notifyCollection(type: string) {
  if ('BroadcastChannel' in window) {
    try {
      const channel = new BroadcastChannel('fandom-collection');
      channel.postMessage({ type });
      channel.close();
    } catch {
      // Cross-tab notifications are best-effort and must not interrupt account actions.
    }
  }
  try {
    localStorage.setItem('fandom-collection-notify', `${type}:${Date.now()}`);
  } catch {
    // Privacy modes can reject storage writes; the current tab remains authenticated.
  }
}

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
