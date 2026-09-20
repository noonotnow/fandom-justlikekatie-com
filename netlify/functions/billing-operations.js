import { createPublicAuth } from "./lib/public-auth.js";
import { getBlobStore } from "./lib/blob-store.js";
import { createBlobBillingRepository } from "./lib/billing-blob-repository.js";
import { createBillingOperationsHandler } from "./lib/billing-operations.js";

const auth = createPublicAuth({ getStore: getBlobStore });

export default createBillingOperationsHandler({
  auth,
  getRepository: context => createBlobBillingRepository({ getStore: getBlobStore, context }),
});