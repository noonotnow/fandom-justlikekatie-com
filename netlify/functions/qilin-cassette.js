import { getBlobStore, getWithResolvedEtag } from './lib/blob-store.js';
import { createPublicAuth } from './lib/public-auth.js';
import { createCassetteHandler } from './lib/qilin-cassette-api.mjs';

export const readCassetteEntry = (store, key) => getWithResolvedEtag(store, key, { type: 'json' });

export default createCassetteHandler({
  auth: createPublicAuth({ getStore: getBlobStore }),
  getStore: getBlobStore,
  readEntry: readCassetteEntry,
});
