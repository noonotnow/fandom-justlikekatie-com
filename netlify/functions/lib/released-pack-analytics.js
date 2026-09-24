import { json } from "./public-auth.js";

export const RELEASED_EVENTS = [
  "released_library_page_view",
  "released_library_opened",
  "released_library_filter_used",
  "released_library_sign_in_started",
  "released_library_checkout_started",
  "released_library_collector_activated",
  "released_pack_opened",
];
const SOURCES = ["daily_star", "public_record", "library_navigation"];
const ACTOR = /^[a-z0-9]+(?:-[a-z0-9]+){0,7}$/;
const STORE = "released-pack-analytics";
const MIN_GROUP = 10;

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validateReleasedEvent(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { event, source, actor_id, vibe_index, entitled, filter } = body;
  if (!RELEASED_EVENTS.includes(event) || !SOURCES.includes(source)) return null;
  if (actor_id !== undefined && (typeof actor_id !== "string" || actor_id.length > 80 || !ACTOR.test(actor_id))) return null;
  if (vibe_index !== undefined && (!Number.isInteger(vibe_index) || vibe_index < 0 || vibe_index > 99)) return null;
  if (event === "released_library_opened" && typeof entitled !== "boolean") return null;
  if (entitled !== undefined && (event !== "released_library_opened" || typeof entitled !== "boolean")) return null;
  if (event === "released_library_filter_used" && !["actor", "vibe"].includes(filter)) return null;
  if (filter !== undefined && event !== "released_library_filter_used") return null;
  // A fresh allowlisted object, never persist arbitrary request fields.
  return {
    event, source,
    ...(actor_id !== undefined ? { actor_id } : {}),
    ...(vibe_index !== undefined ? { vibe_index } : {}),
    ...(entitled !== undefined ? { entitled } : {}),
    ...(filter !== undefined ? { filter } : {}),
  };
}

export function createReleasedPackCollectHandler({ getStore, now = () => new Date() }) {
  return async (req, context) => {
    if (req.method !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
    let body;
    try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON." }); }
    const entry = validateReleasedEvent(body);
    if (!entry) return json(400, { error: "Invalid released-pack event." });
    try {
      const date = now().toISOString();
      await getStore(STORE, context).setJSON(
        `${date.slice(0, 10)}/${crypto.randomUUID()}`,
        { ...entry, timestamp: date },
        { onlyIfNew: true },
      );
      return json(200, { ok: true });
    } catch (error) {
      console.error("[released-pack-analytics] write failed", error);
      return json(500, { error: "Analytics unavailable." });
    }
  };
}

function group(records, dimensions) {
  const counts = new Map();
  for (const entry of records) {
    const values = dimensions.map(key => entry[key] ?? null);
    // Missing actor/vibe values are not an "all" bucket that can reveal suppressed cells.
    if (values.includes(null)) continue;
    const key = JSON.stringify([entry.event, ...values]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count >= MIN_GROUP).map(([key, count]) => {
    const [event, ...values] = JSON.parse(key);
    return { event, ...Object.fromEntries(dimensions.map((name, i) => [name, values[i]])), count };
  }).sort((a, b) => a.event.localeCompare(b.event) || b.count - a.count);
}

export function createReleasedPackReportHandler({ auth, getStore, now = () => new Date() }) {
  return async (req, context) => {
    try {
      await auth.authenticateAdmin(req, context);
      if (req.method !== "GET") return json(405, { error: "Method not allowed." }, { Allow: "GET" });
      const url = new URL(req.url);
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      if (!validDate(from) || !validDate(to)) return json(400, { error: "Valid from and to dates required." });
      const start = new Date(`${from}T00:00:00Z`);
      const end = new Date(`${to}T00:00:00Z`);
      if (start >= end || end - start > 31 * 86400000 || end > now()) {
        return json(400, { error: "Use a past half-open UTC range no longer than 31 days." });
      }
      const store = getStore(STORE, context);
      const listing = store.list({ paginate: true });
      const keys = [];
      if (listing && typeof listing[Symbol.asyncIterator] === "function") {
        for await (const page of listing) keys.push(...(page.blobs ?? []).map(blob => blob.key));
      } else {
        keys.push(...((await listing)?.blobs ?? []).map(blob => blob.key));
      }
      const selected = keys.filter(key => typeof key === "string" && key.slice(0, 10) >= from && key.slice(0, 10) < to);
      const entries = await Promise.all(selected.map(key => store.get(key, { type: "json", consistency: "strong" })));
      const records = entries.filter(entry =>
        entry && validateReleasedEvent(entry)
        && typeof entry.timestamp === "string"
        && entry.timestamp >= start.toISOString() && entry.timestamp < end.toISOString()
      );
      return json(200, {
        schemaVersion: 1,
        range: { from, toExclusive: to },
        generatedAt: now().toISOString(),
        minimumGroupSize: MIN_GROUP,
        // No raw events, visitor identifiers, small counts, or unsuppressed totals.
        // Do not return both a parent total and its child cells for library opens.
        bySource: group(records.filter(entry => entry.event !== "released_library_opened"), ["source"]),
        bySourceAndEntitlement: group(records.filter(entry => entry.event === "released_library_opened"), ["source", "entitled"]),
        byActorAndVibe: group(records, ["actor_id", "vibe_index"]),
      }, { "Cache-Control": "no-store" });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      if (status === 500) console.error("[released-pack-analytics] report failed", error);
      return json(status, { error: status === 500 ? "Analytics unavailable." : error.message });
    }
  };
}