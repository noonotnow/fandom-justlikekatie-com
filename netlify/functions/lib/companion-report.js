import { json } from "./public-auth.js";
import { PILOT_PATHS } from "./companion-interest.js";

const MIN_GROUP = 10;
const EVENTS = new Set(["companion_path_view", "companion_qualified_view", "membership_view", "checkout_started"]);

function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function keys(store, prefix) {
  const listing = store.list({ prefix, paginate: true });
  const result = [];
  if (listing && typeof listing[Symbol.asyncIterator] === "function") {
    for await (const page of listing) result.push(...(page.blobs ?? []).map(blob => blob.key));
  } else {
    result.push(...((await listing)?.blobs ?? []).map(blob => blob.key));
  }
  return result.filter(key => typeof key === "string");
}

function suppressed(count) {
  return count >= MIN_GROUP ? count : null;
}

export function createCompanionReport({ auth, getStore, now = () => new Date() }) {
  return async (req, context) => {
    try {
      await auth.authenticateAdmin(req, context);
      if (req.method !== "GET") return json(405, { error: "Method not allowed." }, { Allow: "GET" });
      const { searchParams } = new URL(req.url);
      const from = searchParams.get("from");
      const to = searchParams.get("to");
      if (!date(from) || !date(to) || from >= to
        || Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 31 * 86400000
        || Date.parse(`${to}T00:00:00Z`) > now().getTime()) {
        return json(400, { error: "Use a past half-open UTC range no longer than 31 days." });
      }
      const interest = getStore("companion-interest", context);
      const engagement = getStore("engagement", context);
      const outcomes = getStore("companion-pilot-outcomes", context);
      const counts = Object.fromEntries([...PILOT_PATHS].map(path => [path, {
        added: 0, updated: 0, removed: 0, currentActiveConsents: 0,
        pathEventRequests: 0, qualifiedSessionVisits: 0, membershipViews: 0, checkoutStarts: 0,
      }]));
      const within = timestamp => typeof timestamp === "string"
        && Number.isFinite(Date.parse(timestamp))
        && Date.parse(timestamp) >= Date.parse(`${from}T00:00:00Z`)
        && Date.parse(timestamp) < Date.parse(`${to}T00:00:00Z`);
      for (const key of await keys(interest, "changes/")) {
        if (key.slice(8, 18) < from || key.slice(8, 18) >= to) continue;
        const row = await interest.get(key, { type: "json", consistency: "strong" });
        if (within(row?.timestamp) && PILOT_PATHS.has(row.path)
          && ["added", "updated", "removed"].includes(row.action)) counts[row.path][row.action]++;
      }
      for (const key of await keys(interest, "subscribers/")) {
        const row = await interest.get(key, { type: "json", consistency: "strong" });
        if (row?.consent === true && PILOT_PATHS.has(row.path)) counts[row.path].currentActiveConsents++;
      }
      const engagementKeys = [
        ...await keys(engagement, "c-drama-companion-pilot:companion_path_view:"),
        ...await keys(engagement, "c-drama-companion-pilot:companion_qualified_view:"),
        ...await keys(engagement, "vibe-atlas-membership:membership_view:"),
        ...await keys(engagement, "vibe-atlas-membership:checkout_started:"),
      ];
      for (const key of engagementKeys) {
        const row = await engagement.get(key, { type: "json", consistency: "strong" });
        // Defense for already-stored, explicitly marked QA rows; new marked
        // requests are discarded at ingestion. Unmarked older visits cannot
        // be identified or removed retroactively.
        if (!within(row?.timestamp) || !PILOT_PATHS.has(row.pilotPath)
          || !EVENTS.has(row.event) || row.internalPilot === true) continue;
        const field = row.event === "companion_path_view" ? "pathEventRequests"
          : row.event === "companion_qualified_view" ? "qualifiedSessionVisits"
          : row.event === "membership_view" ? "membershipViews" : "checkoutStarts";
        counts[row.pilotPath][field]++;
      }
      let paid = 0;
      for (const key of await keys(outcomes, "")) {
        if (key.slice(0, 10) < from || key.slice(0, 10) >= to) continue;
        const row = await outcomes.get(key, { type: "json", consistency: "strong" });
        if (row?.event === "first_paid_collector_invoice" && within(row.timestamp)) paid++;
      }
      // Suppress all small cells; never expose subscriber records or billing identities.
      return json(200, {
        range: { from, toExclusive: to }, generatedAt: now().toISOString(),
        minimumGroupSize: MIN_GROUP,
        byPath: Object.fromEntries(Object.entries(counts).map(([path, cells]) =>
          [path, Object.fromEntries(Object.entries(cells).map(([field, count]) => [field, suppressed(count)]))])),
        firstPaidCollectorInvoices: suppressed(paid),
        qualifiedVisits: null,
        pathAttributedPurchases: null,
      }, { "Cache-Control": "no-store" });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      if (status === 500) console.error("[companion-report] report failed", error);
      return json(status, { error: status === 500 ? "Report unavailable." : error.message });
    }
  };
}