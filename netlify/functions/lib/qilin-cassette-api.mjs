import { randomUUID } from 'node:crypto';
import { cassette } from '../../../public/cassette/schema.mjs';

// Separate from cards/grids. Identity comes exclusively from the existing session.
export function createCassetteHandler({ auth, getStore, readEntry, now = () => new Date() }) {
  const json = (status, body) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  return async (req, context) => {
    try {
      if (!['GET', 'PUT'].includes(req.method)) return json(405, { error: 'Use GET or PUT.' });
      if (req.method === 'PUT' && req.headers.get('origin') !== new URL(req.url).origin) {
        return json(403, { error: 'Cross-origin saving is not allowed.' });
      }
      const { user } = await auth.authenticate(req, context);
      const store = getStore('fandom-qilin-cassettes', context);
      const key = `users/${user.accountId}/cassette`;
      const entry = await readEntry(store, key);
      const response = save => ({ accountId: user.accountId, save });
      if (req.method === 'GET') return json(200, response(entry?.data || null));
      if (!req.headers.get('content-type')?.includes('application/json')) {
        return json(400, { error: 'Send a JSON cassette.' });
      }
      const raw = await req.text();
      if (Buffer.byteLength(raw) > 8192) return json(413, { error: 'Cassette is too large.' });
      let input;
      try { input = JSON.parse(raw); } catch { return json(400, { error: 'Invalid JSON.' }); }
      if (input.expectedAccountId !== user.accountId) {
        return json(409, { error: 'The signed-in account changed. Check your session before saving.' });
      }
      let validated;
      try { validated = cassette(input.cassette); }
      catch (error) { return json(400, { error: error.message }); }
      if (input.baseRevision !== (entry?.data?.revision || null)) {
        return json(409, { ...response(entry?.data || null), error: 'Your account cassette changed. Choose which version to keep.' });
      }
      // Never degrade a conditional replacement into an unconditional write.
      if (entry && !entry.etag) throw new Error('Storage did not supply a safe update token.');
      const save = { schemaVersion: 1, revision: randomUUID(), updatedAt: now().toISOString(), cassette: validated };
      const result = await store.setJSON(key, save, entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true });
      const confirmed = await readEntry(store, key);
      if (result?.modified === false || confirmed?.data?.revision !== save.revision) {
        return json(409, { ...response(confirmed?.data || null), error: 'Another device changed this cassette. Choose which version to keep.' });
      }
      return json(200, response(confirmed.data));
    } catch (error) {
      const status = error?.status === 401 ? 401 : 503;
      return json(status, { error: status === 401 ? 'Sign in to save your cassette.' : 'Account saving is unavailable. Your local cassette has not been removed.' });
    }
  };
}
