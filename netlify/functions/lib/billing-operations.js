function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function createBillingOperationsHandler({ auth, getRepository }) {
  return async (req, context) => {
    if (req.method && req.method !== "GET") return response(405, { error: "Method not allowed" });
    try {
      await auth.authenticateAdmin(req, context);
      return response(200, {
        identityConflict: await getRepository(context).identityConflictSummary(),
      });
    } catch (error) {
      return response(error?.status || 500, {
        error: error?.status ? error.message : "Billing operations unavailable.",
      });
    }
  };
}