import { renderCanonicalOutput } from "./canonical-render.js";
import {
  createWorkstationGridHandoffHandler,
  isWorkstationDraftRequest,
} from "./workstation-grid-handoff.js";
import { secureEqual } from "./public-auth.js";

const MAX_REQUEST_BYTES = 256 * 1024;

class RequestError extends Error {
  constructor(message, status = 400, stage = "request") {
    super(message);
    this.status = status;
    this.stage = stage;
  }
}

/**
 * The public Workstation entry point accepts only the active Creator Draft source
 * envelope. Historical Idea Packet envelopes are intentionally rejected before
 * any Blob store is opened.
 */
export function createWorkstationHandoffHandler({
  env = process.env,
  fetchImpl = fetch,
  getStore,
  auth,
  now = () => new Date(),
  renderOutputImpl = renderCanonicalOutput,
} = {}) {
  return async function workstationHandoff(req, context) {
    if (req.method !== "POST") {
      return jsonResponse(405, { error: "Method not allowed" }, { Allow: "POST" });
    }
    try {
      validateSameOrigin(req);
      const operator = await validateAuthorization(req, env.PLAN_OPERATOR_TOKEN, auth, context);
      const input = await readHandoffInput(req);
      if (!isWorkstationDraftRequest(input)) {
        throw new RequestError(
          "Legacy Idea Packet handoff envelopes are no longer supported. Send a Creator Draft ordered-grid source.",
          400,
        );
      }
      return await createWorkstationGridHandoffHandler({
        env,
        fetchImpl,
        getStore,
        now,
        renderOutputImpl,
      })(req, context, input.source, operator);
    } catch (error) {
      if (error instanceof RequestError) {
        return jsonResponse(error.status, { error: error.message, stage: error.stage });
      }
      console.error("[workstation-handoff] unexpected error", error);
      return jsonResponse(500, { error: "Internal server error", stage: "server" });
    }
  };
}

async function readHandoffInput(req) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new RequestError("Content-Type must be application/json.");
  }
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_REQUEST_BYTES) {
    throw new RequestError("Handoff request is too large.", 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new RequestError("Handoff request must be valid JSON.");
  }
}

function validateSameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) {
    throw new RequestError("Cross-origin Workstation handoff requests are not allowed.", 403);
  }
}

async function validateAuthorization(req, expectedToken, auth, context) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (expectedToken && secureEqual(token, expectedToken)) return { method: "operator-token" };
  if (auth) {
    try {
      const authenticated = await auth.authenticateAdmin(req, context);
      return {
        method: "admin-session",
        user: authenticated?.user || authenticated,
      };
    } catch (error) {
      if (error?.status === 401) {
        throw new RequestError("Sign in again before sending to Workstation.", 401);
      }
      if (error?.status === 403) {
        throw new RequestError("An admin account is required to send drafts to Workstation.", 403);
      }
      throw new RequestError("Workstation handoff could not verify your admin session. Try again.", 503);
    }
  }
  throw new RequestError("Workstation handoff operator authorization is required.", 401);
}

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}