import { getBlobStore } from "./lib/blob-store.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { createCourtRulingsHandler } from "./lib/court-rulings.js";

const auth = createPublicAuth({ getStore: getBlobStore });
export default createCourtRulingsHandler({ auth, getStore: getBlobStore });
