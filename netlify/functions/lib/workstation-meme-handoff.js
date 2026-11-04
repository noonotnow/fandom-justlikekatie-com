import { createHash, createHmac } from "node:crypto";

/**
 * Operator-only MemeForge -> CREATE draft handoff.
 *
 * - Admin session only (no operator bearer token): this is Katie's own account.
 * - Registers the finished meme PNG in MEDIA WITHOUT a Collection association.
 * - The third-party still is never registered; its source and rights context travel in `meme`.
 * - sendIntentId is the identity: the same intent replays/updates one Post; a new intent makes another.
 * - A PNG is a source image, not a platform-ready video; the draft is never marked ready to publish.
 */
export const MEME_SEND_SCHEMA = "fandom.meme-send.v1";
const SNAPSHOT_SCHEMA = "fandom.meme-snapshot.v1";
const DELIVERABLE_SCHEMA = "fandom.static-deliverable.v1";
const RECEIPT_STORE = "memeforge-send-receipts";
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const MAX_PNG_BYTES = 8 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;
const DEFAULT_MEDIA_URL = "https://media.justlikekatie.com/v1/assets/images";
const DEFAULT_WORKSTATION_URL = "https://workstation.justlikekatie.com/api/integrations/fandom/projects";
const MEDIA_SOURCE_TYPE = "fandom-memeforge";
const FORMATS = {
  "tiktok-9x16": { platform: "tiktok", width: 1080, height: 1920 },
  "instagram-4x5": { platform: "instagram", width: 1080, height: 1350 },
};
const STILL_KINDS = ["search", "upload"];
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,79}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEXT_LIMITS = { hook: 300, setup: 600, punchline: 600, caption: 2000, hashtags: 500, visualDirection: 1000 };
const locks = new Map();

class MemeSendError extends Error {
  constructor(message, status = 400, stage = "request") {
    super(message);
    this.status = status;
    this.stage = stage;
  }
}

export function memeOutputId(platform, sendIntentId) {
  return `meme-${platform}-${sendIntentId}`;
}

export function createWorkstationMemeHandoffHandler({
  env = process.env,
  fetchImpl = fetch,
  getStore,
  auth,
  now = () => new Date(),
} = {}) {
  return async function workstationMemeHandoff(req, context) {
    if (req.method !== "POST") return json(405, { error: "Method not allowed" }, { Allow: "POST" });
    try {
      assertSameOrigin(req);
      await assertAdmin(req, auth, context);
      requireConfiguration(env);
      const request = validateRequest(await readBody(req));
      const store = getStore(RECEIPT_STORE);
      return await withLock(request.sendIntentId, () => handle(request, { env, fetchImpl, store, now, requestUrl: req.url }));
    } catch (error) {
      if (error instanceof MemeSendError) return json(error.status, { error: error.message, stage: error.stage });
      console.error("[workstation-meme-handoff] unexpected error", error);
      return json(500, { error: "Internal server error", stage: "server" });
    }
  };
}

