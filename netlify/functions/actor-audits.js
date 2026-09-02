import { createPublicAuth } from "./lib/public-auth.js";
import { getBlobStore } from "./lib/blob-store.js";
import { ACTOR_PACKS } from "./lib/actor-packs.js";
import { searchOneQuery } from "./preview-search.js";
import { createActorAuditHandler } from "./lib/actor-audit.js";
import { materializePublicationManifest } from "./lib/publication-manifest.js";

const auth = createPublicAuth({ getStore: getBlobStore });

export default createActorAuditHandler({
  auth,
  getStore: getBlobStore,
  getPublicationStore: context => getBlobStore("star-of-day", context),
  actorPacks: ACTOR_PACKS,
  searchOneQuery,
  materializePublication: materializePublicationManifest,
});