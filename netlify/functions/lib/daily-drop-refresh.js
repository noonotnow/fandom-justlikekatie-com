import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getWithResolvedEtag } from "./blob-store.js";
import { getDailyDropDateString } from "./daily-drop-clock.js";

export const REFRESH_LEASE_MS = 15 * 60 * 1000;
export const REFRESH_RETRY_MS = 5 * 60 * 1000;
export const REFRESH_HEADER = "x-daily-drop-refresh";
export const refreshKey = date => `starOfDay:refresh:v1:${date}`;

function signature(body, secret) {
  return createHmac("sha256", secret)
    .update("daily-drop-refresh:v1\n")
    .update(body)
    .digest("hex");
}

export function refreshSigningSecret(env) {
  return env.FANDOM_AUTH_ID_SECRET || env.SESSION_SECRET;
}

export function isPublishedProduction(context) {
  return context?.deploy?.context === "production"
    && context.deploy.published === true
    && typeof context.deploy.id === "string"
    && /^[a-zA-Z0-9-]+$/.test(context.deploy.id);
}

export function verifyRefreshRequest(body, header, { secret, deployId }, now = Date.now()) {
  if (!secret || !deployId || !/^[a-f0-9]{64}$/.test(header || "")) return null;
  const expected = signature(body, secret);
  if (!timingSafeEqual(Buffer.from(header, "hex"), Buffer.from(expected, "hex"))) return null;
  try {
    const input = JSON.parse(body);
    if (!input || typeof input.jobId !== "string"
      || !/^[a-f0-9-]{36}$/.test(input.jobId)
      || !Number.isFinite(input.requestedAt)
      || input.requestedAt > now + 30_000
      || now - input.requestedAt > REFRESH_LEASE_MS
      || input.date !== getDailyDropDateString(new Date(now))
      || input.deployId !== deployId) return null;
    return input;
  } catch {
    return null;
  }
}

export async function claimRefreshJob(store, date, deployId, now = Date.now()) {
  const key = refreshKey(date);
  const existing = await getWithResolvedEtag(store, key, { type: "json" });
  if (existing?.data?.expiresAt > now) return { claimed: false, job: existing.data };
  if (existing && !existing.etag) {
    throw new Error("The Daily Drop refresh lock revision is unavailable.");
  }
  const job = {
    date,
    jobId: randomUUID(),
    requestedAt: now,
    expiresAt: now + REFRESH_LEASE_MS,
    deployId,
    status: "queued",
  };
  const result = await store.setJSON(
    key, job, existing?.etag ? { onlyIfMatch: existing.etag } : { onlyIfNew: true },
  );
  if (result?.modified === false) {
    return { claimed: false, job: await store.get(key, { type: "json", consistency: "strong" }) };
  }
  // Some runtime store adapters omit `modified`. Read back our ownership
  // rather than interpreting an undefined result as a successful claim.
  const current = await store.get(key, { type: "json", consistency: "strong" });
  return { claimed: current?.jobId === job.jobId, job: current };
}

export async function updateRefreshJob(store, job, changes, { expectedStatus = null } = {}) {
  const key = refreshKey(job.date);
  const current = await getWithResolvedEtag(store, key, { type: "json" });
  if (current?.data?.jobId !== job.jobId || !current.etag) return false;
  if (expectedStatus && current.data.status !== expectedStatus) return false;
  if (job.executionId && current.data.executionId !== job.executionId) return false;
  const result = await store.setJSON(key, { ...current.data, ...changes }, { onlyIfMatch: current.etag });
  if (typeof result?.modified === "boolean") return result.modified;
  const confirmed = await store.get(key, { type: "json", consistency: "strong" });
  return confirmed?.jobId === job.jobId
    && Object.entries(changes).every(([key, value]) => confirmed[key] === value);
}

export async function dispatchDailyDropRefresh(req, context, store, date, {
  env = process.env,
  fetchImpl = fetch,
  now = Date.now(),
} = {}) {
  if (!isPublishedProduction(context)) {
    throw new Error("Automatic Daily Drop publication is disabled outside production.");
  }
  const secret = refreshSigningSecret(env);
  if (!secret) throw new Error("The Daily Drop background service is not configured.");
  // Build-only CONTEXT/DEPLOY_ID/DEPLOY_URL are not runtime variables.
  // Use Netlify's trusted V2 metadata and the immutable deploy permalink,
  // never caller-supplied Host headers or the mutable production alias.
  const siteName = context?.site?.name;
  if (typeof siteName !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(siteName)) {
    throw new Error("The Daily Drop background service address is unavailable.");
  }
  const base = `https://${context.deploy.id}--${siteName}.netlify.app`;
  const claim = await claimRefreshJob(store, date, context.deploy.id, now);
  if (!claim.claimed) return claim.job || { status: "queued" };
  const job = claim.job;
  const body = JSON.stringify({
    date: job.date, jobId: job.jobId,
    requestedAt: job.requestedAt, deployId: job.deployId,
  });
  try {
    const response = await fetchImpl(new URL("/.netlify/functions/star-of-day-refresh-background", base), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [REFRESH_HEADER]: signature(body, secret),
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status !== 202) throw new Error(`Background dispatch failed (HTTP ${response.status}).`);
    return job;
  } catch (error) {
    await updateRefreshJob(store, job, {
      status: "failed", expiresAt: now + REFRESH_RETRY_MS,
    });
    console.error("[daily-drop-refresh] dispatch failed", { date, name: error?.name || "Error" });
    throw new Error("Today’s grid could not start preparing. Please try again shortly.");
  }
}
