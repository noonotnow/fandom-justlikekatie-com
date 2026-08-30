import { json } from "./public-auth.js";

/**
 * Durable storage for exported share-card renders.
 *
 * Export is an event that produces a logged, recoverable artifact: when a
 * SAVED grid's share card is exported, the client uploads the rendered PNG
 * here (fire-and-forget) so the operator can re-download it later without
 * regenerating.  This never creates or mutates a saved grid — Save ≠ Export.
 *
 * Blob layout (store "grid-card-exports"):
 *   exports/{accountId}/{gridId}/index.json      — append-only export history
 *   exports/{accountId}/{gridId}/{exportId}.png  — the rendered card bytes
 *
 * All routes require the signed-in public-account session; keys are scoped
 * by accountId so one account can never read another's exports.
 */

export const STORE_NAME = "grid-card-exports";
export const MAX_EXPORT_BYTES = 8 * 1024 * 1024; // 8 MB — 1080×1350 PNGs are well under this
const MAX_HISTORY_ENTRIES = 50;

const EXPORT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRID_ID_RE = /^[A-Za-z0-9._:-]{1,200}$/;

/**
 * How long after a grid's exports are deleted new uploads for that grid are
 * rejected.  Covers the race where a fire-and-forget upload is still in
 * flight while the grid is being removed, without permanently blocking a
 * grid that is later legitimately re-saved and re-exported (grid ids are
 * deterministic, so re-saves reuse the same id).
 *
 * Tombstone lifecycle (`.deleted` blob under the grid prefix):
 *  - Written as a race barrier BEFORE deletion enumerates blobs, with
 *    `pending: null` (enumeration not yet captured — uploads blocked).
 *  - Updated with the captured generation: `pending` = the exact PNG keys
 *    this deletion owns, `scrubIds` = their exportIds for index scrubbing.
 *    Retries only ever delete/scrub these — never a re-enumeration — so a
 *    delayed retry can never touch exports of a later re-saved grid.
 *  - On completion: `pending: []`, `scrubIds: []`, `completedAt` set.
 *    Uploads stay blocked for TOMBSTONE_TTL_MS after completion (race
 *    window), then the next upload garbage-collects the tombstone.
 *  - A completed tombstone for a grid that is never re-exported lingers as
 *    one ~100-byte blob per deleted grid — accepted; the next fresh DELETE
 *    or upload reclaims it.
 */
export const TOMBSTONE_TTL_MS = 15 * 60 * 1000;

function keys(accountId, gridId, exportId) {
  const base = `exports/${accountId}/${gridId}`;
  return {
    index: `${base}/index.json`,
    tombstone: `${base}/.deleted`,
    png: exportId ? `${base}/${exportId}.png` : null,
  };
}

async function readTombstone(store, tombstoneKey) {
  return store.get(tombstoneKey, { type: "json" }).catch(() => null);
}

/**
 * Upload gate for a tombstoned grid:
 *  - "blocked": deletion in progress with no captured generation, or the
 *    completed-deletion race window has not elapsed — refuse the upload.
 *  - "expired-complete": cleanup finished and the window elapsed — the grid
 *    was legitimately re-saved; GC the tombstone and accept.
 *  - "open": no tombstone, or a captured-generation cleanup is pending after
 *    the window — new-generation uploads are safe because retries only
 *    delete the captured keys.
 */
function tombstoneUploadState(record, now) {
  if (!record) return "open";
  const pendingCaptured = Array.isArray(record.pending);
  const anchor = Date.parse(record.completedAt || record.deletedAt || "");
  const withinWindow = Number.isFinite(anchor) && now().getTime() - anchor < TOMBSTONE_TTL_MS;
  if (!pendingCaptured) return "blocked"; // enumeration pending — deletion owns the whole prefix
  if (record.pending.length === 0) return withinWindow ? "blocked" : "expired-complete";
  return withinWindow ? "blocked" : "open";
}

