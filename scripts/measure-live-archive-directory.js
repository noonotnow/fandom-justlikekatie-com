import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { PUBLIC_ORIGIN } from "../shared/public-routes.js";

// Ordinary public GETs only. Never invalidate production state to manufacture
// a cold sample, inject storage failures, or save the actor names/response body.
const MAX_REQUESTS = 12;
const MAX_WINDOW_MS = 20 * 60 * 1000;

export async function measureLiveDirectory({
  fetchImpl = fetch, clock = Date.now, wait = sleep, record = () => {},
} = {}) {
  const startedAt = clock();
  const samples = [];
  async function request(label, cursor = null) {
    if (samples.length >= MAX_REQUESTS || clock() - startedAt > MAX_WINDOW_MS) {
      throw new Error("Bounded measurement budget exhausted.");
    }
    const url = new URL("/.netlify/functions/public-archive-inventory", PUBLIC_ORIGIN);
    url.searchParams.set("directory", "actors");
    if (cursor) url.searchParams.set("cursor", cursor);
    const start = clock();
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
    const headersAt = clock();
    const body = await response.json();
    const sample = {
      label, requestedAt: new Date(start).toISOString(),
      receivedAt: new Date(clock()).toISOString(),
      headersMs: headersAt - start, totalMs: clock() - start,
      status: response.status, requestId: response.headers.get("x-nf-request-id"),
      cacheControl: response.headers.get("cache-control"),
      actorCount: body.actors?.length ?? null,
      page: body.page && {
        hasMore: body.page.hasMore, nextCursor: body.page.nextCursor,
        scanned: body.page.scanned, unavailableCount: body.page.unavailableCount,
        partial: body.page.partial, status: body.page.status,
        unavailable: body.page.unavailable === true,
      },
      actorInventory: body.actorInventory && {
        scope: body.actorInventory.scope, complete: body.actorInventory.complete,
        generation: body.actorInventory.generation, source: body.actorInventory.source,
        cacheAvailable: body.actorInventory.cacheAvailable,
        freshness: body.actorInventory.freshness, verifiedAt: body.actorInventory.verifiedAt,
        expiresAt: body.actorInventory.expiresAt, retryAt: body.actorInventory.retryAt,
        verifiedCandidates: body.actorInventory.verifiedCandidates,
        totalCandidates: body.actorInventory.totalCandidates,
      },
    };
    samples.push(sample);
    await record({ origin: PUBLIC_ORIGIN, startedAt: new Date(startedAt).toISOString(), samples });
    console.log(JSON.stringify(sample));
    if (!response.ok || sample.actorInventory?.scope !== "verified-directory"
      || !Number.isFinite(Date.parse(sample.actorInventory.expiresAt))) {
      throw new Error("Live release does not provide a healthy verified-directory response.");
    }
    return sample;
  }
  async function finishPass(sample, label) {
    let pages = 0;
    while (sample.page.hasMore) {
      if (++pages > 2 || sample.page.unavailable || !sample.page.nextCursor) {
        throw new Error("Rebuild exceeded bounded continuation allowance or storage is unavailable.");
      }
      sample = await request(`${label}-continuation-${pages}`, sample.page.nextCursor);
    }
    return sample;
  }
  async function waitUntil(deadline) {
    const timestamp = Date.parse(deadline);
    if (!Number.isFinite(timestamp) || timestamp + 1000 - startedAt > MAX_WINDOW_MS) {
      throw new Error("Invalid or out-of-budget evidence deadline.");
    }
    await wait(Math.max(0, timestamp + 1000 - clock()));
  }
  let baseline = await finishPass(await request("baseline"), "baseline");
  await request("warm-1");
  await request("warm-2");
  if (baseline.actorInventory.retryAt) {
    console.log(`Waiting without polling until partial retry ${baseline.actorInventory.retryAt}`);
    await waitUntil(baseline.actorInventory.retryAt);
    baseline = await finishPass(await request("after-partial-retry"), "partial-retry");
    await request("warm-after-retry");
  }
  console.log(`Waiting without polling until hard expiry ${baseline.actorInventory.expiresAt}`);
  await waitUntil(baseline.actorInventory.expiresAt);
  await finishPass(await request("after-hard-expiry"), "hard-expiry");
  await request("warm-after-hard-expiry");
  return { origin: PUBLIC_ORIGIN, startedAt: new Date(startedAt).toISOString(), samples };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv[2];
  if (!output) throw new Error("Supply a workspace-relative JSON result path.");
  await measureLiveDirectory({
    record: result => writeFile(output, `${JSON.stringify(result, null, 2)}\n`),
  });
}
