// Ranked batch selection for the Daily Star + Vibe grid — server-side.
//
// This used to live client-side in index.html (each visitor's browser ran the
// full candidate-evaluation + ranking pass). It has moved here so the
// star-of-day cache builder (netlify/functions/star-of-day.js) can compute it
// once per day and share the result across all visitors. The logic itself is
// unchanged from the client version.
//
// Priority order (highest to lowest):
//   1. Sparse/junk-dominated batches are dropped — a batch needs at least
//      MIN_VIABLE_RESULTS *clean* (non-junk-domain) results to be considered at all.
//   2. Highest clean-result count wins (naturally favors batches that clear
//      PREFERRED_RESULTS — a grid should feel like a grid, not crumbs).
//   3. Source/domain diversity narrows further within a close-count top tier (a
//      cheap, mechanical proxy for quality over a wall of duplicate-domain results).
//   4. Randomness only breaks a genuine remaining tie. Random is for flavor; ranking
//      is for breakfast — this is the tie-breaker, not the method.
export const MIN_VIABLE_RESULTS = 3;   // below this (after junk filtering) a batch is sparse/crumbs, not a grid.
export const PREFERRED_RESULTS = 7;    // mirrors USEFUL_FALLBACK_THRESHOLD in preview-search.js — informal target, not a hard cutoff.
export const CLOSE_COUNT_RANGE = 2;    // counts within this range of the max are treated as tied for randomization.
export const RANKED_BATCH_LIMIT = 3;   // expose only the top N ranked batches — the rest of the ladder stays hidden candidate depth.

// Domains that regularly slip past preview-search.js's ad/commerce/placeholder filters
// (they're not ads, not logos-by-filename, not known commerce sites) but are
// reliably NOT actor/drama content: finance/stock chart aggregators, app-store /
// streaming-product tiles, and portal home-page/logo tiles.
export const JUNK_DOMAIN_PATTERNS = [
  "apple.com",            // music.apple.com / apps.apple.com "representative work" product tiles
  "163.com",               // NetEase portal logo tile
  "finance.sina.com.cn",   // stock chart tiles
  "cj.sina.com.cn",        // Sina's finance ("财经") subdomain — same problem, different subdomain
  "eastmoney.com",
  "xueqiu.com",
  "10jqka.com.cn",
  "stockstar.com",
  "investing.com",
  "tradingview.com",
  "wallstreetcn.com",
  "cls.cn"
];

export function isJunkSource(source) {
  if (!source) return false;
  const lower = source.toLowerCase();
  return JUNK_DOMAIN_PATTERNS.some((p) => lower === p || lower.endsWith("." + p));
}

export function countDistinctSources(results) {
  const seen = new Set();
  results.forEach((r) => { if (r.source) seen.add(r.source); });
  return seen.size;
}

// Evaluates every candidate query for a vibe and scores each one. Strips known-junk
// sources before counting, so ranking reflects only grid-worthy results. Returns the
// full evaluated list (not just a winner) so rankCandidates can compare across all of
// them and pick the top RANKED_BATCH_LIMIT.
//
// searchOneQuery is injected (rather than imported directly) so this module has no
// hard dependency on preview-search.js's HTTP/env specifics — callers just need to
// pass a function with the shape (query) => Promise<{ results, provider }>.
//
// Runs all candidates in parallel (Promise.all) rather than sequentially like the
// old client-side version did — this runs once per day, synchronously, inside a
// single Netlify function invocation, so it needs to stay well under the function
// timeout even with a deep candidate ladder.
export async function evaluateCandidates(queries, searchOneQuery) {
  const settled = await Promise.all(
    queries.map(async (q) => {
      try {
        const data = await searchOneQuery(q);
        const cleanResults = (data.results || []).filter((r) => !isJunkSource(r.source));
        return {
          query: q,
          results: cleanResults,
          count: cleanResults.length,
          distinctSources: countDistinctSources(cleanResults),
          provider: data.provider || null
        };
      } catch (e) {
        return { query: q, results: [], count: 0, distinctSources: 0, provider: null };
      }
    })
  );
  return settled;
}

// Ranked selector: drop sparse/junk-dominated batches, sort the rest by clean-result
// count (highest first), then source diversity, then a random jitter that only ever
// breaks a genuine remaining tie (same count, same diversity). Returns the ranked
// list so callers can take the top few instead of just one winner.
export function rankCandidates(candidates) {
  const acceptable = candidates.filter((c) => c.count >= MIN_VIABLE_RESULTS);
  const withJitter = acceptable.map((c) => ({ ...c, _jitter: Math.random() }));
  withJitter.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.distinctSources !== a.distinctSources) return b.distinctSources - a.distinctSources;
    return b._jitter - a._jitter;
  });
  return withJitter;
}
