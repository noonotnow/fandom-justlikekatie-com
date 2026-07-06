import { ACTOR_PACKS } from "./lib/actor-packs.js";

// Serves the actor/vibe pack data to the browser as JSON. This is the single
// source of truth (netlify/function./lib/actor-packs.js) also used in-process
// by star-of-day.js — the browser and the server always see the same data,
// nothing to keep in sync by hand.
//
// The data changes rarely (only when actors/vibes are added/edited), so this is
// safe to cache for a few minutes at the edge/browser.
export async function handler() {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300"
    },
    body: JSON.stringify(ACTOR_PACKS)
  };
}
