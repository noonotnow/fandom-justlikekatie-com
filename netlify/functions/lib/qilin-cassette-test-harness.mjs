// Isolated acceptance harness, never shipped. Uses real site auth/handler code,
// synthetic in-memory records, and an outbox instead of sending email.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createPublicAuth } from './public-auth.js';
import { createCassetteHandler } from './qilin-cassette-api.mjs';
import { readCassetteEntry } from '../qilin-cassette.js';

export function memoryStore() {
  const records = new Map();
  let revision = 0;
  return {
    records,
    async get(key) { return structuredClone(records.get(key)?.data ?? null); },
    async getWithMetadata(key, options = {}) {
      const entry = structuredClone(records.get(key) ?? null);
      if (entry && options.type !== 'json') {
        entry.data = new TextEncoder().encode(JSON.stringify(entry.data)).buffer;
      }
      return entry;
    },
    async setJSON(key, data, options = {}) {
      const existing = records.get(key);
      if ((options.onlyIfNew && existing) || (options.onlyIfMatch && options.onlyIfMatch !== existing?.etag)) return { modified: false };
      records.set(key, { data: structuredClone(data), etag: `test-etag-${++revision}` });
      return { modified: true };
    },
    async list() { return { blobs: [...records].map(([key, entry]) => ({ key, etag: entry.etag })) }; },
  };
}
export function harness(origin) {
  const stores = new Map(), mail = [];
  const getStore = name => { if (!stores.has(name)) stores.set(name, memoryStore()); return stores.get(name); };
  const auth = createPublicAuth({
    getStore, env: { FANDOM_AUTH_ID_SECRET: 'isolated-cassette-test-only', FANDOM_PUBLIC_ORIGIN: origin, FANDOM_ADMIN_EMAILS: '' },
    sendEmail: async message => { mail.push(message); },
  });
  const cassette = createCassetteHandler({ auth, getStore, readEntry: readCassetteEntry });
  const routes = {
    '/api/auth/session': auth.getSession, '/api/auth/magic-link': auth.requestMagicLink,
    '/api/auth/verify': auth.verifyMagicLink, '/api/auth/logout': auth.logout,
    '/api/qilin/cassette': cassette,
  };
  return { routes, stores, mail, auth };
}
