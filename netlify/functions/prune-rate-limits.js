import { getBlobStore } from "./lib/blob-store.js";
import { pruneExpiredRateLimits } from "./lib/public-auth.js";

// Scheduled function: runs hourly to delete expired rate-limit entries from
// Netlify Blobs so storage stays bounded over time.
//
// Each 15-minute rate-limit window writes two keys (one per email hash, one per
// IP hash) that are never read again after the window rolls over.  Without this
// cleanup they accumulate indefinitely.
export const config = { schedule: "@hourly" };

export default async (_req, context) => {
  const store = getBlobStore("fandom-auth-rate-limits", context);
  const deleted = await pruneExpiredRateLimits(store, new Date());
  console.log(`[prune-rate-limits] deleted ${deleted} expired rate-limit entries`);
};
