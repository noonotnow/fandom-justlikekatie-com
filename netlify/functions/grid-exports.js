import { getBlobStore } from "./lib/blob-store.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { createGridExportHandlers } from "./lib/grid-exports.js";
import { createEntitlementChecker, getBillingServices } from "./lib/billing.js";

const auth = createPublicAuth({ getStore: getBlobStore });
export default createGridExportHandlers({
  auth, getStore: getBlobStore,
  requireMembership: createEntitlementChecker({ billing: getBillingServices() }),
}).handler;
