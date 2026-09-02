import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { get as httpsGet } from "node:https";
import { isIP } from "node:net";
import {
  isValidMediaReference,
  registerMediaBytes,
  requestError,
} from "./media-asset.js";

export const GRID_MANIFEST_VERSION = "v1";
export const GRID_MANIFEST_PREFIX = `vibeAtlas:grid-manifest:${GRID_MANIFEST_VERSION}:`;
export const GRID_PENDING_PREFIX = `vibeAtlas:grid-pending:${GRID_MANIFEST_VERSION}:`;
const REQUIRED_CARD_COUNT = 9;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PUBLICATION_LOCK_TTL_MS = 10 * 60 * 1000;
const PUBLICATION_LOCK_PREFIX = `vibeAtlas:grid-lock:${GRID_MANIFEST_VERSION}:`;

export const gridManifestKey = date => `${GRID_MANIFEST_PREFIX}${date}`;
export const gridPendingKey = date => `${GRID_PENDING_PREFIX}${date}`;

export async function materializePublicationManifest({
  store,
  date,
  actor,
  vibe,
  board,
  provenance = {},
  env = process.env,
  fetchImpl = fetch,
  resolveHost = lookup,
  now = () => new Date().toISOString(),
}) {
  validatePublicationInput(date, actor, vibe, board);
  const boardHashValue = boardHash(board);
  const manifestKey = gridManifestKey(date);
  const existingManifest = await store.get(manifestKey, {
    type: "json",
    consistency: "strong",
  });
  if (existingManifest) {
    if (!isGridManifest(existingManifest) || existingManifest.boardHash !== boardHashValue) {
      throw requestError("That publication date already contains a different immutable board.", 409);
    }
    return { manifest: existingManifest, payload: manifestPayload(existingManifest) };
  }
  const lock = await acquirePublicationLock(store, date, boardHashValue, now);
  try {
  const racedManifest = await store.get(manifestKey, {
    type: "json",
    consistency: "strong",
  });
  if (racedManifest) {
    if (!isGridManifest(racedManifest) || racedManifest.boardHash !== boardHashValue) {
      throw requestError("That publication date already contains a different immutable board.", 409);
    }
    return { manifest: racedManifest, payload: manifestPayload(racedManifest) };
  }

  const pendingKey = gridPendingKey(date);
  const existingPending = await store.get(pendingKey, {
    type: "json",
    consistency: "strong",
  });
  if (existingPending?.boardHash && existingPending.boardHash !== boardHashValue) {
    throw requestError("A different board is already being reconciled for that publication date.", 409);
  }

  const associationId = `vibe-atlas:daily-drop:${date}`;
  const assets = Array.isArray(existingPending?.assets)
    ? existingPending.assets.filter(asset => (
      Number.isInteger(asset?.position)
      && asset.position >= 0
      && asset.position < REQUIRED_CARD_COUNT
      && isValidPublicationAsset(asset, asset.position, associationId)
    ))
    : [];
  const cards = Array(REQUIRED_CARD_COUNT).fill(null);
  for (const asset of assets) {
    const candidate = board.candidates[asset.position];
    if (asset.candidateId === candidate.candidateId && asset.sourceUrl === candidate.thumbnail) {
      cards[asset.position] = asset;
    }
  }
  const missingPositions = cards
    .map((card, position) => card ? null : position)
    .filter(position => position !== null);
  await writePending(store, pendingKey, {
    schemaVersion: 1,
    state: "pending",
    date,
    boardHash: boardHashValue,
    assets: cards.filter(Boolean),
    intents: missingPositions.map(position => ({
      position,
      candidateId: board.candidates[position].candidateId,
      idempotencyKey: publicationAssetIdempotencyKey(date, boardHashValue, position),
    })),
    updatedAt: now(),
  });
  const attempts = await Promise.allSettled(missingPositions.map(position =>
    materializePublicationAsset({
      position,
      candidate: board.candidates[position],
      associationId,
      date,
      boardHashValue,
      actor,
      vibe,
      provenance,
      env,
      fetchImpl,
      resolveHost,
    })));
  attempts.forEach((attempt, index) => {
    if (attempt.status === "fulfilled") cards[missingPositions[index]] = attempt.value;
  });
  const firstFailureIndex = attempts.findIndex(attempt => attempt.status === "rejected");
  if (firstFailureIndex !== -1) {
    const failedPosition = missingPositions[firstFailureIndex];
    const failure = attempts[firstFailureIndex].reason;
    await writePending(store, pendingKey, {
      schemaVersion: 1,
      state: "pending",
      date,
      boardHash: boardHashValue,
      assets: cards.filter(Boolean),
      failedPosition,
      failure: failure instanceof Error ? failure.message : "MEDIA registration failed.",
      updatedAt: now(),
    });
    throw failure;
  }

  if (cards.length !== REQUIRED_CARD_COUNT
    || cards.some((card, position) => !isValidPublicationAsset(card, position, associationId))) {
    throw requestError("The publication board did not produce nine verified MEDIA assets.", 502);
  }

  const manifest = {
    schemaVersion: 1,
    manifestVersion: GRID_MANIFEST_VERSION,
    manifestId: `vibe-atlas-${date}-${boardHashValue.slice(0, 24)}`,
    idempotencyKey: `vibe-atlas:daily-drop:${date}`,
    kind: "vibe-atlas-daily-drop",
    publicationDate: date,
    publishedAt: now(),
    boardHash: boardHashValue,
    actor,
    vibe,
    heroPosition: 4,
    cardCount: REQUIRED_CARD_COUNT,
    retention: {
      policy: "permanent",
      deleteWithCollection: false,
    },
    provenance: {
      ...provenance,
      sourceCandidateIds: cards.map(card => card.candidateId),
    },
    cards,
  };
  await store.setJSON(manifestKey, manifest, { onlyIfNew: true });
  const authoritative = await store.get(manifestKey, { type: "json", consistency: "strong" });
  if (!isGridManifest(authoritative) || authoritative.boardHash !== boardHashValue) {
    throw requestError("Another board won this publication date.", 409);
  }
  try {
    await store.delete(pendingKey);
  } catch {
    // The manifest is authoritative; a stale pending receipt is harmless and
    // remains available for reconciliation diagnostics.
  }
  return { manifest: authoritative, payload: manifestPayload(authoritative) };
  } finally {
    await releasePublicationLock(store, date, lock);
  }
}

