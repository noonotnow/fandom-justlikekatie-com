import { getBlobStore } from "./lib/blob-store.js";
import { ACTOR_PACKS } from "./lib/actor-packs.js";
import { ELIGIBILITY_STORE } from "./lib/actor-eligibility.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { inspectApprovedPreflightCard, inspectRetainedPreflightCandidate } from "./lib/preflight-preview.js";

const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

export function createPreflightPreviewCardHealthHandler({
  getStore = getBlobStore,
  actorPacks = ACTOR_PACKS,
  auth = createPublicAuth({ getStore }),
  inspectCard = inspectApprovedPreflightCard,
  inspectCandidate = inspectRetainedPreflightCandidate,
} = {}) {
  return async (request, context) => {
    if (request.method && request.method !== "GET") return json(405, { error: "Method not allowed." });
    try {
      await auth.authenticateAdmin(request, context);
      const query = new URL(request.url).searchParams;
      const actorId = query.get("actorId");
      const vibeIdx = Number(query.get("vibeIdx"));
      const position = Number(query.get("position"));
      const runId = query.get("runId");
      const candidateId = query.get("candidateId");
      if (!/^(0|[1-9]\d*)$/.test(query.get("vibeIdx") || "")
        || (runId || candidateId
          ? !runId || !candidateId || runId.length > 160 || candidateId.length > 160
          : !/^[0-8]$/.test(query.get("position") || "")))
        return json(400, { error: "Invalid pairing or position." });
      const actor = actorPacks.find(item => item.id === actorId);
      if (!actor?.vibes?.[vibeIdx]) return json(404, { error: "Pairing not found." });
      const eligibilityStore = getStore(ELIGIBILITY_STORE, context);
      if (runId && candidateId) {
        const result = await inspectCandidate({ eligibilityStore, actor, vibeIdx, runId, candidateId });
        if (!result || result.status === "not-current") return json(409, { status: "not-current" });
        return json(200, { actorId, vibeIdx, runId, candidateId, status: result.status });
      }
      const result = await inspectCard({ eligibilityStore, actor, vibeIdx, position });
      if (!result || result.status === "not-approved") return json(409, { status: "not-approved" });
      return json(200, {
        actorId, vibeIdx, position, status: result.status,
        runId: result.runId, boardHash: result.boardHash,
      });
    } catch (error) {
      const status = error?.status === 401 || error?.status === 403 ? error.status : 503;
      if (status === 503) console.error("[preflight-preview-card-health] check failed", error);
      return json(status, { error: status === 503 ? "Card health could not be checked." : "Access denied." });
    }
  };
}

const auth = createPublicAuth({ getStore: getBlobStore });

export default async function preflightPreviewCardHealth(request, context) {
  const result = await createPreflightPreviewCardHealthHandler({
    getStore: (name, ctx) => getBlobStore(name, ctx || context),
    auth,
  })(request, context);
  return new Response(result.body, { status: result.statusCode, headers: result.headers });
}