import { randomUUID } from "node:crypto";

const BUCKET_PREFIX = "archive-access:hour:";
const OUTCOMES = new Set(["sign_in", "upgrade", "billing_delay", "allowed"]);

export function archiveAccessBucketKey(date) {
  return `${BUCKET_PREFIX}${date.toISOString().slice(0, 13)}`;
}

export async function recordArchiveAccessCheck(store, event, date = new Date()) {
  const outcome = OUTCOMES.has(event?.outcome) ? event.outcome : null;
  if (!store || !outcome) return;
  await store.setJSON(
    `${archiveAccessBucketKey(date)}:${date.getTime()}:${randomUUID()}`,
    {
      timestamp: date.toISOString(),
      outcome,
      authenticated: event.authenticated === true,
    },
    { onlyIfNew: true },
  );
}

export async function archiveAccessHealth(store, date = new Date(), hours = 24) {
  const cutoff = date.getTime() - hours * 60 * 60 * 1000;
  const blobs = await listAllBlobs(store);
  const records = (await Promise.all(blobs.map(blob =>
    store.get(blob.key, { type: "json", consistency: "strong" }))))
    .filter(record =>
      OUTCOMES.has(record?.outcome)
      && Number.isFinite(Date.parse(record?.timestamp))
      && Date.parse(record.timestamp) >= cutoff
      && Date.parse(record.timestamp) <= date.getTime());
  const byHour = new Map();
  for (const record of records) {
    const hour = record.timestamp.slice(0, 13);
    const bucket = byHour.get(hour) || {
      hour,
      counts: { sign_in: 0, upgrade: 0, billing_delay: 0, allowed: 0, authenticated_checks: 0 },
    };
    bucket.counts[record.outcome] += 1;
    if (record.authenticated) bucket.counts.authenticated_checks += 1;
    byHour.set(hour, bucket);
  }
  const buckets = [...byHour.values()]
    .sort((left, right) => String(left.hour).localeCompare(String(right.hour)));
  const totals = buckets.reduce((result, bucket) => {
    for (const key of Object.keys(result)) result[key] += Number(bucket.counts?.[key]) || 0;
    return result;
  }, { sign_in: 0, upgrade: 0, billing_delay: 0, allowed: 0, authenticated_checks: 0 });
  const recentCutoff = date.getTime() - 60 * 60 * 1000;
  const recentRecords = records.filter(record => Date.parse(record.timestamp) >= recentCutoff);
  const recentTotals = recentRecords.reduce((result, record) => {
    result[record.outcome] += 1;
    if (record.authenticated) result.authenticated_checks += 1;
    return result;
  }, { upgrade: 0, billing_delay: 0, allowed: 0, authenticated_checks: 0 });
  const denominator = recentTotals.authenticated_checks;
  const billingRate = denominator ? recentTotals.billing_delay / denominator : 0;
  const denialRate = denominator ? recentTotals.upgrade / denominator : 0;
  const consecutiveBillingHours = trailingHoursWith(buckets, "billing_delay");
  const billingStatus = recentTotals.billing_delay >= 5 && billingRate >= 0.5
    ? "critical"
    : (recentTotals.billing_delay >= 3 && billingRate >= 0.2) || consecutiveBillingHours >= 2
      ? "warning"
      : "normal";
  const denialStatus = recentTotals.upgrade >= 25 && denialRate >= 0.6
    ? "critical"
    : recentTotals.upgrade >= 10 && denialRate >= 0.4
      ? "warning"
      : "normal";
  return {
    generatedAt: date.toISOString(),
    windowHours: hours,
    totals,
    recentHour: {
      ...recentTotals,
      billingDelayRate: billingRate,
      deniedAccessRate: denialRate,
    },
    status: {
      billing: billingStatus,
      deniedAccess: denialStatus,
      consecutiveBillingHours,
    },
    thresholds: {
      billingWarning: "3+ billing delays and 20%+ of authenticated checks in one hour, or any billing delay in 2 consecutive hours",
      billingCritical: "5+ billing delays and 50%+ of authenticated checks in one hour",
      deniedWarning: "10+ upgrade denials and 40%+ of authenticated checks in one hour",
      deniedCritical: "25+ upgrade denials and 60%+ of authenticated checks in one hour",
      anonymousPreviewsExcluded: true,
    },
    buckets,
  };
}

function trailingHoursWith(buckets, outcome) {
  let count = 0;
  let previousHour = null;
  for (let index = buckets.length - 1; index >= 0; index -= 1) {
    if ((Number(buckets[index].counts?.[outcome]) || 0) === 0) break;
    const hour = new Date(`${buckets[index].hour}:00:00.000Z`).getTime();
    if (previousHour !== null && previousHour - hour !== 60 * 60 * 1000) break;
    count += 1;
    previousHour = hour;
  }
  return count;
}

async function listAllBlobs(store) {
  const listing = store.list({ prefix: BUCKET_PREFIX, paginate: true });
  if (listing && typeof listing[Symbol.asyncIterator] === "function") {
    const blobs = [];
    for await (const page of listing) blobs.push(...(page.blobs || []));
    return blobs;
  }
  return (await listing)?.blobs || [];
}

export function createArchiveAccessOperationsHandler({
  auth,
  getStore,
  now = () => new Date(),
} = {}) {
  return async (req, context) => {
    if (req.method && req.method !== "GET") return response(405, { error: "Method not allowed" });
    try {
      await auth.authenticateAdmin(req, context);
      return response(200, await archiveAccessHealth(getStore(context), now()));
    } catch (error) {
      return response(error?.status || 500, {
        error: error?.status === 403 ? "Admin access required." : "Archive access health unavailable.",
      });
    }
  };
}

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}