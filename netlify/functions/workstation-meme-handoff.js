import { getBlobStore } from "./lib/blob-store.js";
import { createWorkstationMemeHandoffHandler } from "./lib/workstation-meme-handoff.js";
import { createPublicAuth } from "./lib/public-auth.js";

const auth = createPublicAuth({ getStore: getBlobStore });

export default createWorkstationMemeHandoffHandler({ getStore: getBlobStore, auth });
