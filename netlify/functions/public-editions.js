import { getBlobStore } from "./lib/blob-store.js";
import {
  publicActorDirectory,
  publicActorSlug,
  publicEditionPreview,
  readPublicationManifests,
} from "./lib/publication-manifest.js";

const PUBLIC_CACHE = "public, max-age=300, stale-while-revalidate=3600";

function jsonResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": PUBLIC_CACHE,
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Public, read-only projection of immutable approved publication manifests.
 * This endpoint intentionally never falls back to star-of-day cache payloads:
 * those payloads are private retrieval products and are not safe to share.
 */
export function createPublicEditionsHandler({
  getStore = getBlobStore,
} = {}) {
  return async (request, context) => {
    if (request.method && request.method !== "GET") {
      return jsonResponse(405, { error: "Method not allowed" }, { Allow: "GET" });
    }
    const url = new URL(request.url || "https://fandom.local/.netlify/functions/public-editions");
    const { manifests, inventory } = await readPublicationManifests(
      getStore("star-of-day", context),
    );
    if (!inventory.complete) {
      return jsonResponse(503, { error: "Public edition inventory is not ready." }, {
        "Cache-Control": "no-store",
      });
    }

    const date = url.searchParams.get("date");
    const actor = url.searchParams.get("actor");
    if (date !== null || actor !== null) {
      const edition = manifests
        .filter(manifest => date === null || manifest.publicationDate === date)
        .filter(manifest => actor === null || publicActorSlug(manifest.actor) === actor)
        .map(publicEditionPreview)
        .find(Boolean);
      return edition
        ? jsonResponse(200, edition)
        : jsonResponse(404, { error: "That public edition is not available." });
    }

    return jsonResponse(200, {
      kind: "vibe-atlas-public-actor-directory",
      actors: publicActorDirectory(manifests),
    });
  };
}

// Netlify injects the Blobs context for V2 Web Request/Response functions.
export default async function publicEditions(request, context) {
  const result = await createPublicEditionsHandler()(request, context);
  return new Response(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}