export function manifestPayload(manifest, version = "v10") {
  if (!isGridManifest(manifest)) return null;
  const displayResults = manifest.cards.map(card => ({
    title: card.title,
    thumbnail: card.media.thumbnailUrl,
    link: card.link,
    source: card.source,
    media: card.media,
    ...(card.query ? { query: card.query } : {}),
    ...(card.batchKey ? { batchKey: card.batchKey } : {}),
    ...(card.familyId ? { familyId: card.familyId } : {}),
    ...(card.familyLabel ? { familyLabel: card.familyLabel } : {}),
    ...(card.familyEvidence ? { familyEvidence: card.familyEvidence } : {}),
  }));
  return {
    version,
    date: manifest.publicationDate,
    actorId: manifest.actor.id,
    actorIdx: null,
    actorName: manifest.actor.name,
    actorShortNameEn: manifest.actor.nameEn,
    actorAccentColor: manifest.actor.accentColor,
    vibeIdx: manifest.vibe.idx,
    vibeEmoji: manifest.vibe.emoji,
    vibeLabel: manifest.vibe.label,
    vibeLabelEn: manifest.vibe.labelEn,
    vibeSubtitle: manifest.vibe.subtitle,
    vibeSubtitleEn: manifest.vibe.subtitleEn,
    vibeSupportingCopy: manifest.vibe.supportingCopy,
    vibeSupportingCopyEn: manifest.vibe.supportingCopyEn,
    generationPrompt: manifest.vibe.generationPrompt,
    rankedBatches: [{
      query: "verified-publication-manifest",
      results: displayResults,
      count: displayResults.length,
      distinctSources: new Set(displayResults.map(candidate => candidate.source).filter(Boolean)).size,
      provider: null,
    }],
    displayResults,
    generatedAt: manifest.publishedAt,
  };
}

