import { getBlobStore } from "./lib/blob-store.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { createReleasedPackReportHandler } from "./lib/released-pack-analytics.js";

export default createReleasedPackReportHandler({
  auth: createPublicAuth({ getStore: getBlobStore }),
  getStore: getBlobStore,
});