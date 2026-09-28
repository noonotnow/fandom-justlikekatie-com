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
export function getBlobStore(name, context, options = {}) {
  const input = Object.keys(options).length > 0 ? { name, ...options } : name;
  if (context && context.blobs && typeof context.blobs.getStore === "function") {
    // Netlify's injected context API accepts the store name, while the
    // package-level helper also accepts an options object. Store-operation
    // options such as consistency belong on get/set/list calls.
    return context.blobs.getStore(name);
  }
  return getStore(input);
}

export async function getWithResolvedEtag(store, key, options = {}) {
  const readOptions = {
    ...options,
    consistency: "strong",
  };
  let entry = await store.getWithMetadata(key, readOptions);
  if (!entry || entry.etag) return entry;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const before = await exactKeyEtag(store, key);
    if (!before) return entry;
    const fresh = await store.getWithMetadata(key, readOptions);
    if (!fresh || fresh.etag) return fresh;
    const after = await exactKeyEtag(store, key);
    if (before === after) return { ...fresh, etag: after };
    entry = fresh;
  }
  return entry;
}

async function exactKeyEtag(store, key) {
  if (typeof store.getMetadata === "function") {
    const metadata = await store.getMetadata(key, { consistency: "strong" });
    if (metadata?.etag) return metadata.etag;
  }
  if (typeof store.list !== "function") return null;

  const listing = await store.list({ prefix: key });
  const exact = listing?.blobs?.find(candidate => candidate.key === key);
  return exact?.etag || null;
}
