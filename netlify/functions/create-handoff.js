import { getBlobStore } from "./lib/blob-store.js";
import { createWorkstationHandoffHandler } from "./lib/workstation-handoff.js";
import { createPublicAuth } from "./lib/public-auth.js";

const auth = createPublicAuth({ getStore: getBlobStore });

// Temporary same-origin rollout alias. It still targets Workstation exclusively.
export default createWorkstationHandoffHandler({ getStore: getBlobStore, auth });
