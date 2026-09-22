import { json } from "./public-auth.js";
import { ACTOR_PACKS, toCollectorActorPack } from "./actor-packs.js";
import { hasCapability } from "./capabilities.js";
import { ELIGIBILITY_STORE } from "./actor-eligibility.js";
import { releasedPackCatalog, protectedReleasedPackIds } from "./released-pack-catalog.js";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Vary": "Cookie",
};

/**
 * Serve the authenticated Collector source-depth contract.
 *
 * The public actor directory intentionally remains a separate endpoint and
 * projection. This handler never serves an unauthenticated response and does
 * not expose the private pack through a shared cache.
 */
export function createActorPackDepthHandler({
  auth,
  billing,
  env = process.env,
  actorPacks = ACTOR_PACKS,
  getStore = null,
  eligibilityStoreName = ELIGIBILITY_STORE,
  buildReleaseCatalog = releasedPackCatalog,
}) {
  return async (req, context) => {
    try {
      if (req.method !== "GET") {
        return json(405, { error: "Method not allowed." }, { Allow: "GET", ...NO_STORE_HEADERS });
      }

      const session = await auth.authenticate(req, context);
      await billing.initialize(context);
      const membership = await billing.repository(context)
        .membershipForAccount(session.user.accountId);
      if (!hasCapability(membership, "fandom_collector", env)) {
        return json(403, {
          error: "An active Fandom Collector membership is required.",
          capability: "fandom_collector",
        }, NO_STORE_HEADERS);
      }

      const actorId = new URL(req.url).searchParams.get("actorId");
      const catalog = getStore
        ? await buildReleaseCatalog(
          getStore(eligibilityStoreName, context),
          { publicationStore: getStore("star-of-day", context), actorPacks },
        )
        : null;
      if (catalog && !catalog.complete) {
        return json(503, { error: "Released pack inventory is temporarily unavailable." }, NO_STORE_HEADERS);
      }
      const releasedIds = catalog ? protectedReleasedPackIds(catalog) : null;
      const selected = actorId
        ? actorPacks.find(actor => actor?.id === actorId)
        : null;
      if (actorId && !selected) {
        return json(404, { error: "Actor pack not found." }, NO_STORE_HEADERS);
      }

      const packs = (selected ? [selected] : actorPacks)
        .map(toCollectorActorPack)
        .filter(Boolean)
        .map(actor => ({
          ...actor,
          vibes: releasedIds
            ? actor.vibes.filter(vibe => releasedIds.has(`${actor.id}:${vibe.vibeIdx}`))
            : actor.vibes,
        }))
        .filter(actor => actor.vibes.length)
        .filter(Boolean);
      return json(200, {
        schemaVersion: 1,
        kind: "fandom-collector-actor-pack-depth",
        capability: "fandom_collector",
        packs,
      }, NO_STORE_HEADERS);
    } catch (error) {
      const status = error?.status || 503;
      if (status >= 500) console.error("[actor-pack-depth] request failed", error);
      return json(status, {
        error: status >= 500 ? "Actor pack depth is temporarily unavailable." : error.message,
      }, NO_STORE_HEADERS);
    }
  };
}