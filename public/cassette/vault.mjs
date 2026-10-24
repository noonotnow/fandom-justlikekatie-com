import { cassette, emptyCassette } from './schema.mjs';

export function makeVault(storage) {
  return {
    read(key) {
      const raw = storage.getItem(key);
      return raw === null ? emptyCassette() : cassette(JSON.parse(raw));
    },
    write(key, value) { storage.setItem(key, JSON.stringify(cassette(value))); },
    remove(key) { storage.removeItem(key); },
    get(key) { return storage.getItem(key); },
    set(key, value) { storage.setItem(key, value); },
  };
}

export function attachGame(controller, frame) {
  let ready = false;
  const send = () => {
    if (!ready) return;
    frame.contentWindow?.postMessage({
      type: 'qilin-cassette-context',
      key: controller.storageKey,
      cassette: controller.state.cassette,
      writable: controller.contextWritable,
    }, location.origin);
  };
  const receive = event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow ||
        event.data?.type !== 'qilin-cassette-state') return;
    if (event.data.damaged) controller.protectLocalKey(event.data.key);
    if (!ready) { ready = true; send(); return; }
    if (event.data.key !== controller.storageKey) { send(); return; }
    controller.gameChanged(event.data.cassette, event.data.persisted);
  };
  window.addEventListener('message', receive);
  const unsubscribe = controller.onContext(send);
  const ping = setInterval(() => frame.contentWindow?.postMessage({ type: 'qilin-cassette-read' }, location.origin), 1000);
  return () => { clearInterval(ping); unsubscribe(); window.removeEventListener('message', receive); };
}
