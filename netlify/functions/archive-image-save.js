import { getBlobStore } from "./lib/blob-store.js";
import { archiveImageSaveDecision } from "./lib/archive-access.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { getBillingServices } from "./lib/billing.js";
import { capabilitiesForMembership } from "./lib/capabilities.js";
import { getShanghaiDateString } from "./lib/date-seed.js";
import {
  isValidArchiveImageIdentity,
  publicArchiveImageId,
  readPublicManifestForDate,
} from "./lib/public-archive-inventory.js";

const MAX_BODY_BYTES = 8 * 1024;
const auth = createPublicAuth({ getStore: getBlobStore });

function jsonResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function safeStatus(error, fallback) {
  return Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
    ? error.status
    : fallback;
}

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function createArchiveImageSaveHandler({
  getStore = getBlobStore,
  authenticate = auth.authenticate,
  billing = getBillingServices(),
  env = process.env,
  now = () => new Date(),
} = {}) {
  return async (request, context) => {
    if (request.method !== "POST") {
      return jsonResponse(405, { error: "Method not allowed" }, { Allow: "POST" });
    }
    if (!sameOrigin(request)) {
      return jsonResponse(403, { error: "Cross-origin image saves are not allowed." });
    }
    const contentType = request.headers.get("content-type")
      ?.split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      return jsonResponse(415, { error: "A JSON image-save request is required." });
    }

    let body;
    try {
      const text = await request.text();
      if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
        return jsonResponse(413, { error: "The image-save request is too large." });
      }
      body = JSON.parse(text);
    } catch {
      return jsonResponse(400, { error: "The image-save request is not valid JSON." });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).some(key => !["date", "imageId"].includes(key))
      || !isCalendarDate(body.date)
      || typeof body.imageId !== "string" || body.imageId.length < 1
      || body.imageId.length > 2048) {
      return jsonResponse(400, { error: "A valid edition date and image id are required." });
    }

    let today;
    try {
      today = getShanghaiDateString(now());
    } catch {
      return jsonResponse(503, { error: "The Archive save age could not be verified." });
    }
    if (body.date > today) {
      return jsonResponse(404, { error: "That public Archive image is not available." });
    }

    let store;
    try {
      store = getStore("star-of-day", context);
    } catch {
      return jsonResponse(503, { error: "The public Archive image could not be verified." });
    }
    const found = await readPublicManifestForDate(store, body.date);
    if (found.status === "unavailable") {
      return jsonResponse(503, { error: "The public Archive image could not be verified." });
    }
    if (found.status !== "available") {
      return jsonResponse(404, { error: "That public Archive image is not available." });
    }
    if (!isValidArchiveImageIdentity(found.manifest, body.imageId)) {
      return jsonResponse(404, { error: "That image is not part of the published edition." });
    }
    const card = found.manifest.cards.find(item =>
      publicArchiveImageId(found.manifest, item) === body.imageId
      || item.candidateId === body.imageId
      || item.media.thumbnailUrl === body.imageId
      || item.media.deliveryUrl === body.imageId);
    if (!card) {
      return jsonResponse(404, { error: "That image is not part of the published edition." });
    }

    let decision;
    try {
      decision = archiveImageSaveDecision({
        publicationDate: body.date,
        today,
        hasCollectorAccess: false,
      });
    } catch {
      return jsonResponse(503, { error: "The Archive save age could not be verified." });
    }
    if (decision.reason === "future_edition") {
      return jsonResponse(404, { error: "That public Archive image is not available." });
    }

    if (!decision.allowed && decision.reason === "collector_required") {
      let session;
      try {
        session = await authenticate(request, context);
      } catch (error) {
        const status = safeStatus(error, 503);
        return status === 401
          ? jsonResponse(401, {
            error: "Sign in to save images from editions older than three days.",
            access: "sign_in",
          })
          : jsonResponse(503, { error: "Collector membership could not be verified. Please retry." });
      }
      if (!session?.user?.accountId) {
        return jsonResponse(401, {
          error: "Sign in to save images from editions older than three days.",
          access: "sign_in",
        });
      }

      let membership;
      try {
        await billing.initialize(context);
        membership = await billing.repository(context)
          .membershipForAccount(session.user.accountId);
      } catch {
        return jsonResponse(503, { error: "Collector membership could not be verified. Please retry." });
      }
      const capabilities = capabilitiesForMembership(membership, env);
      if (!capabilities.includes("fandom_collector")) {
        if (membership?.status === "past_due" || membership?.status === "incomplete") {
          return jsonResponse(403, {
            error: "Your Collector membership is awaiting billing confirmation. Try again after billing updates.",
            reason: "billing_delay",
            access: "billing_delay",
          });
        }
        return jsonResponse(403, {
          error: "An active Collector membership is required to save images from editions older than three days.",
          reason: "collector_required",
          access: "upgrade",
        });
      }
      decision = archiveImageSaveDecision({
        publicationDate: body.date,
        today,
        hasCollectorAccess: true,
      });
    }

    if (!decision.allowed) {
      return jsonResponse(403, { error: "This Archive image cannot be saved right now." });
    }
    return jsonResponse(200, {
      allowed: true,
      access: decision.access,
      date: body.date,
      imageId: publicArchiveImageId(found.manifest, card),
      thumbnailUrl: card.media.thumbnailUrl,
      deliveryUrl: card.media.deliveryUrl,
      archiveEditionPath: found.edition.publicRecord.editionPath,
    });
  };
}

export default async function archiveImageSave(request, context) {
  const result = await createArchiveImageSaveHandler()(request, context);
  return new Response(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}