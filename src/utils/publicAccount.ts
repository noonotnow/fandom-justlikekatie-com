import {
  dbApplySyncResponse,
  dbBuildSyncRequest,
  dbGetSyncState,
  dbRemoveAccountCache,
  dbSetMergeDecision,
} from './collectionDB';

export interface PublicUser {
  accountId: string;
  email: string;
}

export async function getPublicSession(): Promise<PublicUser | null> {
  const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
  if (!response.ok) return null;
  return (await response.json()).user;
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
  return true;
}

export async function logoutPublicAccount(user: PublicUser): Promise<void> {
  const response = await postJson('/api/auth/logout', {});
  if (!response.ok) throw new Error('Could not sign out.');
  await dbRemoveAccountCache(user.accountId);
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
    const payload = await dbBuildSyncRequest(user.accountId);
    const response = await postJson('/api/collection/sync', payload);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Collection sync failed.');
    await dbApplySyncResponse(user.accountId, body);
    notifyCollection('synced');
  };
  if (navigator.locks) {
    await navigator.locks.request('fandom-collection-sync', run);
  } else {
    await run();
  }
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
