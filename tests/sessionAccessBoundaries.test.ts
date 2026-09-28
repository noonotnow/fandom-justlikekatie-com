import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { IDBFactory } from 'fake-indexeddb';
import { useSession, type SessionState } from '../src/hooks/useSession';

test('session refreshes keep member identity and admin authority independent', async () => {
  const originalWindow = globalThis.window;
  const originalBroadcastChannel = globalThis.BroadcastChannel;
  const originalFetch = globalThis.fetch;
  const originalIndexedDB = globalThis.indexedDB;
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const pending: Array<(response: Response) => void> = [];
  const channels: TestChannel[] = [];

  class TestChannel extends EventTarget {
    closed = false;
    constructor(readonly name: string) {
      super();
      channels.push(this);
    }
    close() {
      this.closed = true;
    }
  }

  const browserWindow = new EventTarget() as Window & typeof globalThis;
  browserWindow.BroadcastChannel = TestChannel as unknown as typeof BroadcastChannel;
  globalThis.window = browserWindow;
  globalThis.BroadcastChannel = TestChannel as unknown as typeof BroadcastChannel;
  globalThis.indexedDB = new IDBFactory();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = (async (input, init) => {
    assert.equal(input, '/api/auth/session');
    assert.equal(init?.credentials, 'same-origin');
    return new Promise<Response>(resolve => pending.push(resolve));
  }) as typeof fetch;

  let state: SessionState | undefined;
  function Probe() {
    state = useSession();
    return null;
  }
  const expectState = (signedIn: boolean, admin: boolean, loading = false) => {
    assert.deepEqual(
      [state?.isSignedIn, state?.hasAdminAccess, state?.loading],
      [signedIn, admin, loading],
    );
  };
  const resolveSession = async (user: { accountId: string; email: string; isAdmin?: boolean } | null) => {
    assert.equal(pending.length, 1, 'each refresh should request one session');
    await act(async () => {
      pending.shift()!(Response.json({ user }));
    });
    // The session reader awaits an IndexedDB transaction, which completes on a later task.
    const expected = [Boolean(user), user?.isAdmin === true, false];
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (JSON.stringify([state?.isSignedIn, state?.hasAdminAccess, state?.loading]) === JSON.stringify(expected)) return;
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
    }
    assert.fail(`session did not settle to ${JSON.stringify(expected)}`);
  };
  const member = { accountId: 'member-1', email: 'member@example.test', isAdmin: false };
  const admin = { ...member, isAdmin: true };
  let renderer: ReturnType<typeof create> | undefined;

  try {
    await act(async () => {
      renderer = create(createElement(Probe));
    });
    expectState(false, false, true);
    await resolveSession(null);
    expectState(false, false);

    // A magic-link notification makes a signed-out visitor a non-admin member.
    await act(async () => {
      channels.at(-1)!.dispatchEvent(new MessageEvent('message', { data: { type: 'session-changed' } }));
    });
    await resolveSession(member);
    expectState(true, false);

    // A cross-tab storage notification can grant admin access without losing identity.
    await act(async () => {
      browserWindow.dispatchEvent(Object.assign(new Event('storage'), {
        key: 'fandom-collection-notify',
        newValue: 'session-changed:1',
      }));
    });
    await resolveSession(admin);
    expectState(true, true);

    // A protected-request recheck revokes admin authority while the member session remains valid.
    await act(async () => {
      state!.recheck();
    });
    assert.equal(channels[0]?.closed, true, 'recheck cleans up the previous listener');
    await resolveSession(member);
    expectState(true, false);

    await act(async () => {
      browserWindow.dispatchEvent(Object.assign(new Event('storage'), {
        key: 'fandom-collection-notify',
        newValue: 'session-changed:2',
      }));
    });
    await resolveSession(null);
    expectState(false, false);

    await act(async () => {
      channels.at(-1)!.dispatchEvent(new MessageEvent('message', { data: { type: 'session-changed' } }));
    });
    await resolveSession(admin);
    expectState(true, true);
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    globalThis.window = originalWindow;
    globalThis.BroadcastChannel = originalBroadcastChannel;
    globalThis.fetch = originalFetch;
    globalThis.indexedDB = originalIndexedDB;
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }
});

test('the neutral session hook exposes identity separately from admin authority', async () => {
  const source = await readFile(
    new URL('../src/hooks/useSession.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /export interface SessionState/);
  assert.match(source, /isSignedIn: boolean/);
  assert.match(source, /hasAdminAccess: boolean/);
  assert.match(source, /setIsSignedIn\(Boolean\(user\)\)/);
  assert.match(source, /setHasAdminAccess\(user\?\.isAdmin === true\)/);
  assert.doesNotMatch(source, /export function useIsAdmin/);
});

test('MemeForge routes member generation and admin-only capabilities independently', async () => {
  const [appSource, workspaceSource] = await Promise.all([
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFile(
      new URL('../src/components/MiddleEarthWorkspace/MiddleEarthWorkspace.tsx', import.meta.url),
      'utf8',
    ),
  ]);

  const middleEarthRoute = appSource.slice(
    appSource.indexOf('function MiddleEarthApp()'),
    appSource.indexOf('function VibeAtlasApp'),
  );
  assert.match(middleEarthRoute, /canGenerate=\{isSignedIn\}/);
  assert.match(middleEarthRoute, /hasAdminAccess=\{hasAdminAccess\}/);
  assert.match(
    middleEarthRoute,
    /hasCollectorAccess=\{hasAdminAccess\}/,
    'cloud-enabled Collection access must require admin authority',
  );
  assert.doesNotMatch(middleEarthRoute, /canGenerate=\{hasAdminAccess\}/);

  assert.match(
    workspaceSource,
    /hasAdminAccess && session && await shouldSyncCollection\(session\.accountId\)/,
    'MEDIA registration and cloud sync must require admin authority',
  );
  assert.doesNotMatch(
    workspaceSource,
    /isSignedIn && session && await shouldSyncCollection/,
  );
});

test('the operator console remains gated by admin authority', async () => {
  const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const adminRoute = appSource.slice(
    appSource.indexOf(': adminLoading ?'),
    appSource.indexOf('</div>', appSource.indexOf('<FandomAdmin')),
  );

  assert.match(adminRoute, /!hasAdminAccess \? \(\s*<AdminSignIn \/>/);
  assert.match(adminRoute, /<FandomAdmin/);
  assert.doesNotMatch(adminRoute, /!isSignedIn/);
});