async function handle(request, { env, fetchImpl, store, now, requestUrl }) {
  const png = Buffer.from(request.png, "base64");
  const dims = pngDimensions(png);
  const format = FORMATS[request.format];
  if (dims.width !== format.width || dims.height !== format.height) {
    throw new MemeSendError(`Image must be ${format.width}x${format.height} for ${request.format}.`, 400, "request");
  }
  const checksum = sha256(png);
  const contentDigest = sha256(canonicalJson({ ...request.content, checksum }));

  const key = `intent/${request.sendIntentId}`;
  const prior = await readRecord(store, key);
  if (prior && prior.memeGroupId !== request.memeGroupId) {
    throw new MemeSendError("This send intent already belongs to a different meme.", 409, "request");
  }
  const sameContent = Boolean(prior && prior.contentDigest === contentDigest && prior.receipt);
  if (sameContent && prior.backup?.state === "verified") {
    // Exact retry of a fully backed-up send: replay the stored receipt, no upstream write, no new Post.
    return json(200, { receipt: { ...prior.receipt, disposition: "replayed" }, backup: prior.backup, assetId: prior.assetId });
  }
  // Same content with an unverified backup re-sends the SAME envelope version (CREATE replays it and
  // re-runs the idempotent backup). Changed content is an update: version + 1 with compare-and-swap.
  const sourceVersion = !prior ? 1 : sameContent ? prior.sourceVersion : prior.sourceVersion + 1;
  const expectedSourceVersion = !prior ? null : sameContent ? prior.expectedSourceVersion ?? null : prior.sourceVersion;
  const generatedAt = sameContent && prior.generatedAt ? new Date(prior.generatedAt) : now();

  const registration = await registerMedia(png, request, checksum, dims, { env, fetchImpl, requestUrl });
  const envelope = buildEnvelope(request, registration, sourceVersion, expectedSourceVersion, generatedAt);
  const payload = await sendToWorkstation(envelope, { env, fetchImpl, timestampDate: now() });
  const receipt = validateReceipt(payload, envelope);
  const backup = sanitizeBackup(payload.backup);
  await store.setJSON(key, {
    memeGroupId: request.memeGroupId,
    sendIntentId: request.sendIntentId,
    format: request.format,
    sourceVersion,
    expectedSourceVersion,
    generatedAt: generatedAt.toISOString(),
    contentDigest,
    assetId: registration.assetId,
    receipt,
    backup,
    updatedAt: now().toISOString(),
  });
  return json(receipt.disposition === "created" ? 201 : 200, { receipt, ...(backup ? { backup } : {}), assetId: registration.assetId });
}

function validateRequest(body) {
  if (!isRecord(body) || body.schema !== MEME_SEND_SCHEMA) throw new MemeSendError("Unsupported MemeForge send schema.");
  const allowed = ["schema", "memeGroupId", "sendIntentId", "format", "hook", "setup", "punchline", "caption", "hashtags", "visualDirection", "framing", "stillSource", "png"];
  const extra = Object.keys(body).filter(key => !allowed.includes(key));
  if (extra.length) throw new MemeSendError(`Unexpected field: ${extra[0]}.`);
  for (const id of ["memeGroupId", "sendIntentId"]) {
    if (typeof body[id] !== "string" || !ID_PATTERN.test(body[id])) throw new MemeSendError(`${id} is invalid.`);
  }
  if (!Object.hasOwn(FORMATS, body.format)) throw new MemeSendError("Unsupported meme format.");
  const content = {};
  for (const [name, limit] of Object.entries(TEXT_LIMITS)) {
    const value = body[name];
    if (value === undefined && (name === "visualDirection")) continue;
    if (typeof value !== "string" || value.length > limit) throw new MemeSendError(`${name} is invalid.`);
    content[name] = value.trim();
  }
  if (!content.caption) throw new MemeSendError("A caption is required to send a draft.");
  const still = body.stillSource;
  if (!isRecord(still) || !STILL_KINDS.includes(still.kind)) throw new MemeSendError("stillSource.kind must be search or upload.");
  const stillSource = { kind: still.kind };
  for (const name of ["title", "publisher", "query"]) {
    if (still[name] !== undefined) {
      if (typeof still[name] !== "string" || still[name].length > 500) throw new MemeSendError(`stillSource.${name} is invalid.`);
      stillSource[name] = still[name].trim();
    }
  }
  if (still.link !== undefined) {
    if (typeof still.link !== "string" || !isHttpsUrl(still.link)) throw new MemeSendError("stillSource.link must be an https URL.");
    stillSource.link = still.link;
  }
  let framing;
  if (body.framing !== undefined) {
    const f = body.framing;
    if (!isRecord(f) || typeof f.framing !== "string" || typeof f.textPlacement !== "string"
      || !Number.isFinite(f.focusX) || !Number.isFinite(f.focusY)) throw new MemeSendError("framing is invalid.");
    framing = { framing: f.framing.slice(0, 40), focusX: f.focusX, focusY: f.focusY, textPlacement: f.textPlacement.slice(0, 40) };
  }
  if (typeof body.png !== "string" || body.png.length > Math.ceil(MAX_PNG_BYTES * 4 / 3) + 8) throw new MemeSendError("Image is missing or too large.", 413);
  return {
    memeGroupId: body.memeGroupId,
    sendIntentId: body.sendIntentId,
    format: body.format,
    content: { ...content, stillSource, ...(framing ? { framing } : {}) },
    png: body.png,
    ...content,
    stillSource,
    framing,
  };
}

