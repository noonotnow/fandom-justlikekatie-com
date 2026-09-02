import { createHash } from "node:crypto";

export const DEFAULT_MEDIA_URL = "https://media.justlikekatie.com/v1/assets/images";
export const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
export const MAX_RESPONSE_BYTES = 64 * 1024;
export const MEDIA_TIMEOUT_MS = 30_000;

const SUPPORTED_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function registerMediaBytes({
  bytes,
  contentType,
  association,
  filename,
  metadata = {},
  idempotencyKey,
  env = process.env,
  fetchImpl = fetch,
}) {
  if (!env.MEDIA_ASSETS_TOKEN) {
    throw requestError("MEDIA registration is not configured.", 503);
  }
  const normalizedType = String(contentType || "").toLowerCase().split(";")[0].trim();
  const extension = SUPPORTED_TYPES.get(normalizedType);
  const bodyBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!extension) throw requestError("MEDIA upload must be a PNG, JPEG, or WebP image.", 415);
  if (bodyBytes.byteLength < 1 || bodyBytes.byteLength > MAX_MEDIA_BYTES) {
    throw requestError("MEDIA image must be smaller than 8 MB.", 413);
  }
  validateAssociation(association);

  const uploadMetadata = {
    sourceType: metadata.sourceType || "fandom-vibes-publication",
    origin: "fandom-vibes",
    rightsStatus: metadata.rightsStatus || "unknown",
    rightsNotes: metadata.rightsNotes || JSON.stringify({
      schema: "fandom.media-provenance.v2",
      association,
      ...(metadata.provenance ? { provenance: metadata.provenance } : {}),
    }),
    seriesTags: Array.isArray(metadata.seriesTags)
      ? metadata.seriesTags
      : ["Fandom", "Vibe Atlas", "Daily Drop"],
    linkedPostIdentifiers: Array.isArray(metadata.linkedPostIdentifiers)
      ? metadata.linkedPostIdentifiers
      : [`fandom/vibe-atlas/${association.id}/item/${association.itemId}`],
  };
  const upload = new FormData();
  const baseFilename = filename || `fandom-vibe-atlas-${association.itemId}`;
  const uploadFilename = baseFilename.toLowerCase().endsWith(`.${extension}`)
    ? baseFilename
    : `${baseFilename}.${extension}`;
  upload.append(
    "file",
    new File(
      [bodyBytes],
      uploadFilename,
      { type: normalizedType },
    ),
  );
  upload.append("metadata", JSON.stringify(uploadMetadata));

  const response = await fetchImpl(env.MEDIA_ASSETS_URL || DEFAULT_MEDIA_URL, {
    method: "POST",
    signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${env.MEDIA_ASSETS_TOKEN}`,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: upload,
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw requestError(
      payload?.error?.message || payload?.error || "MEDIA registration failed.",
      502,
    );
  }
  return toMediaReference(validateMediaDescriptor(payload?.data, bodyBytes, normalizedType), association);
}

export function toMediaReference(descriptor, association) {
  validateAssociation(association);
  return {
    schemaVersion: 1,
    assetId: descriptor.assetId,
    deliveryUrl: descriptor.deliveryUrl,
    thumbnailUrl: descriptor.thumbnailUrl,
    mimeType: descriptor.mimeType,
    sizeBytes: descriptor.sizeBytes,
    checksum: descriptor.checksum,
    dimensions: descriptor.dimensions,
    association,
  };
}

export function validateMediaDescriptor(descriptor, bytes, contentType) {
  const bodyBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const checksum = createHash("sha256").update(Buffer.from(bodyBytes)).digest("hex");
  if (
    !descriptor
    || descriptor.version !== 1
    || typeof descriptor.assetId !== "string"
    || !UUID_PATTERN.test(descriptor.assetId)
    || descriptor.mediaType !== "image"
    || descriptor.mimeType !== contentType
    || descriptor.sizeBytes !== bodyBytes.byteLength
    || descriptor.checksum !== checksum
    || !isStableMediaUrl(descriptor.deliveryUrl)
    || !isStableMediaUrl(descriptor.thumbnailUrl)
    || !Number.isInteger(descriptor.dimensions?.width)
    || descriptor.dimensions.width < 1
    || !Number.isInteger(descriptor.dimensions?.height)
    || descriptor.dimensions.height < 1
  ) throw requestError("MEDIA returned an invalid or mismatched image descriptor.", 502);
  return descriptor;
}

export function isStableMediaUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function isValidMediaReference(value, expectedAssociation) {
  if (!value || typeof value !== "object") return false;
  const media = value;
  if (
    media.schemaVersion !== 1
    || typeof media.assetId !== "string"
    || !UUID_PATTERN.test(media.assetId)
    || !isStableMediaUrl(media.deliveryUrl)
    || !isStableMediaUrl(media.thumbnailUrl)
    || !SUPPORTED_TYPES.has(media.mimeType)
    || !Number.isInteger(media.sizeBytes)
    || media.sizeBytes < 1
    || typeof media.checksum !== "string"
    || !/^[a-f0-9]{64}$/i.test(media.checksum)
    || !Number.isInteger(media.dimensions?.width)
    || media.dimensions.width < 1
    || !Number.isInteger(media.dimensions?.height)
    || media.dimensions.height < 1
  ) return false;
  if (!isAssociation(media.association)) return false;
  return !expectedAssociation || (
    media.association.type === expectedAssociation.type
    && media.association.id === expectedAssociation.id
    && media.association.itemId === expectedAssociation.itemId
  );
}

export function requestError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function readJson(response) {
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
    throw requestError("MEDIA returned an oversized response.", 502);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw requestError("MEDIA returned invalid JSON.", 502);
  }
}

function validateAssociation(value) {
  if (!isAssociation(value)) throw requestError("MEDIA association is invalid.", 400);
}

function isAssociation(value) {
  return Boolean(
    value
    && typeof value === "object"
    && ["collection", "publication"].includes(value.type)
    && typeof value.id === "string"
    && value.id.length > 0
    && typeof value.itemId === "string"
    && value.itemId.length > 0,
  );
}