const DEFAULT_MEDIA_UPLOAD_URL = "https://xhs.justlikekatie.com/api/integrations/media";
const DEFAULT_PLAN_DRAFT_URL = "https://plan.justlikekatie.com/api/drafts";
const DEFAULT_UPLOAD_TIMEOUT_MS = 10_000;
const DEFAULT_PLAN_TIMEOUT_MS = 10_000;
const MAX_REQUEST_BYTES = 10 * 1024 * 1024;
const MAX_PNG_BYTES = 8 * 1024 * 1024;
const MAX_DRAFT_BYTES = 64 * 1024;
const MAX_UPSTREAM_RESPONSE_BYTES = 64 * 1024;
const MAX_ERROR_LENGTH = 500;

const PLATFORMS = new Set(["Weibo", "Rednote", "WeChat", "Douyin"]);
const SERIES = new Set([
  "A·Vibe",
  "B·Style",
  "C·Event",
  "D·BTS",
  "E·Fashion",
  "F·Interview",
  "G·Fan",
  "H·Cdrama",
]);
const TOP_LEVEL_FIELDS = new Set([
  "headline",
  "caption",
  "captionSeed",
  "ctaSeed",
  "platform",
  "series",
  "scheduledDate",
  "status",
  "origin",
  "campaign",
  "event",
  "actor",
  "actorEn",
  "actorId",
  "vibe",
  "vibeEn",
  "mediaUploadStatus",
  "provenance",
  "requirements",
]);
const PROVENANCE_FIELDS = new Set([
  "sourceUrl",
  "sourceImageUrl",
  "sourceContentUrl",
  "itemId",
  "batchKey",
  "cardId",
  "gridId",
  "gridPosition",
  "actorId",
  "actorName",
  "generatedAt",
  "prompt",
  "query",
]);

class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

class UpstreamError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export function createPlanHandoffHandler({
  fetchImpl = fetch,
  env = process.env,
  uploadTimeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS,
  planTimeoutMs = DEFAULT_PLAN_TIMEOUT_MS,
} = {}) {
  return async function planHandoff(req) {
    if (req.method !== "POST") {
      return jsonResponse(405, { error: "Method not allowed" }, { Allow: "POST" });
    }

    try {
      validateSameOrigin(req);
      validateRequestEnvelope(req);

      const form = await readMultipartForm(req);
      const png = form.get("file");
      const draftJson = form.get("draft");
      validatePng(png);
      const draft = parseAndValidateDraft(draftJson);

      let mediaResult;
      try {
        mediaResult = await uploadMedia(png, {
          fetchImpl,
          env,
          timeoutMs: uploadTimeoutMs,
        });
      } catch (error) {
        mediaResult = {
          error: publicError(error, "Share-card upload failed"),
        };
      }

      const registeredDraft = applyMediaResult(draft, mediaResult);
      const result = await registerPlanDraft(registeredDraft, {
        fetchImpl,
        env,
        timeoutMs: planTimeoutMs,
      });

      return jsonResponse(201, {
        ok: true,
        id: result.id,
        mediaUploadStatus: registeredDraft.mediaUploadStatus,
        ...(registeredDraft.mediaUrl ? { mediaUrl: registeredDraft.mediaUrl } : {}),
        ...(registeredDraft.mediaError ? { mediaError: registeredDraft.mediaError } : {}),
      });
    } catch (error) {
      if (error instanceof RequestError || error instanceof UpstreamError) {
        return jsonResponse(error.status, { error: error.message });
      }
      console.error("[plan-handoff] unexpected error", error);
      return jsonResponse(500, { error: "Internal server error" });
    }
  };
}

function validateSameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) {
    throw new RequestError("Origin header is required", 403);
  }

  let requestOrigin;
  try {
    requestOrigin = new URL(req.url).origin;
  } catch {
    throw new RequestError("Invalid request URL", 400);
  }

  if (origin !== requestOrigin) {
    throw new RequestError("Cross-origin handoff requests are not allowed", 403);
  }
}

function validateRequestEnvelope(req) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new RequestError("Content-Type must be multipart/form-data");
  }

  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new RequestError("Handoff request is too large", 413);
  }
}

async function readMultipartForm(req) {
  try {
    return await req.formData();
  } catch {
    throw new RequestError("Request body must contain valid multipart form data");
  }
}

