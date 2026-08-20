import { getBlobStore } from "./lib/blob-store.js";
import { createIdeaPacketsHandler } from "./lib/idea-packets.js";
import { createPublicAuth } from "./lib/public-auth.js";

const auth = createPublicAuth({ getStore: getBlobStore });

export default createIdeaPacketsHandler({ getStore: getBlobStore, auth });
