import { getBlobStore } from "./lib/blob-store.js";
import { ELIGIBILITY_STORE } from "./lib/actor-eligibility.js";
import { ACTOR_PACKS } from "./lib/actor-packs.js";
import {
  PREFLIGHT_PREVIEW_STORE,
  preflightPreviewDirectory,
} from "./lib/preflight-preview.js";

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

export function createPublicPreflightPreviewDirectoryHandler({
  getStore = getBlobStore,
  actorPacks = ACTOR_PACKS,
  buildDirectory = preflightPreviewDirectory,
} = {}) {
  return async request => {
    if (request.method && request.method !== "GET") {
      return json(405, { error: "Method not allowed." });
    }
    const actorId = new URL(request.url).searchParams.get("actorId");
    if (!actorId) return json(400, { error: "actorId is required." });
    const actor = actorPacks.find(item => item.id === actorId);
    if (!actor) return json(404, { status: "unpublished" });
    try {
      const directory = await buildDirectory({
        store: getStore(PREFLIGHT_PREVIEW_STORE),
        eligibilityStore: getStore(ELIGIBILITY_STORE),
        actor,
      });
      return json(200, directory);
    } catch (error) {
      console.error("[public-preflight-preview-directory] directory unavailable", error);
      return json(503, { status: "unavailable" });
    }
  };
}

export default async function publicPreflightPreviewDirectory(request, context) {
  const result = await createPublicPreflightPreviewDirectoryHandler({
    getStore: name => getBlobStore(name, context),
  })(request);
  return new Response(result.body, { status: result.statusCode, headers: result.headers });
}