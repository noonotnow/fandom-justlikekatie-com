import { ReplitConnectors } from "@replit/connectors-sdk";
import { getBlobStore } from "./lib/blob-store.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { createMiddleEarthAIHandler } from "./lib/middle-earth-ai.js";
import { createXaiClient } from "./lib/xai-client.js";

const auth = createPublicAuth({ getStore: getBlobStore });

export default createMiddleEarthAIHandler({
  auth,
  getStore: getBlobStore,
  makeConnectorClient: () => createXaiClient({
    connectorFactory: () => new ReplitConnectors(),
  }),
});
