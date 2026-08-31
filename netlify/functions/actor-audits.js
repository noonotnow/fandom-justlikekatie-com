import { createPublicAuth } from "./lib/public-auth.js";
import { getBlobStore } from "./lib/blob-store.js";
import { ACTOR_PACKS } from "./lib/actor-packs.js";
import { searchOneQuery } from "./preview-search.js";
import { createActorAuditHandler } from "./lib/actor-audit.js";

const auth = createPublicAuth({ getStore: getBlobStore });

export default createActorAuditHandler({
  auth,
  getStore: getBlobStore,
  actorPacks: ACTOR_PACKS,
  searchOneQuery,
});