export function createGridExportHandlers({
  auth, getStore, now = () => new Date(), requireMembership = async () => {},
}) {
  return {
    handler: async (req, context) => {
      try {
        const session = await auth.authenticate(req, context);
          await requireMembership(session, context);
        const accountId = session.user.accountId;
        const store = getStore(STORE_NAME, context);
        const url = new URL(req.url);
        const gridId = url.searchParams.get("gridId") || "";
        if (!GRID_ID_RE.test(gridId)) return json(400, { error: "Invalid gridId." });

        if (req.method === "POST") {
          return await handleUpload(req, store, accountId, gridId, url, now);
        }
        if (req.method === "GET") {
          const exportId = url.searchParams.get("exportId");
          if (exportId) return await handleDownload(store, accountId, gridId, exportId);
          return await handleList(store, accountId, gridId);
        }
        if (req.method === "DELETE") {
          return await handleDelete(store, accountId, gridId, now);
        }
        return json(405, { error: "Method not allowed." }, { Allow: "GET, POST, DELETE" });
      } catch (error) {
        const status = error?.status || 500;
        if (status === 500) console.error("[grid-exports] request failed", error);
        return json(status, { error: status === 500 ? "Export storage failed." : error.message });
      }
    },
  };
}

async function handleUpload(req, store, accountId, gridId, url, now) {
  const exportId = url.searchParams.get("exportId") || "";
  if (!EXPORT_ID_RE.test(exportId)) return json(400, { error: "Invalid exportId." });
  const variant = url.searchParams.get("variant") === "teaser" ? "teaser" : "full";
  const tier = sanitizeTier(url.searchParams.get("tier"));

  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_EXPORT_BYTES) return json(413, { error: "Export image too large." });
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength === 0) return json(400, { error: "Empty export upload." });
  if (bytes.byteLength > MAX_EXPORT_BYTES) return json(413, { error: "Export image too large." });
  if (!isPng(bytes)) return json(400, { error: "Upload must be a PNG." });

  const { index, png, tombstone } = keys(accountId, gridId, exportId);

  // Refuse uploads for a grid whose exports were just deleted (race with a
  // fire-and-forget upload dispatched before the removal completed).
  const preState = tombstoneUploadState(await readTombstone(store, tombstone), now);
  if (preState === "blocked") {
    return json(410, { error: "This grid's exports were deleted." });
  }
  if (preState === "expired-complete") {
    // Grid was re-saved after a completed cleanup's race window — GC the
    // spent tombstone so the namespace is clean again.
    await store.delete(tombstone).catch(() => {});
  }

  await store.set(png, bytes);

  // Re-check after the write: a DELETE that ran between the check above and
  // the set() has already enumerated blobs, so roll our PNG back rather than
  // leaving a fresh orphan behind the completed cleanup.
  if (tombstoneUploadState(await readTombstone(store, tombstone), now) === "blocked") {
    await store.delete(png).catch(() => {});
    return json(410, { error: "This grid's exports were deleted." });
  }

  const existing = await store.get(index, { type: "json" }).catch(() => null);
  const entries = Array.isArray(existing) ? existing : [];
  if (!entries.some((entry) => entry?.exportId === exportId)) {
    entries.push({
      exportId,
      variant,
      tier,
      bytes: bytes.byteLength,
      exportedAt: now().toISOString(),
    });
  }
  await store.setJSON(index, entries.slice(-MAX_HISTORY_ENTRIES));

  return json(200, { ok: true, exportId });
}

/**
 * Delete all persisted exports for one grid owned by this account.
 *
 * Uses store.list({ prefix }) to enumerate every blob under the grid's
 * prefix (index + all PNGs) so that PNGs evicted from the capped index
 * (>MAX_HISTORY_ENTRIES exports) are not left orphaned.  Falls back to the
 * current index when list is unavailable (some test environments).
 *
 * Returns 500 when any individual blob delete fails so the caller can retry;
 * this avoids the pattern of deleting the index (losing the manifest) and
 * then silently leaving PNGs orphaned.
 */
