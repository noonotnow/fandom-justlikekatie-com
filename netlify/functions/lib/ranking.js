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
// streaming-product tiles, portal home-page/logo tiles, and stock-photography /
// eyewear-brand product-catalog sites.
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
  "cls.cn",
  "play.google.com",
  // Stock-photo/generic-image-library sites: a generic-object query word (e.g. an
  // accessory like "眼镜"/glasses) will pull literal stock photography of that
  // object with zero connection to any actor, even though nothing about the
  // title/text trips the ad or commerce filters. These sites are inherently never
  // actor/drama content, so a domain-level block is safe and general.
  "dreamstime.com",
  "shutterstock.com",
  "gettyimages.com",
  "istockphoto.com",
  "alamy.com",
  "123rf.com",
  "stock.adobe.com",
  "depositphotos.com",
  // Eyewear/optical brand and retailer sites: same failure mode as stock photos —
  // a "眼镜"(glasses)-style query pulls literal product-catalog pages for glasses
  // brands, not photos of the actor wearing glasses.
  "zeiss.com",
  "silhouette.com",
  "rayban.com",
  "oakley.com",
  "warbyparker.com",
  "essilor.com"
];

// Luxury/fashion brand domains that host legitimate editorial and campaign content.
// These must NOT be treated as junk — actor brand campaigns (Dylan Wang × Gucci, etc.)
// are exactly the kind of content this app surfaces.
export const LUXURY_EDITORIAL_DOMAINS = [
  "gucci.com",
  "dior.com",
  "chanel.com",
  "prada.com",
  "versace.com",
  "armani.com",
  "tomford.com"
];

export function isJunkSource(source) {
  if (!source) return false;
  const lower = source.toLowerCase();
  // Never block luxury editorial domains at the domain level.
  if (LUXURY_EDITORIAL_DOMAINS.some((d) => lower === d || lower.endsWith("." + d))) return false;
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

// Ranked selector: drop sparse/junk-dominated batches, then split into a "near-tie
// band" and the rest. Candidates whose clean-result count is within CLOSE_COUNT_RANGE
// of the maximum form the band — within that band, source diversity wins over raw
// count (so 17 results from 6 sources beats 18 results all from one domain).
// Candidates below the band sort normally by count → diversity → jitter.
export function rankCandidates(candidates) {
  const acceptable = candidates.filter((c) => c.count >= MIN_VIABLE_RESULTS);
  if (acceptable.length === 0) return [];

  const maxCount = Math.max(...acceptable.map((c) => c.count));

  // Near-tie band: counts within CLOSE_COUNT_RANGE of the best are treated as equivalent.
  const band = acceptable.filter((c) => c.count >= maxCount - CLOSE_COUNT_RANGE);
  const rest = acceptable.filter((c) => c.count < maxCount - CLOSE_COUNT_RANGE);

  const bandWithJitter = band.map((c) => ({ ...c, _jitter: Math.random() }));
  bandWithJitter.sort((a, b) => {
    if (b.distinctSources !== a.distinctSources) return b.distinctSources - a.distinctSources;
    return b._jitter - a._jitter;
  });

  const restWithJitter = rest.map((c) => ({ ...c, _jitter: Math.random() }));
  restWithJitter.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.distinctSources !== a.distinctSources) return b.distinctSources - a.distinctSources;
    return b._jitter - a._jitter;
  });

  return [...bandWithJitter, ...restWithJitter];
}
