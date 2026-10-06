import { getBlobStore } from "./lib/blob-store.js";
import { getDailyDropDateString, isDailyDropRefreshTime } from "./lib/daily-drop-clock.js";
import { dispatchDailyDropRefresh, isPublishedProduction } from "./lib/daily-drop-refresh.js";
import { gridManifestKey, manifestPayload } from "./lib/publication-manifest.js";

export const config = { schedule: "0 16,17 * * *" };

export function createDailyDropRefreshSchedule({
  getStore = getBlobStore,
  dispatch = dispatchDailyDropRefresh,
  now = () => new Date(),
} = {}) {
  return async (req, context) => {
    if (!isPublishedProduction(context)) return new Response(null, { status: 204 });
    const clock = now();
    if (!isDailyDropRefreshTime(clock)) return new Response(null, { status: 204 });
    const date = getDailyDropDateString(clock);
    const store = getStore("star-of-day", context);
    const manifest = await store.get(gridManifestKey(date), { type: "json", consistency: "strong" });
    if (manifestPayload(manifest)) return new Response(null, { status: 204 });
    const job = await dispatch(req, context, store, date);
    console.info("[daily-drop-refresh] scheduled", { date, status: job.status });
    return new Response(null, { status: 204 });
  };
}

export default createDailyDropRefreshSchedule();