async function handleDelete(store, accountId, gridId, now = () => new Date()) {
  const prefix = `exports/${accountId}/${gridId}/`;
  const { tombstone, index } = keys(accountId, gridId);
  const record = await readTombstone(store, tombstone);

  if (record && Array.isArray(record.pending)) {
    const hasWork = record.pending.length > 0 || (Array.isArray(record.scrubIds) && record.scrubIds.length > 0);
    if (hasWork) {
      // Resume the captured generation: delete/scrub ONLY what the original
      // deletion enumerated.  Never re-enumerate here — the grid may have
      // been legitimately re-saved since, and its new exports must survive.
      return resumeDelete(store, tombstone, index, record, accountId, gridId, now);
    }
    const doneAt = Date.parse(record.completedAt || record.deletedAt || "");
    if (Number.isFinite(doneAt) && now().getTime() - doneAt < TOMBSTONE_TTL_MS) {
      return json(200, { ok: true, deleted: 0 }); // already clean, window still open
    }
    // Completed cleanup, window elapsed — this is a fresh removal of a
    // re-saved grid; fall through to a fresh enumeration.
  }

  // Fresh deletion. Write the race barrier BEFORE enumerating, so any
  // concurrent upload either sees it up front (rejected) or on its
  // post-write re-check (rolled back).  If the barrier cannot be persisted,
  // deletion must not proceed — 500 keeps the cleanup in the client's
  // durable retry queue.  Preserve the original deletedAt when resuming a
  // barrier whose enumeration never completed (uploads have been blocked
  // since then, so a fresh enumeration is still race-safe).
  const deletedAt = (record && typeof record.deletedAt === "string" && record.deletedAt) || now().toISOString();
  try {
    await store.setJSON(tombstone, { deletedAt, pending: null });
  } catch (error) {
    console.error(`[grid-exports] DELETE tombstone write failed for ${accountId}/${gridId}`, error);
    return json(500, { error: "Export cleanup could not start; retry to complete cleanup." });
  }

  // list() is the only enumeration that provably covers every blob under the
  // prefix (including PNGs evicted from the capped index).  If it fails we
  // cannot prove completeness — return a retryable failure; the barrier
  // stays (uploads blocked) so the later re-enumeration is still race-safe.
  let blobKeys;
  try {
    const page = await store.list({ prefix });
    blobKeys = (page?.blobs ?? []).map((b) => b.key).filter((key) => key !== tombstone);
  } catch (error) {
    console.error(`[grid-exports] DELETE list failed for ${accountId}/${gridId}`, error);
    return json(500, { error: "Export cleanup could not enumerate blobs; retry to complete cleanup." });
  }

  if (blobKeys.length === 0) {
    await store.setJSON(tombstone, { deletedAt, pending: [], scrubIds: [], completedAt: now().toISOString() }).catch(() => {});
    return json(200, { ok: true, deleted: 0 });
  }

  // Capture the generation this deletion owns BEFORE deleting anything, so a
  // retry after partial failure targets exactly these blobs and nothing else.
  const pngKeys = blobKeys.filter((key) => key.endsWith(".png"));
  const genIds = pngKeys.map((key) => key.slice(key.lastIndexOf("/") + 1, -".png".length));
  try {
    await store.setJSON(tombstone, { deletedAt, pending: pngKeys, scrubIds: genIds });
  } catch (error) {
    console.error(`[grid-exports] DELETE generation capture failed for ${accountId}/${gridId}`, error);
    return json(500, { error: "Export cleanup could not record its work; retry to complete cleanup." });
  }

  const results = await Promise.allSettled(blobKeys.map((key) => store.delete(key)));
  const failedKeys = blobKeys.filter((_, i) => results[i].status === "rejected");

  if (failedKeys.length > 0) {
    console.error(
      `[grid-exports] DELETE partial failure (${failedKeys.length}/${blobKeys.length}) for ${accountId}/${gridId}`,
      results.filter((r) => r.status === "rejected").map((r) => r.reason),
    );
    await store
      .setJSON(tombstone, {
        deletedAt,
        pending: failedKeys.filter((key) => key.endsWith(".png")),
        scrubIds: failedKeys.includes(index) ? genIds : [],
      })
      .catch(() => {});
    return json(500, {
      error: "Some export blobs could not be deleted; retry to complete cleanup.",
      deleted: blobKeys.length - failedKeys.length,
      failed: failedKeys.length,
    });
  }

  await store.setJSON(tombstone, { deletedAt, pending: [], scrubIds: [], completedAt: now().toISOString() }).catch(() => {});
  return json(200, { ok: true, deleted: blobKeys.length });
}

