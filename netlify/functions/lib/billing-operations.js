function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const PROCESSED_RECEIPT_RETENTION_INDEX =
  "public.fandom_billing_events_processed_retention_idx";

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