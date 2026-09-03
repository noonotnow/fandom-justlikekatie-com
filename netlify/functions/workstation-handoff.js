import { getBlobStore } from "./lib/blob-store.js";
import { createWorkstationHandoffHandler } from "./lib/workstation-handoff.js";
import { createPublicAuth } from "./lib/public-auth.js";

const auth = createPublicAuth({ getStore: getBlobStore });

export default createWorkstationHandoffHandler({ getStore: getBlobStore, auth });