export function boardHash(board) {
  return createHash("sha256").update(JSON.stringify(
    board.candidates.map(candidate => ({
      candidateId: candidate.candidateId,
      thumbnail: candidate.thumbnail || "",
      title: candidate.title || "",
      source: candidate.source || "",
      link: candidate.link || "",
      query: candidate.query || "",
      batchKey: candidate.batchKey || "",
      imageDigest: candidate.imageDigest || null,
    })),
  )).digest("hex");
}

async function materializePublicationAsset({
  position,
  candidate,
  associationId,
  date,
  boardHashValue,
  actor,
  vibe,
  provenance,
  env,
  fetchImpl,
  resolveHost,
}) {
  const image = await fetchPublicationImage(candidate.thumbnail, fetchImpl, resolveHost);
  const media = await registerMediaBytes({
    bytes: image.bytes,
    contentType: image.contentType,
    association: {
      type: "publication",
      id: associationId,
      itemId: `card-${position}`,
    },
    filename: `vibe-atlas-${date}-${position + 1}`,
    idempotencyKey: publicationAssetIdempotencyKey(date, boardHashValue, position),
    metadata: {
      sourceType: "fandom-vibe-atlas-daily-drop",
      seriesTags: [
        "Fandom",
        "Vibe Atlas",
        "Daily Drop",
        `date:${date}`,
        `actor:${actor.id}`,
        `vibe:${vibe.key}`,
      ],
      linkedPostIdentifiers: [
        `fandom/vibe-atlas/daily-drop/${date}`,
        `fandom/vibe-atlas/daily-drop/${date}/card/${position}`,
      ],
      provenance: {
        date,
        actorId: actor.id,
        vibeKey: vibe.key,
        candidateId: candidate.candidateId,
        sourceUrl: candidate.thumbnail,
        ...provenance,
      },
    },
    env,
    fetchImpl,
  });
  return publicationAsset(position, candidate, media);
}

function publicationAssetIdempotencyKey(date, boardHashValue, position) {
  return `fandom-vibe-atlas:${date}:${boardHashValue}:card-${position}`;
}

export function isGridManifest(value) {
  if (!value || typeof value !== "object"
    || value.schemaVersion !== 1
    || value.manifestVersion !== GRID_MANIFEST_VERSION
    || value.kind !== "vibe-atlas-daily-drop"
    || !DATE_RE.test(value.publicationDate)
    || typeof value.manifestId !== "string"
    || typeof value.idempotencyKey !== "string"
    || typeof value.boardHash !== "string"
    || !/^[a-f0-9]{64}$/i.test(value.boardHash)
    || !value.actor || typeof value.actor.id !== "string"
    || typeof value.actor.name !== "string"
    || typeof value.actor.nameEn !== "string"
    || typeof value.actor.accentColor !== "string"
    || !value.vibe || typeof value.vibe.key !== "string"
    || !Number.isInteger(value.vibe.idx)
    || typeof value.vibe.label !== "string"
    || typeof value.vibe.labelEn !== "string"
    || !Number.isInteger(value.heroPosition)
    || value.heroPosition !== 4
    || value.cardCount !== REQUIRED_CARD_COUNT
    || value.retention?.policy !== "permanent"
    || value.retention?.deleteWithCollection !== false
    || !Array.isArray(value.cards)
    || value.cards.length !== REQUIRED_CARD_COUNT
    || !Array.isArray(value.provenance?.sourceCandidateIds)
    || value.provenance.sourceCandidateIds.length !== REQUIRED_CARD_COUNT
    || value.provenance.sourceCandidateIds.some((candidateId, position) =>
      candidateId !== value.cards[position]?.candidateId)) return false;
  return value.cards.every((card, position) => isValidPublicationAsset(
    card,
    position,
    `vibe-atlas:daily-drop:${value.publicationDate}`,
  ));
}

