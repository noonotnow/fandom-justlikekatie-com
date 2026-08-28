import { getBlobStore } from "./lib/blob-store.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { createCollectionMediaHandler } from "./lib/collection-media.js";

const auth = createPublicAuth({ getStore: getBlobStore });
export default createCollectionMediaHandler({ auth });