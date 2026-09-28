import { getBlobStore } from "./lib/blob-store.js";
import { recordArchiveAccessEmailDeliveryEvent } from "./lib/archive-access-operations.js";
import { verifySvixWebhook } from "./lib/public-auth.js";

const EVENT_STATUS = {
  "email.sent": "accepted",
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.failed": "rejected",
};

export function createArchiveAccessEmailWebhookHandler({
  env = process.env,
  getStore = context => getBlobStore("archive-access-operations", context),
  now = () => new Date(),
  recordEvent = recordArchiveAccessEmailDeliveryEvent,
  logger = console,
} = {}) {
  return async (req, context) => {
    if (req.method !== "POST") return new Response(null, { status: 405 });
    const body = await req.text();
    if (!verifySvixWebhook({
      body,
      headers: req.headers,
      secret: env.RESEND_WEBHOOK_SECRET,
      now: now(),
    })) return new Response(null, { status: 401 });
    let event;
    try {
      event = JSON.parse(body);
    } catch {
      return new Response(null, { status: 400 });
    }
    const status = EVENT_STATUS[event?.type];
    const providerMessageId = event?.data?.email_id;
    const occurredAt = event?.created_at;
    if (!status || typeof providerMessageId !== "string" || !Number.isFinite(Date.parse(occurredAt))) {
      return new Response(null, { status: 204 });
    }
    try {
      await recordEvent(getStore(context), { providerMessageId, status, occurredAt });
    } catch (error) {
      logger.error("[archive-access] email delivery event could not be recorded", {
        message: error instanceof Error ? error.message : "Unknown delivery event failure",
      });
      return new Response(null, { status: 503 });
    }
    return new Response(null, { status: 204 });
  };
}

export default createArchiveAccessEmailWebhookHandler();