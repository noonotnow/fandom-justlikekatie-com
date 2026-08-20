import { getBlobStore } from "./lib/blob-store.js";
import { createCreateHandoffHandler } from "./lib/create-handoff.js";
import { createPublicAuth } from "./lib/public-auth.js";

const auth = createPublicAuth({ getStore: getBlobStore });

export default createCreateHandoffHandler({ getStore: getBlobStore, auth });