/**
 * Finish a previously captured deletion: remove only the generation's
 * remaining PNG keys and scrub only its exportIds from the index (a
 * re-saved grid may have rebuilt the index with new entries that must
 * survive).  Returns 500 while any captured work remains.
 */
async function resumeDelete(store, tombstoneKey, indexKey, record, accountId, gridId, now) {
  const pending = record.pending.filter((key) => typeof key === "string");
  const scrubIds = Array.isArray(record.scrubIds) ? record.scrubIds.filter((id) => typeof id === "string") : [];

  const results = await Promise.allSettled(pending.map((key) => store.delete(key)));
  const failedPngs = pending.filter((_, i) => results[i].status === "rejected");

  let remainingScrub = scrubIds;
  if (scrubIds.length > 0) {
    try {
      const entries = await store.get(indexKey, { type: "json" }).catch(() => null);
      if (Array.isArray(entries)) {
        const gen = new Set(scrubIds);
        const kept = entries.filter((entry) => !gen.has(entry?.exportId));
        if (kept.length > 0) await store.setJSON(indexKey, kept);
        else await store.delete(indexKey);
      }
      remainingScrub = [];
    } catch {
      /* index scrub failed — keep scrubIds for the next retry */
    }
  }

  const deleted = pending.length - failedPngs.length;
  if (failedPngs.length > 0 || remainingScrub.length > 0) {
    console.error(
      `[grid-exports] DELETE resume incomplete (${failedPngs.length} blobs, ${remainingScrub.length} index ids) for ${accountId}/${gridId}`,
    );
    await store
      .setJSON(tombstoneKey, { ...record, pending: failedPngs, scrubIds: remainingScrub })
      .catch(() => {});
    return json(500, {
      error: "Some export blobs could not be deleted; retry to complete cleanup.",
      deleted,
      failed: failedPngs.length + remainingScrub.length,
    });
  }

  await store
    .setJSON(tombstoneKey, { deletedAt: record.deletedAt, pending: [], scrubIds: [], completedAt: now().toISOString() })
    .catch(() => {});
  return json(200, { ok: true, deleted });
}

async function handleList(store, accountId, gridId) {
  const { index } = keys(accountId, gridId);
  const entries = await store.get(index, { type: "json" }).catch(() => null);
  return json(200, { exports: Array.isArray(entries) ? entries : [] });
}

async function handleDownload(store, accountId, gridId, exportId) {
  if (!EXPORT_ID_RE.test(exportId)) return json(400, { error: "Invalid exportId." });
  const { png } = keys(accountId, gridId, exportId);
  const bytes = await store.get(png, { type: "arrayBuffer" }).catch(() => null);
  if (!bytes) return json(404, { error: "Export not found." });
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="vibe-guide-export-${exportId}.png"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

function sanitizeTier(tier) {
  return typeof tier === "string" && /^[a-z-]{1,32}$/.test(tier) ? tier : "standard";
}

/** PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A */
function isPng(buffer) {
  const view = new Uint8Array(buffer.slice(0, 8));
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return magic.every((byte, i) => view[i] === byte);
}
