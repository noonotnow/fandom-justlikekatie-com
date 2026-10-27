import { ReplitConnectors } from "@replit/connectors-sdk";
import { getBlobStore } from "./lib/blob-store.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { createXaiClient } from "./lib/xai-client.js";
import { createCdramaMemeHandler } from "./lib/cdrama-memeforge.js";

export default createCdramaMemeHandler({
  auth: createPublicAuth({ getStore: getBlobStore }),
  getStore: getBlobStore,
  makeConnectorClient: () => createXaiClient({ connectorFactory: () => new ReplitConnectors() }),
});