function pngDimensions(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 33 || bytes.length > MAX_PNG_BYTES || signature.some((b, i) => bytes[i] !== b)) {
    throw new MemeSendError("Image must be a PNG under 8 MB.", 400, "request");
  }
  if (bytes.toString("ascii", 12, 16) !== "IHDR") throw new MemeSendError("Image is not a valid PNG.", 400, "request");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function registerMedia(png, request, checksum, dims, { env, fetchImpl, requestUrl }) {
  const filename = `memeforge-${request.format}-${checksum.slice(0, 12)}.png`;
  const metadata = {
    sourceType: MEDIA_SOURCE_TYPE,
    sourceUrl: new URL("/memeforge/c-drama", requestUrl).toString(),
    origin: "fandom-vibes",
    rightsStatus: "unknown",
    rightsNotes: JSON.stringify({
      schema: "fandom.media-provenance.v2",
      source: "Fandom MemeForge",
      note: "Finished meme composite. Rights for the underlying still are recorded on the Post, not here.",
    }),
    seriesTags: ["Fandom", "MemeForge"],
    linkedPostIdentifiers: [`fandom/meme/${request.memeGroupId}`, `fandom/draft/${request.sendIntentId}`],
  };
  const body = new FormData();
  body.append("file", new File([png], filename, { type: "image/png" }));
  body.append("metadata", JSON.stringify(metadata));
  let response;
  try {
    response = await fetchImpl(env.MEDIA_ASSETS_URL || DEFAULT_MEDIA_URL, {
      method: "POST",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${env.MEDIA_ASSETS_TOKEN}` },
      body,
    });
  } catch {
    throw new MemeSendError("MEDIA registration failed.", 502, "media");
  }
  const payload = await readJson(response, "MEDIA");
  if (!response.ok) throw new MemeSendError("MEDIA registration failed.", 502, "media");
  const d = payload?.data;
  if (
    !isRecord(d) || d.version !== 1 || typeof d.assetId !== "string" || !UUID_PATTERN.test(d.assetId)
    || d.mediaType !== "image" || d.mimeType !== "image/png" || d.sizeBytes !== png.length
    || d.checksum !== checksum || !isHttpsUrl(d.deliveryUrl) || !isHttpsUrl(d.thumbnailUrl)
    || d.dimensions?.width !== dims.width || d.dimensions?.height !== dims.height
  ) throw new MemeSendError("MEDIA returned an invalid or mismatched image descriptor.", 502, "media");
  // MEDIA keeps one asset per SHA-256 and the first uploader's labels win. Detect that rather than assume.
  const deduplicated = d.sourceType !== undefined && d.sourceType !== MEDIA_SOURCE_TYPE;
  return {
    assetId: d.assetId, checksum, filename, deliveryUrl: d.deliveryUrl, thumbnailUrl: d.thumbnailUrl,
    sizeBytes: d.sizeBytes, dimensions: dims, deduplicated,
    ...(typeof d.rightsStatus === "string" ? { returnedRightsStatus: d.rightsStatus } : {}),
  };
}

function buildEnvelope(request, media, sourceVersion, expectedSourceVersion, generatedAt) {
  const format = FORMATS[request.format];
  const platform = format.platform;
  const outputId = memeOutputId(platform, request.sendIntentId);
  const cardId = `meme-${media.checksum.slice(0, 16)}`;
  const iso = generatedAt.toISOString();
  const hashtags = request.hashtags.split(/\s+/).map(tag => tag.replace(/^#/, "")).filter(Boolean).slice(0, 20);
  const rightsPosture = request.stillSource.kind === "upload" ? "uploader-asserted" : "not-cleared";
  const rightsNote = rightsPosture === "uploader-asserted"
    ? "Still was uploaded by the operator; rights are asserted by them and unverified."
    : "Still came from a search result: a lead, not clearance.";
  return {
    schemaVersion: DELIVERABLE_SCHEMA,
    workflow: "direct",
    origin: "fandom-vibes",
    outputId,
    outputKind: "live_card",
    renderVariant: `memeforge-c-drama-${request.format}`,
    renderVersion: 1,
    sourceVersion,
    expectedSourceVersion,
    directOrigin: { kind: "card", id: request.memeGroupId },
    deliverableId: outputId,
    starDateShanghai: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(generatedAt),
    route: "/memeforge/c-drama",
    grid: "single",
    generatedAt: iso,
    actor: { id: "memeforge", label: "MemeForge" },
    vibe: { id: "c-drama-meme", label: "C-drama meme" },
    anchor: request.hook.slice(0, 120) || "MemeForge",
    sourceCards: [{
      id: cardId,
      order: 0,
      imageUrl: media.deliveryUrl,
      sourceUrl: new URL("/memeforge/c-drama", "https://fandom.justlikekatie.com").toString(),
      title: `${request.setup} / ${request.punchline}`.slice(0, 200),
      provenance: "MemeForge export; still source and rights are recorded in the meme snapshot",
      media: {
        schemaVersion: 1,
        assetId: media.assetId,
        deliveryUrl: media.deliveryUrl,
        thumbnailUrl: media.thumbnailUrl,
        mimeType: "image/png",
        sizeBytes: media.sizeBytes,
        checksum: media.checksum,
        dimensions: media.dimensions,
        association: { type: "collection", id: "c-drama", itemId: `memeforge-send-${request.sendIntentId}` },
      },
    }],
    concept: "Meme",
    angles: [],
    draft: {
      title: request.hook.slice(0, 120) || "MemeForge draft",
      caption: request.caption,
      provenance: "MemeForge",
      captionSeed: request.caption,
      tags: hashtags,
      series: [],
      type: "static",
    },
    publicationBrief: {
      type: "static",
      format: "Static",
      series: [],
      distribution: { primaryPlatform: platform, platforms: [platform] },
      requiredAssets: ["cover"],
      captionBrief: request.caption,
      tags: hashtags,
      requirements: [],
    },
    mediaAttachments: [{
      assetId: media.assetId,
      checksum: media.checksum,
      url: media.deliveryUrl,
      filename: media.filename,
      nameTag: "MemeForge",
      mimeType: "image/png",
      role: "cover",
      position: 0,
      sourceCardIds: [cardId],
      provenance: {
        origin: "fandom-vibes",
        sourceKind: "card",
        sourceId: request.memeGroupId,
        deliverableId: outputId,
        generatedAt: iso,
      },
    }],
    meme: {
      schema: SNAPSHOT_SCHEMA,
      memeGroupId: request.memeGroupId,
      sendIntentId: request.sendIntentId,
      format: request.format,
      hook: request.hook,
      setup: request.setup,
      punchline: request.punchline,
      caption: request.caption,
      hashtags: request.hashtags,
      ...(request.visualDirection ? { visualDirection: request.visualDirection } : {}),
      ...(request.framing ? { framing: request.framing } : {}),
      stillSource: request.stillSource,
      rights: { posture: rightsPosture, note: rightsNote },
      registration: {
        assetId: media.assetId,
        checksum: media.checksum,
        deduplicated: media.deduplicated,
        ...(media.returnedRightsStatus ? { returnedRightsStatus: media.returnedRightsStatus } : {}),
      },
    },
  };
}

async function sendToWorkstation(envelope, { env, fetchImpl, timestampDate }) {
  const rawBody = JSON.stringify(envelope);
  const timestamp = String(Math.floor(timestampDate.getTime() / 1000));
  const idempotencyKey = `fandom/direct/card/${envelope.directOrigin.id}/${envelope.outputId}`;
  const signature = createHmac("sha256", env.WORKSTATION_FANDOM_HMAC_SECRET)
    .update(`${timestamp}\n${idempotencyKey}\n${sha256(rawBody)}`)
    .digest("hex");
  let response;
  try {
    response = await fetchImpl(env.WORKSTATION_FANDOM_INTAKE_URL || DEFAULT_WORKSTATION_URL, {
      method: "POST",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "X-Fandom-Key-Id": env.WORKSTATION_FANDOM_HMAC_KEY_ID,
        "X-Fandom-Timestamp": timestamp,
        "X-Fandom-Signature": `v1=${signature}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: rawBody,
    });
  } catch {
    throw new MemeSendError("Workstation intake failed.", 502, "workstation");
  }
  const payload = await readJson(response, "Workstation");
  if (!response.ok) {
    throw new MemeSendError(
      response.status === 409
        ? "CREATE changed this draft since your last send; reload before updating."
        : `CREATE rejected the draft (HTTP ${response.status}).`,
      response.status === 409 ? 409 : 502,
      "workstation",
    );
  }
  return payload;
}

