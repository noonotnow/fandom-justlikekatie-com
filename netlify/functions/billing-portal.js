import { getBlobStore } from "./lib/blob-store.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { createBillingHandlers, getBillingServices } from "./lib/billing.js";

const auth = createPublicAuth({ getStore: getBlobStore });
export default createBillingHandlers({ auth, billing: getBillingServices() }).portal;