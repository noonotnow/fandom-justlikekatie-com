import { searchOneQuery } from "./preview-search.js";

// Maximum query length – enough for any multi-word English phrase; rejects runaway input.
const MAX_QUERY_LENGTH = 200;

// Context suffix applied to queries that do not already contain an obvious
// Middle-earth / Tolkien keyword.  Conservative: only appended when the query
// is short enough that the suffix adds genuine signal rather than noise, and
// only when none of the known landmark terms already appear.
const MIDDLE_EARTH_KEYWORDS = [
  "middle-earth", "middle earth", "tolkien", "lotr", "lord of the rings",
  "hobbit", "silmarillion", "shire", "mordor", "gondor", "rohan", "rivendell",
  "mirkwood", "erebor", "amon", "arda", "beleriand", "numenor", "númenor",
  "isengard", "minas", "helm's deep", "helms deep", "fangorn", "lothlórien",
  "lothlórien", "lórien", "lorien", "khazad", "moria", "prancing pony",
  "anduin", "misty mountains", "grey havens", "bag end",
  // Key races / groups
  "hobbit", "wizard", "elf", "dwarf", "orc", "uruk", "nazgul", "ringwraith",
  "balrog", "ent", "valar", "maiar", "istari", "dunedain", "númenórean",
  // Prominent characters
  "frodo", "gandalf", "aragorn", "legolas", "gimli", "boromir", "samwise",
  "sauron", "saruman", "galadriel", "elrond", "bilbo", "thorin", "smaug",
  "gollum", "faramir", "eowyn", "théoden", "treebeard", "celeborn",
  "radagast", "glorfindel", "arwen", "pippin", "merry",
];

function needsContextSuffix(q) {
  const lower = q.toLowerCase();
  return !MIDDLE_EARTH_KEYWORDS.some((kw) => lower.includes(kw));
}

// Build the enriched search query sent to the provider cascade.
// Only appends the context suffix when the raw query lacks Middle-earth terms,
// and only when the query is short enough that a suffix meaningfully narrows results.
function buildSearchQuery(q) {
  if (needsContextSuffix(q) && q.length <= 80) {
    return `${q} Middle-earth Tolkien`;
  }
  return q;
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      // Public CDN cache: 60 s at edge, 30 s stale-while-revalidate, 10 min stale-if-error.
      // Kept conservative so freshness changes propagate quickly.
      "Cache-Control": "public, max-age=60, stale-while-revalidate=30, stale-if-error=600",
    },
    body: JSON.stringify(body),
  };
}

function errorResponse(statusCode, query, message) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({ query: query ?? "", provider: null, results: [], error: message }),
  };
}

// Normalizes a single result item to the public shape, stripping internal
// fields and ensuring only the documented fields are returned.
// Never alters the original title or link (preserving source attribution).
function normalizeItem(item, providerName) {
  return {
    title: item.title || "",
    thumbnail: item.thumbnail || "",
    link: item.link || "",
    source: item.source || "",
    provider: providerName || item.provider || "",
  };
}

export async function handler(event) {
  // Method guard — GET only.
  const method = (event.httpMethod || "GET").toUpperCase();
  if (method !== "GET") {
    return errorResponse(405, "", "Method Not Allowed");
  }

  // Extract and validate query parameter.
  const raw = event.queryStringParameters?.q ?? "";
  const q = raw.trim();

  if (!q) {
    return errorResponse(400, "", "Missing required parameter: q");
  }

  if (q.length > MAX_QUERY_LENGTH) {
    return errorResponse(
      400,
      q.slice(0, 40),
      `Query too long (max ${MAX_QUERY_LENGTH} characters)`,
    );
  }

  const searchQuery = buildSearchQuery(q);

  try {
    const result = await searchOneQuery(searchQuery);

    const provider = result.provider || "unknown";
    const results = (Array.isArray(result.results) ? result.results : [])
      .slice(0, 18)
      .map((item) => normalizeItem(item, provider))
      // De-duplicate by link as a final safety pass (searchOneQuery already dedupes
      // by thumbnail; link-dedup catches the rare case of identical pages indexed
      // under different thumbnail URLs).
      .filter(
        ((seen) => (item) => {
          const key = item.link || item.thumbnail;
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        })(new Set()),
      );

    return jsonResponse(200, {
      // Return the original trimmed query so callers always see what they sent,
      // not the internally enriched query.
      query: q,
      provider,
      results,
    });
  } catch (err) {
    // Do not expose internal error details (API keys, stack traces, etc.).
    const isConfig = /api key|not configured/i.test(err.message || "");
    return errorResponse(
      isConfig ? 503 : 500,
      q,
      isConfig ? "Search service temporarily unavailable" : "Internal search error",
    );
  }
}
