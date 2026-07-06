// TEMPORARY, one-time-use diagnostic endpoint. Deletes today's cached
// Star-of-Day entry (and its lock key) so a real cold-build can be forced
// and timed on production. NOT part of the shipped feature — delete this
// file in the follow-up commit right after use.
import { getBlobStore } from "./lib/blob-store.js";
import { getShanghaiDateString } from "./lib/date-seed.js";

const STORE_NAME = "star-of-day";
const VERSION = "v1";

function cacheKeyFor(dateString) {
  return `starOfDay:${VERSION}:${dateString}`;
}

export default async (req, context) => {
  const url = new URL(req.url);
  if (url.searchParams.get("confirm") !== "yes-purge-today") {
    return new Response(JSON.stringify({ error: "missing confirm param" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const store = getBlobStore(STORE_NAME, context);
  const todayStr = getShanghaiDateString();
  const todayKey = cacheKeyFor(todayStr);
  const lockKey = `${todayKey}:lock`;

  await store.delete(todayKey);
  await store.delete(lockKey);

  return new Response(JSON.stringify({ purged: todayKey, date: todayStr }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
};