function validatePublicationInput(date, actor, vibe, board) {
  if (!DATE_RE.test(date)) throw requestError("Publication date must be YYYY-MM-DD.", 400);
  if (!actor?.id || !actor?.name || !actor?.nameEn || !actor?.accentColor) {
    throw requestError("Publication actor identity is incomplete.", 400);
  }
  if (!vibe?.key || !Number.isInteger(vibe.idx) || !vibe.label || !vibe.labelEn) {
    throw requestError("Publication Vibe Pack identity is incomplete.", 400);
  }
  if (!board || !Array.isArray(board.candidates)
    || board.candidates.length !== REQUIRED_CARD_COUNT
    || board.candidates.some(candidate => (
      !candidate
      || typeof candidate.candidateId !== "string"
      || !candidate.candidateId
      || !isSafeHttpsSourceUrl(candidate.thumbnail)
    ))
    || new Set(board.candidates.map(candidate => candidate.candidateId)).size !== REQUIRED_CARD_COUNT) {
    throw requestError("Publication requires nine distinct HTTPS image candidates.", 409);
  }
}

function publicationAsset(position, candidate, media) {
  return {
    position,
    candidateId: candidate.candidateId,
    title: candidate.title || "",
    source: candidate.source || "",
    link: candidate.link || "",
    sourceUrl: candidate.thumbnail,
    ...(candidate.query ? { query: candidate.query } : {}),
    ...(candidate.batchKey ? { batchKey: candidate.batchKey } : {}),
    ...(candidate.familyId ? { familyId: candidate.familyId } : {}),
    ...(candidate.familyLabel ? { familyLabel: candidate.familyLabel } : {}),
    ...(candidate.familyEvidence ? { familyEvidence: candidate.familyEvidence } : {}),
    media,
  };
}

function isValidPublicationAsset(asset, position, associationId) {
  return Boolean(
    asset
    && asset.position === position
    && typeof asset.candidateId === "string"
    && typeof asset.sourceUrl === "string"
    && isSafeHttpsSourceUrl(asset.sourceUrl)
    && isValidMediaReference(asset.media, {
      type: "publication",
      id: associationId,
      itemId: `card-${position}`,
    }),
  );
}

async function fetchPublicationImage(sourceUrl, fetchImpl, resolveHost) {
  let currentUrl = sourceUrl;
  let response;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const validated = await assertPublicHttpsUrl(currentUrl, resolveHost);
    response = fetchImpl === fetch
      ? await pinnedHttpsFetch(currentUrl, validated)
      : await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
        headers: { Accept: "image/png,image/jpeg,image/webp" },
      });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location || redirectCount === 3) {
      throw requestError("The approved source image redirected unsafely.", 502);
    }
    currentUrl = new URL(location, currentUrl).toString();
  }
  if (!response.ok) throw requestError("The approved source image could not be reached.", 502);
  const contentType = (response.headers.get("content-type") || "")
    .toLowerCase().split(";")[0].trim();
  if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) {
    throw requestError("The approved source did not return a supported image.", 502);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1 || bytes.byteLength > 8 * 1024 * 1024) {
    throw requestError("The approved source image is empty or larger than 8 MB.", 502);
  }
  return { bytes, contentType };
}

function isSafeHttpsSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

async function assertPublicHttpsUrl(value, resolveHost) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw requestError("The approved source image URL is invalid.", 409);
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw requestError("The approved source image must use public HTTPS.", 409);
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw requestError("The approved source image host is not public.", 409);
  }
  const literal = isIP(hostname);
  const addresses = literal
    ? [{ address: hostname }]
    : await resolveHost(hostname, { all: true, verbatim: true });
  if (!Array.isArray(addresses) || addresses.length === 0
    || addresses.some(entry => isPrivateOrReservedIp(entry.address))) {
    throw requestError("The approved source image host is not public.", 409);
  }
  return {
    address: addresses[0].address,
    family: isIP(addresses[0].address),
  };
}

