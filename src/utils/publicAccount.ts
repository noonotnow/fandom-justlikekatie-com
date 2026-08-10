import {
  dbApplySyncResponse,
  dbBuildSyncRequest,
  dbGetSyncState,
  dbRemoveAccountCache,
  dbSetActiveAccount,
  dbSetMergeDecision,
} from './collectionDB';

export interface PublicUser {
  accountId: string;
  email: string;
}

export async function getPublicSession(): Promise<PublicUser | null> {
  const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
  if (!response.ok) {
    await dbSetActiveAccount();
    return null;
  }
  const user = (await response.json()).user as PublicUser | null;
  await dbSetActiveAccount(user?.accountId);
  return user;
}

export async function requestMagicLink(email: string): Promise<string> {
  const response = await postJson('/api/auth/magic-link', { email });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not send the sign-in link.');
  return body.message;
}

export async function consumeMagicLinkFromLocation(): Promise<boolean> {
  if (window.location.pathname !== '/auth/verify') return false;
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  window.history.replaceState({}, '', '/');
  if (!token) return false;
  const response = await postJson('/api/auth/verify', { token });
  if (!response.ok) throw new Error((await response.json()).error || 'The sign-in link could not be used.');
  notifyCollection('session-changed');
  return true;
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

export async function setDeviceMerge(accountId: string, merge: boolean): Promise<void> {
  await dbSetMergeDecision(accountId, merge);
}

export async function syncPublicCollection(user: PublicUser): Promise<void> {
  const run = async () => {
    const session = await getPublicSession();
    if (session?.accountId !== user.accountId) throw new Error('The active account changed. Refresh before syncing.');
    for (let batch = 0; batch < 100; batch += 1) {
      const payload = await dbBuildSyncRequest(user.accountId);
      const response = await postJson('/api/collection/sync', payload);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Collection sync failed.');
      await dbApplySyncResponse(user.accountId, body, payload.operations);
      if (payload.operations.length < 100) break;
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

let retryOnReconnect = false;

export function schedulePublicCollectionSync(): void {
  notifyCollection('local-change');
  void getPublicSession()
    .then(async user => {
      if (!user || !await hasMergeDecision(user.accountId)) return;
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
    const channel = new BroadcastChannel('fandom-collection');
    channel.postMessage({ type });
    channel.close();
  }
  localStorage.setItem('fandom-collection-notify', `${type}:${Date.now()}`);
}

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
