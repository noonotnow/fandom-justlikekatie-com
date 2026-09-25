import { createPublicAuth } from "./lib/public-auth.js";
import { getBlobStore } from "./lib/blob-store.js";
import { createArchiveAccessOperationsHandler } from "./lib/archive-access-operations.js";

const auth = createPublicAuth({ getStore: getBlobStore });

export default createArchiveAccessOperationsHandler({
  auth,
  getStore: context => getBlobStore("archive-access-operations", context),
});