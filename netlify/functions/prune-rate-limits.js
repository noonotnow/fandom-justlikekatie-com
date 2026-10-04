import { getBlobStore } from "./lib/blob-store.js";
import { pruneExpiredRateLimits } from "./lib/public-auth.js";
import { pruneExpiredDiscussionRates } from "./lib/vibing-discussion.js";

// Scheduled function: runs hourly to delete expired rate-limit entries from
// Netlify Blobs so storage stays bounded over time.
//
// Each 15-minute rate-limit window writes two keys (one per email hash, one per
// IP hash) that are never read again after the window rolls over.  Without this
// cleanup they accumulate indefinitely.
export const config = { schedule: "@hourly" };

export default async (_req, context) => {
  const current = new Date();
  const results = await Promise.allSettled([
    pruneExpiredRateLimits(getBlobStore("fandom-auth-rate-limits", context), current),
    pruneExpiredDiscussionRates(getBlobStore("fandom-vibing-discussions", context), current),
  ]);
  if (results[0].status === "fulfilled") {
    console.log(`[prune-rate-limits] deleted ${results[0].value} expired auth rate-limit entries`);
  }
  if (results[1].status === "fulfilled") {
    console.log(`[prune-rate-limits] discussion rate sweep: ${JSON.stringify(results[1].value)}`);
  }
  const failed = results.filter(result => result.status === "rejected");
  if (failed.length) throw new AggregateError(failed.map(result => result.reason), "Rate-limit cleanup failed; retry on the next run.");
};
