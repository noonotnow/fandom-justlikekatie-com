// Shanghai-day seeding — shared logic for picking "today's" actor/vibe.
//
// This mirrors the getShanghaiDateString/hashDateString/getTodaysRandom functions
// that used to live client-side in index.html. The server is now the single
// source of truth for "today's" pick (see star-of-day.js), so this lives here
// instead of being duplicated in the browser.
export function getShanghaiDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const yyyy = parts.find((p) => p.type === "year")?.value;
  const mm = parts.find((p) => p.type === "month")?.value;
  const dd = parts.find((p) => p.type === "day")?.value;
  if (!yyyy || !mm || !dd) throw new Error("Could not format Asia/Shanghai date");
  return `${yyyy}-${mm}-${dd}`;
}

export function hashDateString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

// Deterministically picks today's actor/vibe index from ACTOR_PACKS, given an
// explicit dateString (so callers can also compute yesterday's pick for fallback).
export function getRandomForDate(actorPacks, dateString) {
  if (!actorPacks || !actorPacks.length) return null;
  const seed = hashDateString(dateString);
  const aIdx = seed % actorPacks.length;
  const actor = actorPacks[aIdx];
  if (!actor || !actor.vibes || !actor.vibes.length) return null;
  const vIdx = Math.floor(seed / actorPacks.length) % actor.vibes.length;
  return { aIdx, vIdx, seed, date: dateString };
}

// Returns the Shanghai calendar date string for "yesterday" relative to a given
// Shanghai date string — used for the yesterday-cache fallback when today's build
// fails outright.
export function shanghaiYesterday(dateString) {
  const [y, m, d] = dateString.split("-").map(Number);
  // Construct a UTC-based Date encoding the same y-m-d, then subtract a day. This is
  // just calendar arithmetic on the date string, not a timezone conversion of "now",
  // so using Date.UTC here is safe and avoids local-timezone drift.
  const asDate = new Date(Date.UTC(y, m - 1, d));
  asDate.setUTCDate(asDate.getUTCDate() - 1);
  const yyyy = asDate.getUTCFullYear();
  const mm = String(asDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(asDate.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
