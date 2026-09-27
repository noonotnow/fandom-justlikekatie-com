import { getBlobStore } from "./lib/blob-store.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { createCompanionReport } from "./lib/companion-report.js";

export default createCompanionReport({
  auth: createPublicAuth({ getStore: getBlobStore }),
  getStore: getBlobStore,
});