function validatePng(value) {
  if (
    !value
    || typeof value !== "object"
    || typeof value.arrayBuffer !== "function"
    || typeof value.size !== "number"
  ) {
    throw new RequestError("A generated PNG file is required");
  }
  if (value.type !== "image/png") {
    throw new RequestError("Generated media must be an image/png");
  }
  if (value.size < 1 || value.size > MAX_PNG_BYTES) {
    throw new RequestError(`Generated PNG must be between 1 and ${MAX_PNG_BYTES} bytes`, 413);
  }
}

function parseAndValidateDraft(value) {
  if (
    typeof value !== "string"
    || !value
    || new TextEncoder().encode(value).byteLength > MAX_DRAFT_BYTES
  ) {
    throw new RequestError("A valid draft JSON field is required");
  }

  let draft;
  try {
    draft = JSON.parse(value);
  } catch {
    throw new RequestError("Draft field must contain valid JSON");
  }

  if (!isRecord(draft)) throw new RequestError("Draft must be a JSON object");
  rejectUnknownFields(draft, TOP_LEVEL_FIELDS, "draft");
  requireString(draft, "headline", 300);
  requireString(draft, "caption", 10_000, true);
  optionalString(draft, "captionSeed", 2_000);
  optionalString(draft, "ctaSeed", 2_000);
  requireEnum(draft, "platform", PLATFORMS);
  requireEnum(draft, "series", SERIES);
  optionalDate(draft, "scheduledDate");
  requireExact(draft, "status", "Draft");
  requireExact(draft, "origin", "Automated");
  requireExact(draft, "campaign", "Vibe Atlas Rednote Launch");
  requireExact(draft, "event", "Vibe Atlas Rednote Launch");
  requireString(draft, "actor", 200);
  requireString(draft, "actorEn", 200);
  requireString(draft, "actorId", 200);
  requireString(draft, "vibe", 200);
  requireString(draft, "vibeEn", 200);
  requireExact(draft, "mediaUploadStatus", "upload_failed");
  requireString(draft, "requirements", 1_000);
  validateProvenance(draft.provenance);
  return draft;
}

function validateProvenance(value) {
  if (!isRecord(value)) throw new RequestError("Draft provenance is required");
  rejectUnknownFields(value, PROVENANCE_FIELDS, "draft provenance");
  requireHttpUrl(value, "sourceUrl");
  optionalHttpUrl(value, "sourceImageUrl");
  optionalHttpUrl(value, "sourceContentUrl");
  requireString(value, "itemId", 2_048);
  optionalString(value, "batchKey", 500);
  requireString(value, "cardId", 500);
  requireString(value, "gridId", 500);
  if (
    value.gridPosition !== undefined
    && (!Number.isInteger(value.gridPosition) || value.gridPosition < 0 || value.gridPosition > 8)
  ) {
    throw new RequestError("Draft provenance gridPosition must be an integer from 0 to 8");
  }
  requireString(value, "actorId", 200);
  requireString(value, "actorName", 200);
  requireString(value, "generatedAt", 100);
  if (Number.isNaN(Date.parse(value.generatedAt))) {
    throw new RequestError("Draft provenance generatedAt must be an ISO date");
  }
  optionalString(value, "prompt", 5_000);
  optionalString(value, "query", 2_000);
}

async function uploadMedia(png, { fetchImpl, env, timeoutMs }) {
  const token = env.MEDIA_UPLOAD_TOKEN;
  if (!token) throw new Error("MEDIA_UPLOAD_TOKEN is not configured");

  const body = new FormData();
  body.append("file", png, "vibe-atlas-share-card.png");
  const { response, body: responseBody } = await timedJsonFetch(
    fetchImpl,
    env.MEDIA_UPLOAD_URL || DEFAULT_MEDIA_UPLOAD_URL,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    },
    timeoutMs,
    "Share-card upload",
  );
  if (!response.ok) {
    throw new Error(
      stringField(responseBody, "error")
      || `Share-card upload failed (HTTP ${response.status})`,
    );
  }

  const url = stringField(responseBody, "url");
  if (!url || !isDurablePublicUrl(url)) {
    throw new Error("Share-card upload did not return a durable public URL");
  }
  return { url };
}

