import { getBlobStore } from "./lib/blob-store.js";
import { ACTOR_PACKS } from "./lib/actor-packs.js";
import { ELIGIBILITY_STORE } from "./lib/actor-eligibility.js";
import { createPublicAuth } from "./lib/public-auth.js";
import {
  PREFLIGHT_PREVIEW_STORE,
  publishPreflightPreview as publishPreflightPreviewReceipt,
  publicPreflightPreview,
} from "./lib/preflight-preview.js";

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

function requireSameOrigin(request) {
  if (request.headers?.get?.("origin") !== new URL(request.url).origin) {
    const error = new Error("Cross-origin requests are not allowed.");
    error.status = 403;
    throw error;
  }
}

export function createPublishPreflightPreviewHandler({
  getStore = getBlobStore,
  actorPacks = ACTOR_PACKS,
  auth = createPublicAuth({ getStore }),
  publishPreview = publishPreflightPreviewReceipt,
} = {}) {
  return async (request, context) => {
    if (request.method && request.method !== "POST") {
      return json(405, { error: "Method not allowed." });
    }
    try {
      requireSameOrigin(request);
      await auth.authenticateAdmin(request, context);
      const contentLength = Number(request.headers?.get?.("content-length") || 0);
      if (contentLength > 4096) return json(413, { error: "Request body is too large." });
      let input;
      try {
        input = await request.json();
      } catch {
        return json(400, { error: "A valid JSON request body is required." });
      }
      const actorId = input?.actorId;
      const vibeIdx = input?.vibeIdx;
      if (typeof actorId !== "string" || !Number.isInteger(vibeIdx) || vibeIdx < 0) {
        return json(400, { error: "actorId and a non-negative vibeIdx are required." });
      }
      if (input.editorialCopy !== undefined
        && (typeof input.editorialCopy !== "string" || input.editorialCopy.length > 1000)) {
        return json(400, { error: "editorialCopy must be a string of at most 1000 characters." });
      }
      const actor = actorPacks.find(item => item.id === actorId);
      if (!actor?.vibes?.[vibeIdx]) return json(404, { status: "unpublished" });
      const receipt = await publishPreview({
        store: getStore(PREFLIGHT_PREVIEW_STORE, context),
        eligibilityStore: getStore(ELIGIBILITY_STORE, context),
        actor,
        vibeIdx,
        editorialCopy: input.editorialCopy || "",
      });
      if (!receipt) return json(409, { status: "not-approved" });
      return json(200, {
        status: "published",
        preview: publicPreflightPreview(receipt, actor, actor.vibes[vibeIdx]),
      });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 503;
      if (status >= 500) console.error("[publish-preflight-preview] publication failed", error);
      return json(status, { error: status < 500 ? error.message : "Preview publication is unavailable." });
    }
  };
}

const auth = createPublicAuth({ getStore: getBlobStore });

export default async function publishPreflightPreview(request, context) {
  const result = await createPublishPreflightPreviewHandler({
    getStore: (name, ctx) => getBlobStore(name, ctx || context),
    auth,
  })(request, context);
  return new Response(result.body, { status: result.statusCode, headers: result.headers });
}