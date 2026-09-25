import { createPublicAuth } from "./lib/public-auth.js";
import { getBlobStore } from "./lib/blob-store.js";
import { createActorPackDepthHandler } from "./lib/actor-pack-depth.js";
import { getBillingServices } from "./lib/billing.js";

const auth = createPublicAuth({ getStore: getBlobStore });

export default createActorPackDepthHandler({
  auth,
  billing: getBillingServices(),
  getStore: getBlobStore,
});