import { getBlobStore } from "./lib/blob-store.js";
import { createPublicAuth } from "./lib/public-auth.js";

export default createPublicAuth({ getStore: getBlobStore }).verifyMagicLink;
