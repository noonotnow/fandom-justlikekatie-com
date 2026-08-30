import { getBlobStore } from "./lib/blob-store.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { createWatchJournalHandler } from "./lib/watch-journal.js";

const auth = createPublicAuth({ getStore: getBlobStore });

export default createWatchJournalHandler({ auth, getStore: getBlobStore });