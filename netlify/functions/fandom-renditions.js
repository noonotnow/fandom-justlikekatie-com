import { getBlobStore } from "./lib/blob-store.js";
import { ACTOR_PACKS } from "./lib/actor-packs.js";
import { createFandomRenditionsHandler } from "./lib/fandom-renditions.js";
import { createPublicAuth } from "./lib/public-auth.js";

const auth = createPublicAuth({ getStore: getBlobStore });

export default createFandomRenditionsHandler({
  auth,
  actorPacks: ACTOR_PACKS,
  getStore: context => getBlobStore("creative-lineage-renditions", context),
});