function validateReceipt(payload, envelope) {
  const r = isRecord(payload?.receipt) ? payload.receipt : payload;
  if (
    !isRecord(r) || r.deliverableId !== envelope.deliverableId || typeof r.postId !== "string" || !r.postId
    || !isHttpsUrl(r.postUrl) || r.status !== "Draft" || r.sourceVersion !== envelope.sourceVersion
    || !["created", "replayed", "updated"].includes(r.disposition)
  ) throw new MemeSendError("CREATE returned an invalid draft receipt.", 502, "workstation");
  return {
    deliverableId: r.deliverableId,
    postId: r.postId,
    postUrl: r.postUrl,
    ...(typeof r.deepLink === "string" && isHttpsUrl(r.deepLink) ? { deepLink: r.deepLink } : {}),
    status: "Draft",
    sourceVersion: r.sourceVersion,
    disposition: r.disposition,
    mediaSyncState: r.mediaSyncState === "operator-diverged" ? "operator-diverged" : "synced",
    warnings: Array.isArray(r.warnings) ? r.warnings.filter(w => typeof w === "string").slice(0, 20) : [],
  };
}

function sanitizeBackup(value) {
  if (!isRecord(value) || !["verified", "missing", "mismatch", "failed"].includes(value.state)) return undefined;
  return {
    state: value.state,
    assetId: typeof value.assetId === "string" ? value.assetId : undefined,
    detail: typeof value.detail === "string" ? value.detail.slice(0, 300) : "",
    checkedAt: typeof value.checkedAt === "string" ? value.checkedAt : undefined,
  };
}

