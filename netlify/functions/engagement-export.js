import { getBlobStore } from "./lib/blob-store.js";
import { createEngagementExportHandler } from "./lib/engagement-export.js";
import { createPublicAuth } from "./lib/public-auth.js";

const auth = createPublicAuth({ getStore: getBlobStore });

export default createEngagementExportHandler({
  auth,
  getStore: getBlobStore,
});
