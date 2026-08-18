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

function keys(accountId, gridId, exportId) {
  const base = `exports/${accountId}/${gridId}`;
  return {
    index: `${base}/index.json`,
    png: exportId ? `${base}/${exportId}.png` : null,
  };
}

export function createGridExportHandlers({ auth, getStore, now = () => new Date() }) {
  return {
    handler: async (req, context) => {
      try {
        const session = await auth.authenticate(req, context);
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
        return json(405, { error: "Method not allowed." }, { Allow: "GET, POST" });
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

  const { index, png } = keys(accountId, gridId, exportId);
  await store.set(png, bytes);

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
