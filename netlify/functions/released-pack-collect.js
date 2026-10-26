import { getBlobStore } from "./lib/blob-store.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { createReleasedPackCollectHandler } from "./lib/released-pack-analytics.js";

export default createReleasedPackCollectHandler({
  auth: createPublicAuth({ getStore: getBlobStore }),
  getStore: getBlobStore,
});