async function registerPlanDraft(draft, { fetchImpl, env, timeoutMs }) {
  const token = env.PLAN_REGISTRATION_TOKEN;
  if (!token) {
    throw new RequestError("PLAN_REGISTRATION_TOKEN is not configured", 500);
  }

  const { response, body: responseBody } = await timedJsonFetch(
    fetchImpl,
    env.PLAN_DRAFT_URL || DEFAULT_PLAN_DRAFT_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(draft),
    },
    timeoutMs,
    "PLAN draft registration",
  );
  if (!response.ok) {
    throw new UpstreamError(
      stringField(responseBody, "error")
      || `PLAN draft registration failed (HTTP ${response.status})`,
    );
  }

  const id = stringField(responseBody, "id");
  if (!id) throw new UpstreamError("PLAN created a draft without returning its ID");
  return { id };
}

function applyMediaResult(draft, mediaResult) {
  if (mediaResult.url) {
    return {
      ...draft,
      mediaUrl: mediaResult.url,
      mediaUploadStatus: "attached",
      requirements: "Media attached: generated Vibe Atlas share card.",
    };
  }

  const mediaError = truncate(mediaResult.error || "Unknown share-card upload failure");
  return {
    ...draft,
    mediaUploadStatus: "upload_failed",
    mediaError,
    requirements: `Needs media: share-card upload failed — ${mediaError}`,
  };
}

async function timedJsonFetch(fetchImpl, url, init, timeoutMs, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const body = await readBoundedJson(response);
    return { response, body };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new UpstreamError(`${label} timed out`, 504);
    }
    if (error instanceof UpstreamError) throw error;
    throw new UpstreamError(publicError(error, `${label} failed`));
  } finally {
    clearTimeout(timer);
  }
}

async function readBoundedJson(response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPSTREAM_RESPONSE_BYTES) {
    throw new UpstreamError("Upstream response body is too large");
  }

  if (!response.body) return {};
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_UPSTREAM_RESPONSE_BYTES) {
      await reader.cancel();
      throw new UpstreamError("Upstream response body is too large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new UpstreamError(`Upstream endpoint returned invalid JSON (HTTP ${response.status})`);
  }
}

function requireString(object, field, maxLength, allowEmpty = false) {
  const value = object[field];
  if (
    typeof value !== "string"
    || (!allowEmpty && !value.trim())
    || value.length > maxLength
  ) {
    throw new RequestError(`Draft ${field} must be a string of at most ${maxLength} characters`);
  }
}

function optionalString(object, field, maxLength) {
  if (object[field] !== undefined) requireString(object, field, maxLength);
}

function requireEnum(object, field, values) {
  if (!values.has(object[field])) {
    throw new RequestError(`Draft ${field} is not supported`);
  }
}

function requireExact(object, field, expected) {
  if (object[field] !== expected) {
    throw new RequestError(`Draft ${field} must be ${expected}`);
  }
}

function optionalDate(object, field) {
  if (object[field] !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(object[field])) {
    throw new RequestError(`Draft ${field} must use YYYY-MM-DD`);
  }
}

function requireHttpUrl(object, field) {
  if (!isHttpUrl(object[field])) {
    throw new RequestError(`Draft provenance ${field} must be an HTTP(S) URL`);
  }
}

function optionalHttpUrl(object, field) {
  if (object[field] !== undefined) requireHttpUrl(object, field);
}

function isHttpUrl(value) {
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:")
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

function isDurablePublicUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && isPublicHostname(url.hostname);
  } catch {
    return false;
  }
}

function isPublicHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized.endsWith(".local")
    || normalized === "::1"
    || /^(fc|fd|fe8|fe9|fea|feb)/.test(normalized)
  ) {
    return false;
  }

  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return true;
  const [first, second] = octets;
  return !(
    first === 0
    || first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
  );
}

function rejectUnknownFields(object, allowed, label) {
  const unknown = Object.keys(object).find((field) => !allowed.has(field));
  if (unknown) throw new RequestError(`Unknown ${label} field: ${unknown}`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(value, field) {
  return isRecord(value) && typeof value[field] === "string" ? value[field] : "";
}

function publicError(error, fallback) {
  return truncate(error instanceof Error && error.message ? error.message : fallback);
}

function truncate(value) {
  return value.slice(0, MAX_ERROR_LENGTH);
}

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}
