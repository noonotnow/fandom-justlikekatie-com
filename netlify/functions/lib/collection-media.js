import { createHash } from "node:crypto";
import { json } from "./public-auth.js";

const DEFAULT_MEDIA_URL = "https://media.justlikekatie.com/v1/assets/images";
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;
const COLLECTION_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ITEM_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;
const SUPPORTED_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

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
      const extension = SUPPORTED_TYPES.get(contentType);
      if (!extension) return json(415, { error: "Upload must be a PNG, JPEG, or WebP image." });
      const declared = Number(req.headers.get("content-length") || 0);
      if (declared > MAX_MEDIA_BYTES) return json(413, { error: "Collection image is too large." });
      const bytes = await req.arrayBuffer();
      if (bytes.byteLength < 1) return json(400, { error: "Collection image is empty." });
      if (bytes.byteLength > MAX_MEDIA_BYTES) return json(413, { error: "Collection image is too large." });

      const association = { type: "collection", id: collectionId, itemId };
      const metadata = {
        sourceType: "fandom-collection-upload",
        origin: "fandom-vibes",
        rightsStatus: "unknown",
        rightsNotes: JSON.stringify({
          schema: "fandom.media-provenance.v2",
          association,
        }),
        seriesTags: ["Fandom", "Collection", `collection:${collectionId}`],
        linkedPostIdentifiers: [
          `fandom/collection/${collectionId}`,
          `fandom/collection/${collectionId}/item/${itemId}`,
        ],
      };
      const body = new FormData();
      body.append("file", new File(
        [bytes],
        `fandom-${collectionId}-${itemId}.${extension}`,
        { type: contentType },
      ));
      body.append("metadata", JSON.stringify(metadata));

      const response = await fetchImpl(env.MEDIA_ASSETS_URL || DEFAULT_MEDIA_URL, {
        method: "POST",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${env.MEDIA_ASSETS_TOKEN}` },
        body,
      });
      const payload = await readJson(response);
      if (!response.ok) {
        return json(502, { error: payload?.error?.message || payload?.error || "MEDIA registration failed." });
      }
      const descriptor = validateDescriptor(payload?.data, bytes, contentType);
      return json(200, {
        media: {
          schemaVersion: 1,
          assetId: descriptor.assetId,
          deliveryUrl: descriptor.deliveryUrl,
          thumbnailUrl: descriptor.thumbnailUrl,
          mimeType: descriptor.mimeType,
          sizeBytes: descriptor.sizeBytes,
          checksum: descriptor.checksum,
          dimensions: descriptor.dimensions,
          association,
        },
      });
    } catch (error) {
      const status = error?.status || (error instanceof TypeError ? 400 : 500);
      if (status === 500) console.error("[collection-media] request failed", error);
      return json(status, { error: status === 500 ? "Collection media registration failed." : error.message });
    }
  };
}

function validateDescriptor(descriptor, bytes, contentType) {
  const checksum = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  if (
    !descriptor
    || descriptor.version !== 1
    || typeof descriptor.assetId !== "string"
    || descriptor.mediaType !== "image"
    || descriptor.mimeType !== contentType
    || descriptor.sizeBytes !== bytes.byteLength
    || descriptor.checksum !== checksum
    || !isStableMediaUrl(descriptor.deliveryUrl)
    || !isStableMediaUrl(descriptor.thumbnailUrl)
    || !Number.isInteger(descriptor.dimensions?.width)
    || !Number.isInteger(descriptor.dimensions?.height)
  ) throw upstreamError("MEDIA returned an invalid or mismatched image descriptor.");
  return descriptor;
}

async function readJson(response) {
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw upstreamError("MEDIA returned an oversized response.");
  try { return JSON.parse(text); } catch { throw upstreamError("MEDIA returned invalid JSON."); }
}

function upstreamError(message) {
  const error = new Error(message);
  error.status = 502;
  return error;
}

function isStableMediaUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function validateSameOrigin(req) {
  if (req.headers.get("origin") !== new URL(req.url).origin) {
    const error = new Error("Cross-origin requests are not allowed.");
    error.status = 403;
    throw error;
  }
}