import { getBlobStore } from "./lib/blob-store.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { createCollectionHandlers } from "./lib/collection-api.js";
import { createCapabilityChecker, getBillingServices } from "./lib/billing.js";

const auth = createPublicAuth({ getStore: getBlobStore });
export default createCollectionHandlers({
  auth, getStore: getBlobStore,
  requireCapability: createCapabilityChecker({
    billing: getBillingServices(), capability: "fandom_collector",
  }),
}).sync;
