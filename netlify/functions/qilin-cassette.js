import { getBlobStore, getWithResolvedEtag } from './lib/blob-store.js';
import { createPublicAuth } from './lib/public-auth.js';
import { createCassetteHandler } from './lib/qilin-cassette-api.mjs';

export default createCassetteHandler({
  auth: createPublicAuth({ getStore: getBlobStore }),
  getStore: getBlobStore,
  readEntry: getWithResolvedEtag,
});
