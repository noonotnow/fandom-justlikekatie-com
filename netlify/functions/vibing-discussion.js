import { getBlobStore } from "./lib/blob-store.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { createVibingDiscussionHandler } from "./lib/vibing-discussion.js";

const auth = createPublicAuth({ getStore: getBlobStore });
export default createVibingDiscussionHandler({ auth, getStore: getBlobStore });