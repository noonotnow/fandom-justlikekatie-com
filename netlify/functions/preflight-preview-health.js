import { getBlobStore } from "./lib/blob-store.js";
import { ACTOR_PACKS } from "./lib/actor-packs.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { PREFLIGHT_PREVIEW_STORE } from "./lib/preflight-preview.js";
import { readPreflightPreviewAttempts } from "./lib/preflight-preview-health.js";

const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

export function createPreflightPreviewHealthHandler({
  getStore = getBlobStore,
  actorPacks = ACTOR_PACKS,
  auth = createPublicAuth({ getStore }),
} = {}) {
  return async (request, context) => {
    if (request.method && request.method !== "GET") return json(405, { error: "Method not allowed." });
    try {
      await auth.authenticateAdmin(request, context);
      const actorId = new URL(request.url).searchParams.get("actorId");
      const actor = actorPacks.find(item => item.id === actorId);
      if (!actor) return json(404, { error: "Actor not found." });
      const store = getStore(PREFLIGHT_PREVIEW_STORE, context);
      return json(200, { actorId, attempts: await readPreflightPreviewAttempts(store, actor) });
    } catch (error) {
      const status = error?.status === 401 || error?.status === 403 ? error.status : 503;
      if (status === 503) console.error("[preflight-preview-health] read failed", error);
      return json(status, { error: status === 503 ? "Preview health is unavailable." : "Access denied." });
    }
  };
}

const auth = createPublicAuth({ getStore: getBlobStore });

export default async function preflightPreviewHealth(request, context) {
  const result = await createPreflightPreviewHealthHandler({
    getStore: (name, ctx) => getBlobStore(name, ctx || context),
    auth,
  })(request, context);
  return new Response(result.body, { status: result.statusCode, headers: result.headers });
}