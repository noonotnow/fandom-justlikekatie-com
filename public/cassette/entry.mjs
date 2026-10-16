import { createCassetteController } from './controller.mjs';
import { mountCassetteView } from './view.mjs';
import { attachGame } from './vault.mjs';

export function mountCassette(root, options = {}) {
  const gameUrl = options.gameUrl || root.dataset.gameUrl || '/';
  const cornerUrl = options.cornerUrl || root.dataset.cornerUrl || '/my-corner/';
  let storage;
  try { storage = window.localStorage; }
  catch {
    // The controller still works in memory, with an explicit nonpersistent warning.
    storage = { getItem() { throw new Error('Storage blocked'); }, setItem() { throw new Error('Storage blocked'); }, removeItem() {} };
  }
  const controller = createCassetteController({ storage, gameUrl });
  const unmount = mountCassetteView(root, controller, { page: root.dataset.page || 'game', gameUrl, cornerUrl });
  const frame = options.frame || document.querySelector('iframe[title="Qilin Keeper game"]');
  const detach = frame ? attachGame(controller, frame) : () => {};
  const refresh = () => void controller.refresh();
  const onVisible = () => { if (!document.hidden) refresh(); };
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', onVisible);
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('fandom-collection') : null;
  if (channel) channel.onmessage = e => { if (e.data?.type === 'session-changed') refresh(); };
  refresh();
  return () => { detach(); unmount?.(); controller.destroy(); channel?.close(); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', onVisible); };
}
for (const root of document.querySelectorAll('[data-cassette-root]')) mountCassette(root);
