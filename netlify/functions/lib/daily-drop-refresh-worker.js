import { getBlobStore } from "./blob-store.js";
import { randomUUID } from "node:crypto";
import { createStarOfDayHandler } from "../star-of-day.js";
import {
  REFRESH_HEADER, REFRESH_LEASE_MS, REFRESH_RETRY_MS,
  isPublishedProduction, refreshKey, refreshSigningSecret, updateRefreshJob, verifyRefreshRequest,
} from "./daily-drop-refresh.js";

export function createDailyDropRefreshWorker({
  env = process.env,
  getStore = getBlobStore,
  now = () => Date.now(),
  createHandler = createStarOfDayHandler,
} = {}) {
  return async (req, context) => {
    // Preview functions share the site's durable stores. An unreviewed
    // preview must never publish an edition into production history.
    if (!isPublishedProduction(context)) return;
    if (req.method !== "POST") return;
    const body = await req.text();
    const input = verifyRefreshRequest(body, req.headers.get(REFRESH_HEADER), {
      secret: refreshSigningSecret(env), deployId: context.deploy.id,
    }, now());
    if (!input) {
      console.warn("[daily-drop-refresh] rejected unauthenticated invocation");
      return;
    }
    const store = getStore("star-of-day", context);
    let job = await store.get(refreshKey(input.date), { type: "json", consistency: "strong" });
    if (job?.jobId !== input.jobId || job.status !== "queued" || job.expiresAt <= now()) return;
    const executionId = randomUUID();
    if (!await updateRefreshJob(store, job, { status: "running", executionId }, {
      expectedStatus: "queued",
    })) return;
    job = { ...job, executionId };
    const startedAt = now();
    console.info("[daily-drop-refresh] started", { date: input.date });
    try {
      const handler = createHandler({
        env, getStore,
        today: () => input.date,
        lockTtlMs: REFRESH_LEASE_MS,
        onBuildProgress: (stage, details) => console.info("[daily-drop-refresh] progress", {
          date: input.date, stage, elapsedMs: now() - startedAt, ...details,
        }),
      });
      const result = await handler(new Request(
        new URL("/.netlify/functions/star-of-day", req.url),
      ), context);
      const payload = await result.json();
      const ready = result.ok && payload.date === input.date && payload.rankedBatches?.length > 0;
      const status = ready ? "ready"
        : result.ok && !payload.building ? "no_acceptable_batch"
        : "failed";
      await updateRefreshJob(store, job, {
        status,
        finishedAt: now(),
        expiresAt: ready ? 0 : now() + REFRESH_RETRY_MS,
      });
      console.info("[daily-drop-refresh] finished", {
        date: input.date, status, elapsedMs: now() - startedAt,
      });
    } catch (error) {
      await updateRefreshJob(store, job, {
        status: "failed", finishedAt: now(), expiresAt: now() + REFRESH_RETRY_MS,
      });
      console.error("[daily-drop-refresh] failed", {
        date: input.date, name: error?.name || "Error", elapsedMs: now() - startedAt,
      });
    }
  };
}