function pinnedHttpsFetch(url, resolved) {
  return new Promise((resolve, reject) => {
    const request = httpsGet(url, {
      headers: { Accept: "image/png,image/jpeg,image/webp" },
      lookup: (_hostname, _options, callback) =>
        callback(null, resolved.address, resolved.family),
    }, response => {
      const chunks = [];
      let size = 0;
      response.on("data", chunk => {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) {
          request.destroy(requestError("The approved source image is larger than 8 MB.", 502));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        const body = Buffer.concat(chunks);
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          headers: {
            get(name) {
              const value = response.headers[name.toLowerCase()];
              return Array.isArray(value) ? value[0] : value || null;
            },
          },
          arrayBuffer: async () =>
            body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
        });
      });
    });
    request.setTimeout(30_000, () =>
      request.destroy(requestError("The approved source image timed out.", 502)));
    request.on("error", reject);
  });
}

function isPrivateOrReservedIp(address) {
  if (isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    const [a, b] = parts;
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0 && parts[2] === 2)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && parts[2] === 100)
      || (a === 203 && b === 0 && parts[2] === 113)
      || a >= 224;
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) {
      return isPrivateOrReservedIp(normalized.slice("::ffff:".length));
    }
    return normalized === "::"
      || normalized === "::1"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || /^fe[89ab]/.test(normalized)
      || normalized.startsWith("ff")
      || normalized.startsWith("2001:db8:");
  }
  return true;
}

async function acquirePublicationLock(store, date, boardHashValue, now) {
  const key = `${PUBLICATION_LOCK_PREFIX}${date}`;
  const stamp = now();
  const startedAt = Date.parse(stamp);
  const token = randomUUID();
  const existingWithMetadata = typeof store.getWithMetadata === "function"
    ? await store.getWithMetadata(key, { type: "json", consistency: "strong" })
    : null;
  const existing = existingWithMetadata?.data || await store.get(key, {
    type: "json",
    consistency: "strong",
  });
  if (existing?.state !== "released" && existing?.startedAt
    && startedAt - Date.parse(existing.startedAt) <= PUBLICATION_LOCK_TTL_MS) {
    throw requestError("That publication date is already being materialized. Retry shortly.", 503);
  }
  if (existing && !existingWithMetadata?.etag) {
    throw requestError("A stale publication lock requires reconciliation before retrying.", 503);
  }
  await store.setJSON(key, {
    schemaVersion: 1,
    token,
    date,
    boardHash: boardHashValue,
    startedAt: stamp,
  }, existingWithMetadata?.etag
    ? { onlyIfMatch: existingWithMetadata.etag }
    : { onlyIfNew: true });
  const authoritative = await store.get(key, { type: "json", consistency: "strong" });
  if (authoritative?.token !== token) {
    throw requestError("That publication date is already being materialized. Retry shortly.", 503);
  }
  return { key, token };
}

async function releasePublicationLock(store, date, lock) {
  if (!lock) return;
  try {
    if (typeof store.getWithMetadata === "function") {
      const current = await store.getWithMetadata(lock.key, {
        type: "json",
        consistency: "strong",
      });
      if (current?.data?.token === lock.token && current.etag) {
        await store.setJSON(lock.key, {
          ...current.data,
          state: "released",
          releasedAt: new Date().toISOString(),
        }, { onlyIfMatch: current.etag });
      }
      return;
    }
    const current = await store.get(lock.key || `${PUBLICATION_LOCK_PREFIX}${date}`, {
      type: "json",
      consistency: "strong",
    });
    if (current?.token === lock.token) await store.delete(lock.key);
  } catch {
    // An abandoned lock expires and is reclaimed with a compare-and-swap.
  }
}

async function writePending(store, key, value) {
  await store.setJSON(key, value);
}