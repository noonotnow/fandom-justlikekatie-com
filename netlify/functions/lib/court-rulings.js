import { json } from "./public-auth.js";

// Shared custom court rulings — one canon list stored in Netlify Blobs so
// every admin's browser sees the same rulings.
//
// GET is public (the unlock-screen popup shows rulings before sign-in).
// POST (add) and DELETE (remove) require an authenticated admin session
// (email on the FANDOM_ADMIN_EMAILS allowlist).

const STORE_NAME = "fandom-court-rulings";
const KEY = "rulings";
const MAX_RULING_LENGTH = 2000;
const MAX_RULINGS = 500;

export function createCourtRulingsHandler({ auth, getStore }) {
  return async (req, context) => {
    try {
      const store = getStore(STORE_NAME, context);
      if (req.method === "GET") {
        const entry = await getWithMetadata(store, KEY);
        return json(200, { rulings: normalize(entry?.data) });
      }
      if (req.method !== "POST" && req.method !== "DELETE") {
        return json(405, { error: "Method not allowed." }, { Allow: "GET, POST, DELETE" });
      }
      validateSameOrigin(req);
      await auth.authenticateAdmin(req, context);
      const input = await readJson(req);

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const entry = await getWithMetadata(store, KEY);
        const current = normalize(entry?.data);
        let next;
        if (req.method === "POST") {
          const ruling = typeof input.ruling === "string" ? input.ruling.trim() : "";
          if (!ruling) throw badRequest("A ruling is required.");
          if (ruling.length > MAX_RULING_LENGTH) throw badRequest("That ruling is too long.");
          if (current.includes(ruling)) return json(200, { rulings: current });
          if (current.length >= MAX_RULINGS) throw badRequest("The court record is full.");
          next = [...current, ruling];
        } else {
          const index = input.index;
          if (!Number.isInteger(index) || index < 0 || index >= current.length) {
            throw conflict("That ruling no longer exists. Refresh and try again.");
          }
          if (typeof input.ruling === "string" && current[index] !== input.ruling) {
            throw conflict("The court record changed. Refresh and try again.");
          }
          next = current.filter((_, i) => i !== index);
        }
        const result = await store.setJSON(
          KEY,
          next,
          entry?.etag ? { onlyIfMatch: entry.etag } : { onlyIfNew: true },
        );
        if (result?.modified === false) continue;
        return json(200, { rulings: next });
      }
      throw conflict("The court record changed too frequently. Retry.");
    } catch (error) {
      const status = error?.status || (error instanceof TypeError ? 400 : 500);
      if (status === 500) console.error("[court-rulings] request failed", error);
      return json(status, { error: status === 500 ? "Court rulings request failed." : error.message });
    }
  };
}

function normalize(data) {
  return Array.isArray(data) ? data.filter(item => typeof item === "string") : [];
}

async function getWithMetadata(store, key) {
  if (typeof store.getWithMetadata === "function") {
    return store.getWithMetadata(key, { type: "json", consistency: "strong" });
  }
  const data = await store.get(key, { type: "json", consistency: "strong" });
  return data ? { data } : null;
}

async function readJson(req) {
  const text = await req.text();
  if (Buffer.byteLength(text) > 64 * 1024) throw new TypeError("Request is too large.");
  try { return JSON.parse(text); } catch { throw new TypeError("Request must be valid JSON."); }
}

function validateSameOrigin(req) {
  if (req.headers.get("origin") !== new URL(req.url).origin) {
    const error = new Error("Cross-origin requests are not allowed.");
    error.status = 403;
    throw error;
  }
}

function badRequest(message) {
  const error = new TypeError(message);
  return error;
}

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}