function requireConfiguration(env) {
  if (!env.MEDIA_ASSETS_TOKEN) throw new MemeSendError("MEDIA_ASSETS_TOKEN is not configured.", 503, "config");
  if (!env.WORKSTATION_FANDOM_HMAC_KEY_ID || !env.WORKSTATION_FANDOM_HMAC_SECRET) {
    throw new MemeSendError("CREATE handoff credentials are not configured.", 503, "config");
  }
}

function assertSameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) throw new MemeSendError("Cross-origin sends are not allowed.", 403);
}

async function assertAdmin(req, auth, context) {
  if (!auth) throw new MemeSendError("Admin authorization is required.", 401);
  try {
    await auth.authenticateAdmin(req, context);
  } catch (error) {
    if (error?.status === 401) throw new MemeSendError("Sign in again before sending to CREATE.", 401);
    if (error?.status === 403) throw new MemeSendError("An admin account is required to send to CREATE.", 403);
    throw new MemeSendError("Could not verify your admin session. Try again.", 503);
  }
}

async function readBody(req) {
  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    throw new MemeSendError("Content-Type must be application/json.");
  }
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_REQUEST_BYTES) throw new MemeSendError("Request is too large.", 413);
  try { return JSON.parse(text); } catch { throw new MemeSendError("Request must be valid JSON."); }
}

async function readJson(response, label) {
  const text = await response.text();
  if (Buffer.byteLength(text) > 256 * 1024) throw new MemeSendError(`${label} response was too large.`, 502, label.toLowerCase());
  try { return text ? JSON.parse(text) : {}; } catch { throw new MemeSendError(`${label} returned invalid JSON.`, 502, label.toLowerCase()); }
}

async function readRecord(store, key) {
  try { return (await store.get(key, { type: "json", consistency: "strong" })) ?? null; }
  catch { throw new MemeSendError("Send history is unavailable; try again.", 503, "storage"); }
}

async function withLock(key, work) {
  while (locks.has(key)) await locks.get(key).catch(() => {});
  const run = work();
  locks.set(key, run);
  try { return await run; } finally { if (locks.get(key) === run) locks.delete(key); }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function isHttpsUrl(value) { try { return new URL(value).protocol === "https:"; } catch { return false; } }
function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });
}
