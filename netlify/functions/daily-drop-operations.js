import { createPublicAuth } from "./lib/public-auth.js";
import { getBlobStore } from "./lib/blob-store.js";
import { createDailyDropOperationsHandler } from "./lib/daily-drop-operations.js";

const auth = createPublicAuth({ getStore: getBlobStore });

export default createDailyDropOperationsHandler({
  auth,
  getPublicationStore: context => getBlobStore("star-of-day", context),
  getOperationsStore: context => getBlobStore("daily-drop-operations", context),
});
