import { PUBLIC_ACTOR_PACKS, PUBLIC_ACTOR_PACKS_CACHE_CONTROL } from "./lib/actor-packs.js";

// This endpoint intentionally serves a separately projected public contract.
// The private ACTOR_PACKS source remains available to server-side retrieval and
// curation code, but is never serialized into a shared browser/CDN response.
//
export async function handler() {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": PUBLIC_ACTOR_PACKS_CACHE_CONTROL
    },
    body: JSON.stringify(PUBLIC_ACTOR_PACKS)
  };
}
