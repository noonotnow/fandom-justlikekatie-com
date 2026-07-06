import { getStore } from "@netlify/blobs";

// Wrapper that opens a Netlify Blobs store, preferring the automatic
// V2-function context (`context.blobs`) which Netlify reliably injects with
// live site/token credentials.
//
// Background: classic (V1, `exports.handler(event, context)`) Netlify
// Functions do NOT get automatic Blobs credentials — confirmed via a deploy-
// preview diagnostic showing no `NETLIFY_BLOBS_CONTEXT` env var, only
// `SITE_ID` + `NETLIFY_FUNCTIONS_TOKEN` (the latter is NOT a valid Blobs
// token — using it manually returned a 401 from the Blobs API). V2 functions
// (`export default async (req, context) => {}`) get `context.blobs` injected
// automatically per Netlify's docs, so star-of-day.js uses the V2 signature
// and this helper prefers `context.blobs.getStore(name)` when available,
// falling back to the zero-config `getStore(name)` (which reads
// `NETLIFY_BLOBS_CONTEXT` if some future runtime provides it) otherwise.
export function getBlobStore(name, context) {
  if (context && context.blobs && typeof context.blobs.getStore === "function") {
    return context.blobs.getStore(name);
  }
  return getStore(name);
}
