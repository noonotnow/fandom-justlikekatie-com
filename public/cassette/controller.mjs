import { accountKey, cassette, emptyCassette, equalCassette, GUEST_KEY } from './schema.mjs';
import { makeVault } from './vault.mjs';

const DISMISSED = 'qilin-keeper.cassette-invitation-dismissed.v1';
const canOffer = doc => doc.earned.length > 0;
export function createCassetteController({
  storage = window.localStorage, fetcher = window.fetch.bind(window), gameUrl = '/',
  download = (value) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    link.download = 'Qilin-Keeper-Cassette.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  },
} = {}) {
  const vault = makeVault(storage);
  const listeners = new Set(), contexts = new Set();
  const unreadableKeys = new Set();
  const unreadableMessage = 'This device’s cassette could not be read. It has not been overwritten. Import a backup to recover it; play can continue without replacing the original.';
  let key = GUEST_KEY, remote = null, generation = 0, destroyed = false, claimedGuest = null, unresolved = false;
  let invitationDismissed = false, invitationShown = false;
  const state = {
    phase: 'loading', user: null, cassette: emptyCassette(), saved: false, busy: false,
    status: '', error: '', invitation: false, signinOpen: false, signinSent: false,
    conflict: null, localPersistent: true,
  };
  const notify = () => { if (!destroyed) listeners.forEach(fn => fn({ ...state })); };
  const emitContext = () => contexts.forEach(fn => fn());
  const safeRead = storageKey => {
    try { return vault.read(storageKey); }
    catch { unreadableKeys.add(storageKey); state.localPersistent = false; state.error = unreadableMessage; return null; }
  };
  const persist = doc => {
    if (unreadableKeys.has(key)) { state.localPersistent = false; state.error = unreadableMessage; return false; }
    try { vault.write(key, doc); state.localPersistent = true; return true; }
    catch { state.localPersistent = false; state.error = 'This browser could not save your cassette. Keep this page open and download a backup.'; return false; }
  };
  const switchContext = (storageKey, doc) => {
    key = storageKey; state.cassette = cassette(doc); persist(state.cassette); emitContext();
  };
  const offer = () => {
    if (!state.user && state.phase === 'guest' && !invitationDismissed && !invitationShown && canOffer(state.cassette)) {
      state.invitation = true; invitationShown = true;
    }
  };
  const request = async (path, options = {}) => {
    const response = await fetcher(path, { credentials: 'same-origin', cache: 'no-store', ...options });
    const type = response.headers.get('content-type') || '';
    if (!type.includes('application/json')) throw new Error('Account saving is not available on this preview. Local play and cassette backups still work.');
    const body = await response.json();
    if (!response.ok) {
      const error = new Error(body.error || 'Account saving failed. Your local cassette is still here.');
      error.status = response.status; error.body = body; throw error;
    }
    return body;
  };
  const readRemote = async user => {
    const body = await request('/api/qilin/cassette');
    if (body.accountId !== user.accountId) throw new Error('The signed-in account changed. Refresh before saving.');
    if (body.save) cassette(body.save.cassette);
    return body.save;
  };
  const conflict = save => {
    remote = save;
    unresolved = true;
    state.saved = false;
    state.conflict = { local: cassette(state.cassette), remote: cassette(save.cassette) };
    state.status = 'Both cassettes are still safe. Choose which one to use.';
  };
  const readGuest = safeRead(GUEST_KEY);
  if (readGuest) state.cassette = readGuest;
  try { invitationDismissed = vault.get(DISMISSED) === 'yes'; } catch {}

  async function refresh() {
    const ticket = ++generation;
    state.busy = true; state.error = unreadableKeys.has(key) ? unreadableMessage : ''; notify();
    try {
      const body = await request('/api/auth/session');
      if (ticket !== generation || destroyed) return;
      const user = body.user || null;
      if (!user) {
        if (state.user) {
          try {
            const memberKey = accountKey(state.user.accountId);
            vault.remove(memberKey);
            vault.remove(`${memberKey}.unreadable-backup`);
            unreadableKeys.delete(memberKey);
          } catch {}
          switchContext(GUEST_KEY, safeRead(GUEST_KEY) || emptyCassette());
        }
        state.user = null; remote = null; state.phase = 'guest'; state.saved = false;
        state.conflict = null; offer(); return;
      }
      const save = await readRemote(user);
      if (ticket !== generation || destroyed) return;
      const sameUser = state.user?.accountId === user.accountId;
      const previousKey = key;
      const guest = previousKey === GUEST_KEY ? cassette(state.cassette) : safeRead(GUEST_KEY);
      const cached = safeRead(accountKey(user.accountId));
      state.user = user; state.phase = 'member'; state.invitation = false; state.signinOpen = false;
      remote = save;
      if (sameUser) {
        if (save && !equalCassette(save.cassette, state.cassette)) conflict(save);
        else state.saved = !!save;
      } else if (guest && canOffer(guest) && (!save || !equalCassette(guest, save.cassette))) {
        claimedGuest = cassette(guest);
        switchContext(accountKey(user.accountId), guest);
        if (save) conflict(save);
        else { state.saved = false; state.status = 'Your local cassette is ready. Save it to your account when you choose.'; }
      } else if (save) {
        if (cached && canOffer(cached) && !equalCassette(cached, save.cassette)) {
          switchContext(accountKey(user.accountId), cached);
          conflict(save);
        } else {
          switchContext(accountKey(user.accountId), save.cassette);
          state.saved = true;
        }
        // Matching guest progress is safe to claim only after a confirmed server read.
        if (guest && canOffer(guest) && equalCassette(guest, save.cassette)) {
          try { vault.remove(GUEST_KEY); } catch {}
        }
      } else {
        switchContext(accountKey(user.accountId), cached || guest || emptyCassette());
        state.saved = false;
      }
    } catch (error) {
      if (ticket !== generation || destroyed) return;
      state.saved = false; state.error = error.message;
      if (!state.user) state.phase = error.status === 401 ? 'guest' : 'unavailable';
    } finally {
      if (ticket === generation && !destroyed) { state.busy = false; notify(); }
    }
  }

  async function save() {
    if (state.busy || state.conflict) return;
    if (!state.user) { api.openSignin(); return; }
    if (unresolved && remote) { conflict(remote); notify(); return; }
    const user = state.user, snapshot = cassette(state.cassette), ticket = generation;
    state.busy = true; state.saved = false; state.error = ''; state.status = 'Saving your cassette…'; notify();
    try {
      const body = await request('/api/qilin/cassette', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedAccountId: user.accountId, baseRevision: remote?.revision || null, cassette: snapshot }),
      });
      if (destroyed || ticket !== generation || state.user?.accountId !== body.accountId) return;
      cassette(body.save.cassette);
      if (!equalCassette(body.save.cassette, snapshot)) throw new Error('The server did not confirm this cassette. Please retry.');
      remote = body.save;
      state.saved = equalCassette(state.cassette, snapshot);
      state.status = state.saved ? 'Saved to your account.' : 'Earlier design saved. Your latest changes are saved on this device; save again to bring them along.';
      if (claimedGuest) {
        try {
          const currentGuest = safeRead(GUEST_KEY);
          if (currentGuest && equalCassette(currentGuest, claimedGuest)) vault.remove(GUEST_KEY);
          claimedGuest = null;
        } catch {}
      }
    } catch (error) {
      if (ticket !== generation || destroyed) return;
      state.status = ''; state.error = error.message;
      if (error.status === 409 && error.body?.accountId === user.accountId && error.body.save) conflict(error.body.save);
    } finally {
      if (ticket === generation && !destroyed) { state.busy = false; notify(); }
    }
  }
  const api = {
    state, get storageKey() { return key; },
    get contextWritable() { return !unreadableKeys.has(key); },
    protectLocalKey(storageKey) {
      if (storageKey !== key) return;
      unreadableKeys.add(key); state.localPersistent = false; state.error = unreadableMessage; notify();
    },
    subscribe(fn) { listeners.add(fn); fn({ ...state }); return () => listeners.delete(fn); },
    onContext(fn) { contexts.add(fn); return () => contexts.delete(fn); },
    refresh, save,
    gameChanged(value, persisted = true) {
      let doc;
      try { doc = cassette(value); } catch { return; }
      // Account choices must not replace a still-pending local version.
      const changed = !equalCassette(doc, state.cassette);
      const persistenceChanged = state.localPersistent !== !!persisted;
      state.cassette = doc; state.localPersistent = !!persisted && !unreadableKeys.has(key);
      if (changed) {
        state.saved = !!remote && equalCassette(doc, remote.cassette);
        state.status = state.saved ? 'Saved to your account.' : 'Saved on this device.';
        if (state.conflict) state.conflict.local = doc;
      }
      if (!persisted) state.error = 'This browser could not save your cassette. Download a backup before leaving.';
      if (unreadableKeys.has(key)) state.error = unreadableMessage;
      offer();
      if (changed || persistenceChanged) notify();
    },
    openSignin() {
      if (state.phase === 'unavailable') {
        state.error = 'Member saving becomes available on the fandom site. You can transfer this preview’s cassette using a backup.';
      } else { state.signinOpen = true; state.signinSent = false; state.invitation = false; }
      notify();
    },
    cancelSignin() { state.signinOpen = false; state.signinSent = false; api.dismissInvitation(); },
    dismissInvitation() {
      invitationDismissed = true; state.invitation = false;
      try { vault.set(DISMISSED, 'yes'); } catch {}
      notify();
    },
    async requestSignin(email) {
      state.busy = true; state.error = ''; notify();
      try {
        const body = await request('/api/auth/magic-link', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, next: 'qilin' }),
        });
        state.signinSent = true; state.status = body.message;
      } catch (error) { state.error = error.message; }
      finally { state.busy = false; notify(); }
    },
    async signout() {
      if (state.busy) return;
      ++generation; state.busy = true; state.saved = false; state.error = ''; notify();
      try {
        await request('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (state.user) {
          try {
            const memberKey = accountKey(state.user.accountId);
            vault.remove(memberKey);
            vault.remove(`${memberKey}.unreadable-backup`);
            vault.remove(`qilin-keeper.cassette-recovery.${state.user.accountId}`);
            unreadableKeys.delete(memberKey);
          } catch {}
        }
        state.user = null; remote = null; claimedGuest = null; unresolved = false; state.conflict = null; state.phase = 'guest';
        switchContext(GUEST_KEY, safeRead(GUEST_KEY) || emptyCassette());
        state.status = 'Signed out. Your account cassette is no longer open on this device.';
      } catch (error) { state.error = error.message; }
      finally { state.busy = false; notify(); }
    },
    async choose(choice) {
      if (!state.conflict || state.busy) return;
      const local = cassette(state.cassette);
      if (choice === 'cancel') {
        state.conflict = null;
        state.status = 'Neither account version nor local cassette was replaced.';
        notify(); return;
      }
      if (choice === 'remote') {
        // Keep the other version recoverable before deliberately replacing the active one.
        try { vault.set(`qilin-keeper.cassette-recovery.${state.user.accountId}`, JSON.stringify(local)); }
        catch { state.error = 'Could not retain the local version. Export a backup before replacing it.'; notify(); return; }
        switchContext(key, remote.cassette);
        download({ format: 'qilin-keeper-cassette', version: 1, cassette: local });
        unresolved = false;
        state.conflict = null; state.saved = true; state.status = 'Using your account cassette.';
        if (claimedGuest) {
          try { vault.remove(GUEST_KEY); } catch {}
          claimedGuest = null;
        }
        notify(); return;
      }
      if (choice === 'local') {
        unresolved = false; state.conflict = null; notify(); await save();
      }
    },
    exportBackup() {
      download({ format: 'qilin-keeper-cassette', version: 1, cassette: cassette(state.cassette) });
      state.status = 'Cassette backup downloaded. Keep it somewhere safe.'; notify();
    },
    async importBackup(file) {
      try {
        if (!file || file.size > 8192) throw new Error('Choose a cassette backup smaller than 8 KB.');
        const value = JSON.parse(await file.text());
        if (value.format !== 'qilin-keeper-cassette' || value.version !== 1) throw new Error('Choose a Qilin Keeper cassette backup.');
        const doc = cassette(value.cassette);
        if (unreadableKeys.has(key)) {
          // Import is an explicit recovery action. Retain the exact original bytes.
          const original = vault.get(key);
          if (original !== null) vault.set(`${key}.unreadable-backup`, original);
          unreadableKeys.delete(key);
        }
        // Never silently import over an existing design, even while signed out.
        if (canOffer(state.cassette) && !equalCassette(doc, state.cassette)) {
          api.exportBackup();
          state.status = 'Your current cassette was backed up before importing the other design.';
        }
        switchContext(key, doc); state.saved = false;
        if (state.user && remote && !equalCassette(doc, remote.cassette)) conflict(remote);
        else state.status = 'Cassette imported on this device. Member saving is a separate action.';
        offer(); state.error = ''; notify();
      } catch (error) { state.error = error.message; notify(); }
    },
    destroy() { destroyed = true; ++generation; listeners.clear(); contexts.clear(); },
  };
  return api;
}
