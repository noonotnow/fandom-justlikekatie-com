import { getBlobStore } from "./lib/blob-store.js";
import { ACTOR_PACKS } from "./lib/actor-packs.js";
import { ELIGIBILITY_STORE } from "./lib/actor-eligibility.js";
import {
  PREFLIGHT_PREVIEW_STORE,
  resolvePublicPreflightPreview,
} from "./lib/preflight-preview.js";

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

export function createPublicPreflightPreviewHandler({
  getStore = getBlobStore,
  actorPacks = ACTOR_PACKS,
  resolvePreview = resolvePublicPreflightPreview,
} = {}) {
  return async request => {
    if (request.method && request.method !== "GET") {
      return json(405, { error: "Method not allowed." });
    }
    const url = new URL(request.url);
    const actorId = url.searchParams.get("actorId");
    const vibeIdxRaw = url.searchParams.get("vibeIdx");
    if (!actorId || !/^(0|[1-9]\d*)$/.test(vibeIdxRaw || "")) {
      return json(400, { error: "actorId and vibeIdx are required." });
    }
    const vibeIdx = Number(vibeIdxRaw);
    const actor = actorPacks.find(item => item.id === actorId);
    if (!actor?.vibes?.[vibeIdx]) return json(404, { status: "unpublished" });
    try {
      const preview = await resolvePreview({
        store: getStore(PREFLIGHT_PREVIEW_STORE),
        eligibilityStore: getStore(ELIGIBILITY_STORE),
        actor,
        vibeIdx,
      });
      return preview ? json(200, preview) : json(404, { status: "unpublished" });
    } catch (error) {
      console.error("[public-preflight-preview] preview unavailable", error);
      return json(503, { status: "unavailable" });
    }
  };
}

export default async function publicPreflightPreview(request, context) {
  const result = await createPublicPreflightPreviewHandler({
    getStore: (name) => getBlobStore(name, context),
  })(request);
  return new Response(result.body, { status: result.statusCode, headers: result.headers });
}