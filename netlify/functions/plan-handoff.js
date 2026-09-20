import { createPlanHandoffHandler } from "./lib/plan-handoff.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { getBlobStore } from "./lib/blob-store.js";
import { createCapabilityChecker, getBillingServices } from "./lib/billing.js";

const auth = createPublicAuth({ getStore: getBlobStore });
export default createPlanHandoffHandler({
  auth,
  requireCapability: createCapabilityChecker({
    billing: getBillingServices(), capability: ["creator_os", "fandom_creator_bridge"],
  }),
});
