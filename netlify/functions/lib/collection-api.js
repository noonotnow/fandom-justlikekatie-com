import { createHash, createHmac } from "node:crypto";
import { readCollection, syncCollection } from "./collection-repository.js";
import { json, secureEqual } from "./public-auth.js";

export function createCollectionHandlers({ auth, getStore, env = process.env, now = () => new Date() }) {
  return {
    sync: async (req, context) => {
      try {
        if (req.method !== "POST") return json(405, { error: "Method not allowed." });
        validateSameOrigin(req);
        const session = await auth.authenticate(req, context);
        const input = await readJson(req);
        if (input.expectedAccountId !== session.user.accountId) {
          const error = new Error("The active account changed. Refresh before syncing.");
          error.status = 409;
          throw error;
        }
        const result = await syncCollection(
          getStore("fandom-user-collections", context),
          session.user.accountId,
          input,
          now,
        );
        return json(200, result);
      } catch (error) {
        const status = error?.status || (error instanceof TypeError ? 400 : 500);
        if (status === 500) console.error("[collection-sync] request failed", error);
        return json(status, { error: status === 500 ? "Collection sync failed." : error.message });
      }
    },

    createRead: async (req, context) => {
      try {
        if (req.method !== "GET") return json(405, { error: "Method not allowed." }, { Allow: "GET" });
        validateCreateSignature(req, env, now());
        const url = new URL(req.url);
        const accountId = url.searchParams.get("accountId");
        if (!/^usr_[A-Za-z0-9_-]{32}$/.test(accountId || "")) return json(400, { error: "Invalid account." });
        const cursor = Number(url.searchParams.get("cursor") || 0);
        return json(200, await readCollection(
          getStore("fandom-user-collections", context),
          accountId,
          Number.isInteger(cursor) && cursor >= 0 ? cursor : 0,
        ));
      } catch (error) {
        return json(error?.status || 401, { error: "CREATE collection read authorization failed." });
      }
    },
  };
}

function validateCreateSignature(req, env, current) {
  const keyId = req.headers.get("x-fandom-key-id") || "";
  const timestamp = req.headers.get("x-fandom-timestamp") || "";
  const signature = req.headers.get("x-fandom-signature") || "";
  if (
    !env.CREATE_FANDOM_COLLECTION_READ_KEY_ID
    || !env.CREATE_FANDOM_COLLECTION_READ_SECRET
    || !secureEqual(keyId, env.CREATE_FANDOM_COLLECTION_READ_KEY_ID)
  ) throw unauthorized();
  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(current.getTime() - timestampMs) > 5 * 60 * 1000) {
    throw unauthorized();
  }
  const url = new URL(req.url);
  const canonical = `${url.pathname}?${url.searchParams.toString()}`;
  const digest = createHash("sha256").update("").digest("hex");
  const expected = createHmac("sha256", env.CREATE_FANDOM_COLLECTION_READ_SECRET)
    .update(`${timestamp}\nGET\n${canonical}\n${digest}`)
    .digest("hex");
  if (!secureEqual(signature, `v1=${expected}`)) throw unauthorized();
}

function unauthorized() {
  const error = new Error("Unauthorized");
  error.status = 401;
  return error;
}

async function readJson(req) {
  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    throw new TypeError("Content-Type must be application/json.");
  }
  const text = await req.text();
  if (Buffer.byteLength(text) > 256 * 1024) throw new TypeError("Request is too large.");
  try { return JSON.parse(text); } catch { throw new TypeError("Request must be valid JSON."); }
}

function validateSameOrigin(req) {
  if (req.headers.get("origin") !== new URL(req.url).origin) {
    const error = new Error("Cross-origin requests are not allowed.");
    error.status = 403;
    throw error;
  }
}
