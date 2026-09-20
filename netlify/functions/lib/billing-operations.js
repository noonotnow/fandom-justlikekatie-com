import { randomUUID } from "node:crypto";

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const PROCESSED_RECEIPT_RETENTION_INDEX =
  "public.fandom_billing_events_processed_retention_idx";
export const RECEIPT_INDEX_NOTIFICATION_STATE_KEY =
  "billing-operations:receipt-index-notification-state";
const RECEIPT_INDEX_STATUSES = new Set(["release_ready", "missing", "invalid", "not_ready"]);
const NOTIFICATION_CLAIM_TTL_MS = 15 * 60 * 1000;

export function createReceiptIndexHealthCheck({ query }) {
  return async () => {
    const result = await query(
      `SELECT i.indisvalid, i.indisready
         FROM pg_index i
        WHERE i.indexrelid = to_regclass($1)`,
      [PROCESSED_RECEIPT_RETENTION_INDEX],
    );
    const index = result.rows[0];
    if (!index) {
      return { status: "missing", releaseReady: false };
    }
    if (!index.indisvalid) {
      return { status: "invalid", releaseReady: false };
    }
    if (!index.indisready) {
      return { status: "not_ready", releaseReady: false };
    }
    return { status: "release_ready", releaseReady: true };
  };
}

export async function sendReceiptIndexNotification({
  payload,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const recipients = String(env.FANDOM_ADMIN_EMAILS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  if (!env.RESEND_API_KEY || !env.FANDOM_AUTH_FROM_EMAIL || recipients.length === 0) {
    throw new Error("Receipt index notifications are not configured.");
  }
  const resolved = payload.kind === "resolved";
  const title = resolved
    ? "Resolved: processed-receipt retention index is release-ready"
    : `Action required: processed-receipt retention index is ${payload.status}`;
  const result = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.FANDOM_AUTH_FROM_EMAIL,
      to: recipients,
      subject: `[Fandom operations] ${title}`,
      text: [
        title,
        `Status: ${payload.status}`,
        `Observed at: ${payload.observedAt}`,
        resolved
          ? "The privacy-safe readiness check has recovered."
          : "The privacy-safe readiness check regressed from release-ready.",
      ].join("\n"),
    }),
  });
  if (!result.ok) {
    throw new Error(`Receipt index notification delivery failed (${result.status}).`);
  }
}

export async function notifyReceiptIndexTransition({
  store,
  health,
  notify,
  now = new Date(),
}) {
  const targetStatus = RECEIPT_INDEX_STATUSES.has(health?.status) ? health.status : null;
  if (!targetStatus) return null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const entry = await store.getWithMetadata(
      RECEIPT_INDEX_NOTIFICATION_STATE_KEY,
      { type: "json", consistency: "strong" },
    );
    const current = normalizeReceiptIndexNotificationState(entry?.data);
    if (current.pending) {
      const claimAge = now.getTime() - Date.parse(current.claimedAt);
      if (claimAge >= 0 && claimAge < NOTIFICATION_CLAIM_TTL_MS) return null;
    } else if (current.status === targetStatus) {
      return null;
    }
    const previousStatus = current.pending ? current.previousStatus : current.status;
    const kind = previousStatus === "release_ready" && targetStatus !== "release_ready"
      ? "incident"
      : previousStatus && previousStatus !== "release_ready" && targetStatus === "release_ready"
        ? "resolved"
        : null;
    if (!kind) {
      const write = await writeReceiptIndexState(store, entry, {
        status: targetStatus,
        updatedAt: now.toISOString(),
      });
      if (write?.modified !== false) return null;
      continue;
    }
    const claimId = randomUUID();
    const claim = {
      pending: true,
      claimId,
      claimedAt: now.toISOString(),
      previousStatus,
      targetStatus,
      kind,
    };
    const claimed = await writeReceiptIndexState(store, entry, claim);
    if (claimed?.modified === false) continue;
    const payload = {
      kind,
      status: kind === "resolved" ? "release_ready" : targetStatus,
      observedAt: now.toISOString(),
    };
    try {
      await notify(payload);
    } catch (error) {
      await settleReceiptIndexClaim(store, claimId, {
        status: previousStatus,
        updatedAt: now.toISOString(),
      });
      throw error;
    }
    await settleReceiptIndexClaim(store, claimId, {
      status: targetStatus,
      notifiedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    return payload;
  }
  throw new Error("Receipt index notification state changed too frequently.");
}

function normalizeReceiptIndexNotificationState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  if (
    value.pending === true
    && typeof value.claimId === "string"
    && Number.isFinite(Date.parse(value.claimedAt))
    && RECEIPT_INDEX_STATUSES.has(value.previousStatus)
    && RECEIPT_INDEX_STATUSES.has(value.targetStatus)
  ) return value;
  return RECEIPT_INDEX_STATUSES.has(value.status) ? value : {};
}

async function settleReceiptIndexClaim(store, claimId, state) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const entry = await store.getWithMetadata(
      RECEIPT_INDEX_NOTIFICATION_STATE_KEY,
      { type: "json", consistency: "strong" },
    );
    if (entry?.data?.claimId !== claimId) return;
    const write = await writeReceiptIndexState(store, entry, state);
    if (write?.modified !== false) return;
  }
  throw new Error("Receipt index notification claim could not be settled.");
}

function writeReceiptIndexState(store, entry, state) {
  return store.setJSON(
    RECEIPT_INDEX_NOTIFICATION_STATE_KEY,
    state,
    entry?.etag ? { onlyIfMatch: entry.etag } : { onlyIfNew: true },
  );
}

export function createBillingOperationsHandler({ auth, getRepository, getReceiptIndexHealth }) {
  return async (req, context) => {
    if (req.method && !["GET", "POST"].includes(req.method)) {
      return response(405, { error: "Method not allowed" });
    }
    try {
      const authenticated = await auth.authenticateAdmin(req, context);
      const repository = getRepository(context);
      if (req.method === "POST") {
        const body = await req.json().catch(() => null);
        if (
          body?.action !== "resolve_identity_conflict"
          || !["acknowledged", "resolved"].includes(body?.status)
        ) {
          return response(400, { error: "A valid identity conflict resolution is required." });
        }
        const result = await repository.resolveIdentityConflict({
          status: body.status,
          expectedCount: body.expectedCount,
          expectedLastOccurredAt: body.expectedLastOccurredAt,
          resolvedBy: authenticated?.user?.accountId || authenticated?.accountId || "admin",
        });
        if (result.outcome === "invalid") {
          return response(400, { error: "The identity conflict version is invalid." });
        }
        if (result.outcome === "missing") {
          return response(404, { error: "No identity conflict was found." });
        }
        if (result.outcome === "changed") {
          return response(409, {
            error: "A new identity conflict was recorded. Review the active aggregate before resolving it.",
            identityConflict: result.summary,
          });
        }
        return response(200, { identityConflict: result.summary });
      }
      let receiptIndex = { status: "unavailable", releaseReady: false };
      if (getReceiptIndexHealth) {
        try {
          receiptIndex = await getReceiptIndexHealth(context);
        } catch {
          receiptIndex = { status: "unavailable", releaseReady: false };
        }
      }
      return response(200, {
        identityConflict: await repository.identityConflictSummary(),
        receiptIndex,
      });
    } catch (error) {
      return response(error?.status || 500, {
        error: error?.status ? error.message : "Billing operations unavailable.",
      });
    }
  };
}