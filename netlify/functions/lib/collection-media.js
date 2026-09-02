import { json } from "./public-auth.js";
import {
  MAX_MEDIA_BYTES,
  registerMediaBytes,
} from "./media-asset.js";

const COLLECTION_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ITEM_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;

export function createCollectionMediaHandler({
  auth,
  env = process.env,
  fetchImpl = fetch,
}) {
  return async (req, context) => {
    if (req.method !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
    try {
      validateSameOrigin(req);
      await auth.authenticate(req, context);
      if (!env.MEDIA_ASSETS_TOKEN) return json(503, { error: "MEDIA registration is not configured." });

      const url = new URL(req.url);
      const collectionId = url.searchParams.get("collectionId") || "";
      const itemId = url.searchParams.get("itemId") || "";
      if (!COLLECTION_ID_RE.test(collectionId) || !ITEM_ID_RE.test(itemId)) {
        return json(400, { error: "Invalid collection media association." });
      }

      const contentType = (req.headers.get("content-type") || "").toLowerCase().split(";")[0].trim();
      const declared = Number(req.headers.get("content-length") || 0);
      if (declared > MAX_MEDIA_BYTES) return json(413, { error: "Collection image is too large." });
      const bytes = await req.arrayBuffer();
      if (bytes.byteLength < 1) return json(400, { error: "Collection image is empty." });
      if (bytes.byteLength > MAX_MEDIA_BYTES) return json(413, { error: "Collection image is too large." });

      const association = { type: "collection", id: collectionId, itemId };
      const media = await registerMediaBytes({
        bytes,
        contentType,
        association,
        filename: `fandom-${collectionId}-${itemId}`,
        metadata: {
          sourceType: "fandom-collection-upload",
          seriesTags: ["Fandom", "Collection", `collection:${collectionId}`],
          linkedPostIdentifiers: [
            `fandom/collection/${collectionId}`,
            `fandom/collection/${collectionId}/item/${itemId}`,
          ],
        },
        env,
        fetchImpl,
      });
      return json(200, {
        media,
      });
    } catch (error) {
      const status = error?.status || (error instanceof TypeError ? 400 : 500);
      if (status === 500) console.error("[collection-media] request failed", error);
      return json(status, { error: status === 500 ? "Collection media registration failed." : error.message });
    }
  };
}

function validateSameOrigin(req) {
  if (req.headers.get("origin") !== new URL(req.url).origin) {
    const error = new Error("Cross-origin requests are not allowed.");
    error.status = 403;
    throw error;
  }
}
