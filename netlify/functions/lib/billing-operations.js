function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function createBillingOperationsHandler({ auth, getRepository }) {
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
      return response(200, {
        identityConflict: await repository.identityConflictSummary(),
      });
    } catch (error) {
      return response(error?.status || 500, {
        error: error?.status ? error.message : "Billing operations unavailable.",
      });
    }
  };
}