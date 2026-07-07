import { ACTOR_PACKS } from "./lib/actor-packs.js";

// Non-subject content: things that regularly slip past ad/commerce/placeholder
// filters (real photos, not logos, not known commerce domains) but are reliably
// NOT actor/drama content for a person-name query — maps/geography, historical
// paintings/portraits of unrelated figures, and app-store/screenshot tiles (e.g.
// an Apple Music app icon surfacing for an "眼镜"/glasses query). Text-heuristic
// only — this is not image content recognition, just keyword rejection.
// Note: bare terms like "皇帝"/"帝王" are deliberately NOT included — costume-drama
// titles legitimately describe an actor's "emperor"/"imperial" role or styling (e.g.
// "刘学义 草原帝王造型"), so a bare keyword would false-positive on real subject
// content. Only compound phrases that specifically indicate an actual painting/
// portrait artifact (not a drama role) are used here.
const NON_SUBJECT_KEYWORDS = [
  "中国地图", "世界地图", "地形图", "省份地图", "行政区划地图", "地图查询", "地图库",
  "皇帝画像", "帝王画像", "古代帝王画像", "历代帝王图", "历史人物画像", "肖像画", "国画欣赏", "水墨人物画",
  "app store", "应用商店", "apple music", "google play", "下载量", "好评率", "应用截图", "app截图"
];

// Reference/encyclopedia domains: structured as "one page = one subject" (a person,
// place, dynasty, historical event). If the subject being searched doesn't appear in
// the page's own title, the page is reliably about something/someone else entirely —
// this catches wrong-person historical figures (e.g. an unrelated "权臣"/powerful-
// minister search pulling up a completely different historical minister's baike
// entry), dynasty/geography wiki pages (which often illustrate themselves with a
// map), and similar reference-content drift that no keyword/roster list can predict
// in advance, since these are essentially unbounded (any historical figure/place).
const REFERENCE_DOMAINS = [
  "baike.baidu.com",
  "wapbaike.baidu.com",
  "baike.sogou.com",
  "wikipedia.org"
];

function isReferenceDomain(source) {
  if (!source) return false;
  const lower = source.toLowerCase();
  return REFERENCE_DOMAINS.some((d) => lower === d || lower.endsWith("." + d));
}

function isNonSubjectContent(title) {
  if (!title) return false;
  const lower = title.toLowerCase();
  return NON_SUBJECT_KEYWORDS.some((k) => lower.includes(k.toLowerCase()));
}

// Closed roster of known actor names (from ACTOR_PACKS) used as a co-star/wrong-actor
// negative filter: if a result's title/description names a DIFFERENT known actor and
// does not also name the subject being searched, it's very likely a poster/article
// about that other actor (or a co-star shot) riding along on a shared-vibe keyword,
// not genuine subject content. This only catches contamination from actors already
// in our own roster — it is not general face/identity recognition.
const ALL_ACTOR_NAME_TOKENS = ACTOR_PACKS.flatMap((a) =>
  [a.name, a.shortName].filter((n) => typeof n === "string" && n.length >= 2)
);

// Additional known co-stars NOT in our own tracked roster (ACTOR_PACKS is app-facing
// data for actors we build full vibe pages for — this list is purely for the negative
// filter above, so it doesn't belong in ACTOR_PACKS itself). Added only when there's
// concrete, documented recurring drift, not as a speculative taxonomy:
//   - 成毅: confirmed contamination case (QA screenshot) — appeared as the bold-text-
//     labeled featured subject of a tile in a 刘学义 "破碎感/古装" batch, a frequent
//     costume-drama/权谋-genre co-star whose name adjacency causes drift into our
//     roster actors' searches.
const KNOWN_COSTAR_DRIFT_NAMES = ["成毅"];

const ALL_KNOWN_PERSON_NAME_TOKENS = [...ALL_ACTOR_NAME_TOKENS, ...KNOWN_COSTAR_DRIFT_NAMES];

function mentionsOtherActor(text, subjectToken) {
  if (!text) return false;
  return ALL_KNOWN_PERSON_NAME_TOKENS.some(
    (tok) => tok !== subjectToken && text.includes(tok) && !text.includes(subjectToken)
  );
}

// Surname-collision namesake guard: catches a different, unrelated real person who
// happens to share the subject's surname (e.g. a query for "刘学义" pulling in a
// result that's actually about "刘宇" or "刘天成" — a K-pop idol or unrelated
// person, not a co-star, not in any roster, purely a keyword/surname collision on
// a generic query word like "眼镜"/glasses). Confirmed live: "刘学义 西装 眼镜"
// pulled a 刘宇(ENHYPEN) bilibili result, "刘学义 眼镜 现代" pulled a
// 刘宝/刘天成 sohu result — neither mentions the subject at all.
//
// Deliberately conservative: only fires when the subject's own name is COMPLETELY
// absent from the text (so it never rejects legitimate results that mention both
// people, or generic captions that don't name anyone), and only flags a same-
// surname 2-3 char token that isn't a prefix/substring relationship with the
// subject's own name (so partial matches on the subject's own name never trip it).
function mentionsUnrelatedNamesake(text, subjectToken) {
  if (!text || !subjectToken || subjectToken.length < 2) return false;
  if (text.includes(subjectToken)) return false; // subject IS named — not a collision case
  const surname = subjectToken[0];
  const re = new RegExp(surname + "[\\u4e00-\\u9fa5]{1,2}", "g");
  const matches = text.match(re) || [];
  return matches.some((m) => m !== subjectToken && !m.startsWith(subjectToken) && !subjectToken.startsWith(m));
}

// Per-item subject-relevance filter: negative-only (never requires a positive name
// mention, since most legitimate fan-photo titles are generic and don't repeat the
// actor's name) but rejects items that show a concrete contamination signal — the
// title/description names a different known actor, a different same-surname
// namesake, matches an obvious non-subject-content keyword, or is a reference/
// encyclopedia page whose own title doesn't name the subject. Applied to every item
// in every batch, regardless of which provider/engine produced it or whether the
// batch-level guard below passed.
function passesPerItemSubjectFilter(item, subjectToken) {
  const text = `${item.title || ""} ${item.description || ""}`;
  if (isNonSubjectContent(text)) return false;
  if (subjectToken && mentionsOtherActor(text, subjectToken)) return false;
  if (subjectToken && mentionsUnrelatedNamesake(text, subjectToken)) return false;
  if (subjectToken && isReferenceDomain(item.source) && !text.includes(subjectToken)) return false;
  return true;
}

// De-duplicates a result list by exact thumbnail URL only — NOT by title, and NOT
// by a truncated/query-stripped URL. Some providers (notably Google Images via
// SerpAPI) encode the actual unique-image identifier *inside* the query string of
// a shared thumbnail-proxy host (e.g. gstatic.com/images?q=tbn:<hash>), so
// stripping query params before comparing would wrongly treat every distinct
// image as a duplicate of the first. Title-based dedup is also intentionally
// avoided — many distinct real photos share an identical source-article title.
function dedupeResults(items) {
  const seenThumbs = new Set();
  return items.filter((r) => {
    const thumbKey = r.thumbnail || "";
    if (thumbKey && seenThumbs.has(thumbKey)) return false;
    if (thumbKey) seenThumbs.add(thumbKey);
    return true;
  });
}

const PLACEHOLDER_THUMBNAIL_PATTERNS = [
  "favicon",
  "static/baike",
  "baike.png",
  "x320.png",
  "/logo.",
  "_logo.",
  "-logo.",
  "/logos/"
];

const PLACEHOLDER_TITLE_PATTERNS = [
  "sina logo",
  "site logo",
  "favicon"
];

// Ad/promo junk patterns in titles — beauty/body-transformation ads, sponsored content.
// These are not actor content and should be filtered regardless of source domain.
const AD_TITLE_PATTERNS = [
  "变美", "变瘦", "变卡通", "最瘦", "瘦20斤", "瘦10斤", "瘦30斤",
  "广告", "推广", "sponsored",
  "一键变", "ai生成", "ai换脸", "ai写真", "一键生成",
  "减肥", "塑形", "瘦身",
  // Additional explicit CTA/marketing phrases — best-effort textual defense. Note:
  // this still only catches ad text present in the page's title/description
  // metadata. An ad graphic with marketing text baked into the image pixels itself
  // (rather than the surrounding page's title) is NOT detectable this way — that
  // would require real image content/OCR analysis, out of scope for this filter.
  "点击下方链接", "点击链接", "立即体验", "扫码体验", "免费试用", "限时优惠"
];

// Commerce/product/off-topic domains that are not useful for actor/drama preview.
// These count as zero useful results even if they pass the thumbnail filter.
const COMMERCE_DOMAINS = new Set([
  "1688.com",
  "taobao.com",
  "tmall.com",
  "jd.com",
  "aliexpress.com",
  "amazon.com",
  "amazon.co.jp",
  "rakuten.co.jp",
  "ebay.com",
  "sportsv.net",
  "dhgate.com",
  "pinduoduo.com",
  "vvic.com",
  "missevan.com"
]);

// Fewer than this many *useful* (non-commerce, non-placeholder) results triggers SerpAPI fallback.
// The visible unit is a 3x3 (9-slot) preview grid, so Brave should only be trusted to skip
// fallback when it can nearly fill that grid with usable candidates — a handful of thin/
// off-topic results is not enough ("crumbs are not breakfast"). Deliberately set below 9 (not
// requiring a full grid) so fallback isn't forced when Brave genuinely has 7-8 strong candidates.
const USEFUL_FALLBACK_THRESHOLD = 7;

// Runs the full Brave -> SerpAPI (bing_images -> google_images -> yandex_images)
// fallback cascade for a single query, including the ad/commerce/placeholder
// filters and the subject-relevance guard. Returns a plain response-shaped
// object (not an HTTP response) so both the HTTP handler below (manual/full-page
// searches) and other in-process callers (e.g. the star-of-day cache builder)
// can reuse the exact same search logic without an extra HTTP round-trip.
//
// Throws on hard failures (missing key, network error) — callers decide how to
// handle that (the HTTP handler below turns it into a 500; star-of-day treats a
// thrown/empty result as "this candidate query produced nothing usable").
export async function searchOneQuery(q, { debug = false } = {}) {
  const provider = "brave";

  if (!q) {
    throw new Error("Missing query parameter");
  }

  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!braveKey) {
    throw new Error("Brave API key not configured");
  }

  {
    const braveUrl =
      "https://api.search.brave.com/res/v1/web/search" +
      `?q=${encodeURIComponent(q)}` +
      `&count=20` +
      `&safesearch=moderate`;

    const braveResp = await fetch(braveUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": braveKey
      }
    });

    let braveNormalized = [];
    let braveUseful = [];
    let braveRaw = [];
    let braveData = {};

    // Lightweight subject-relevance guard for person/actor queries: the primary subject is
    // assumed to be the first whitespace-separated token in the query (e.g. "王以纶" in
    // "王以纶 眼镜 书生"). A provider can return a large, well-formed result set that is
    // nonetheless entirely off-topic (e.g. bing_images returning unrelated stock-photo/
    // insect content for a narrow actor query) — "a full plate of bugs is also not
    // breakfast." Require at least 2 candidate results to mention the subject token in
    // their title/description before trusting that engine's results as final. This guard
    // now applies on BOTH the Brave path and the SerpAPI cascade below (previously it only
    // existed inside the SerpAPI loop, so Brave — the primary, most-used path — had zero
    // subject-relevance checking at all).
    const SUBJECT_MIN_MENTIONS = 2;
    const subjectToken = q.split(/\s+/)[0] || "";
    let subjectGuardReason = "not_applicable";

    if (braveResp.ok) {
      braveData = await braveResp.json();
      braveRaw =
        Array.isArray(braveData.results) ? braveData.results :
        Array.isArray(braveData.web?.results) ? braveData.web.results :
        [];
      braveNormalized = filterResults(braveRaw.map((item) => normalizeWebResult(item, q)))
        // Per-item negative filter: reject co-star/wrong-actor and non-subject-content
        // (maps, paintings, app-store tiles) items regardless of which engine/provider
        // produced them or whether the batch-level guard below passes.
        .filter((r) => passesPerItemSubjectFilter(r, subjectToken));
      braveNormalized = dedupeResults(braveNormalized);
      braveUseful = braveNormalized.filter((r) => !isCommerceDomain(r.source));
    }

    const braveSubjectHitCount = subjectToken
      ? braveRaw.filter((item) => `${item.title || ""} ${item.description || ""}`.includes(subjectToken)).length
      : braveRaw.length;
    const braveSubjectGuardPassed = !subjectToken || braveSubjectHitCount >= SUBJECT_MIN_MENTIONS;

    // Fall back to Baidu via SerpAPI if any commerce/junk results are present, useful count
    // is low, or the subject-relevance guard fails on Brave's own raw result set.
    // Use braveUseful (not braveNormalized) so commerce results are never shown as fallback.
    let finalResults = braveSubjectGuardPassed ? braveUseful : [];
    let finalProvider = "brave";
    if (braveSubjectGuardPassed && braveUseful.length > 0) {
      subjectGuardReason = `passed (${braveSubjectHitCount} >= ${SUBJECT_MIN_MENTIONS} mentions of "${subjectToken}") on brave`;
    } else if (!braveSubjectGuardPassed) {
      subjectGuardReason = `failed_on_brave (${braveSubjectHitCount} < ${SUBJECT_MIN_MENTIONS} mentions of "${subjectToken}")`;
    }

    let serpApiConfigured = false;
    let serpApiAttempted = false;
    let serpApiHttpStatus = null;
    let serpApiResponseKeys = [];
    let serpApiError = null;
    let serpApiSearchMetadata = null;
    let serpApiSearchParameters = null;
    let serpApiCandidateArrays = {};
    let serpApiRawCount = 0;
    let serpApiNormalizedCount = 0;
    let serpApiFirstResultKeys = [];
    let serpApiFirstResultSample = null;
    let serpApiUrlNoKey = null;
    let serpApiEngineLog = [];

    const hasCommerceResults = braveNormalized.length > braveUseful.length;
    const braveTriggerReason = !braveSubjectGuardPassed
      ? `subject_guard_failed (${braveSubjectHitCount} < ${SUBJECT_MIN_MENTIONS} mentions of "${subjectToken}")`
      : hasCommerceResults
      ? "commerce_results_present"
      : braveUseful.length < USEFUL_FALLBACK_THRESHOLD
        ? `useful_count_below_threshold (${braveUseful.length} < ${USEFUL_FALLBACK_THRESHOLD})`
        : `sufficient_useful_results (${braveUseful.length} >= ${USEFUL_FALLBACK_THRESHOLD})`;
    if (!braveSubjectGuardPassed || hasCommerceResults || braveUseful.length < USEFUL_FALLBACK_THRESHOLD) {
      const serpKey = process.env.SERPAPI_KEY;
      serpApiConfigured = !!serpKey;
      if (serpKey) {
        serpApiAttempted = true;
        try {
          // Try image engines in order: bing_images → google_images → yandex_images.
          // Baidu is intentionally excluded here — SerpAPI has no supported baidu images
          // engine (baidu_image / baidu_images both 400 "Unsupported engine"). Baidu is
          // still offered to users as a direct deep-link button (see index.html), which
          // is unrelated to this SerpAPI cascade.
          const IMAGE_ENGINES = ["bing_images", "google_images", "yandex_images"];
          for (const engine of IMAGE_ENGINES) {
            const engineLog = { engine, httpStatus: null, error: null, rawCount: 0, normalizedCount: 0, subjectHitCount: 0, subjectGuardPassed: null, usedAsFinal: false, skippedReason: null };

            const serpUrl =
              "https://serpapi.com/search.json" +
              `?engine=${engine}` +
              `&q=${encodeURIComponent(q)}` +
              `&api_key=${serpKey}`;

            serpApiUrlNoKey = serpUrl.replace(serpKey, "[REDACTED]");

            const serpResp = await fetch(serpUrl);
            serpApiHttpStatus = serpResp.status;
            engineLog.httpStatus = serpResp.status;
            const serpData = await serpResp.json();
            serpApiResponseKeys = Object.keys(serpData);
            serpApiError = serpData.error ?? null;
            engineLog.error = serpApiError;
            serpApiSearchMetadata = serpData.search_metadata
              ? { status: serpData.search_metadata.status, engine_url: serpData.search_metadata.engine_url }
              : null;
            serpApiSearchParameters = serpData.search_parameters ?? null;

            // Skip unsupported/erroring engines and try next
            if (!serpResp.ok || serpApiError) {
              engineLog.skippedReason = !serpResp.ok
                ? `http_${serpResp.status}`
                : `api_error: ${serpApiError}`;
              serpApiEngineLog.push(engineLog);
              continue;
            }

            // Probe all candidate result array keys
            for (const key of ["images_results", "image_results", "results", "organic_results"]) {
              if (Array.isArray(serpData[key])) {
                serpApiCandidateArrays[key] = serpData[key].length;
              }
            }

            const serpRaw =
              Array.isArray(serpData.images_results) ? serpData.images_results :
              Array.isArray(serpData.image_results) ? serpData.image_results :
              [];
            serpApiRawCount = serpRaw.length;
            engineLog.rawCount = serpRaw.length;
            serpApiFirstResultKeys = serpRaw[0] ? Object.keys(serpRaw[0]) : [];
            serpApiFirstResultSample = serpRaw[0]
              ? Object.fromEntries(Object.keys(serpRaw[0]).map(k => [k, typeof serpRaw[0][k]]))
              : null;

            const serpNormalized = dedupeResults(
              filterResults(serpRaw.map((item) => normalizeSerpResult(item, q)))
                .filter((r) => !isCommerceDomain(r.source))
                // Per-item negative filter: reject co-star/wrong-actor and non-subject-content
                // items, same as the Brave path above.
                .filter((r) => passesPerItemSubjectFilter(r, subjectToken))
            );
            serpApiNormalizedCount = serpNormalized.length;
            engineLog.normalizedCount = serpNormalized.length;

            // Subject-relevance guard: count how many raw candidates actually mention the
            // subject token in title/description (not the normalized `link`, which always
            // echoes the query string back via SerpAPI's own redirect URL and would trivially
            // "pass" regardless of real relevance).
            const subjectHitCount = subjectToken
              ? serpRaw.filter((item) => `${item.title || ""} ${item.description || ""}`.includes(subjectToken)).length
              : serpRaw.length; // no token to check against — don't block
            const subjectGuardPassed = !subjectToken || subjectHitCount >= SUBJECT_MIN_MENTIONS;
            engineLog.subjectHitCount = subjectHitCount;
            engineLog.subjectGuardPassed = subjectGuardPassed;

            if (serpNormalized.length > 0 && subjectGuardPassed) {
              finalResults = serpNormalized;
              finalProvider = engine;
              engineLog.usedAsFinal = true;
              subjectGuardReason = `passed (${subjectHitCount} >= ${SUBJECT_MIN_MENTIONS} mentions of "${subjectToken}")`;
              serpApiEngineLog.push(engineLog);
              break;
            } else {
              engineLog.skippedReason = serpNormalized.length === 0
                ? "zero_useful_results_after_filtering"
                : `subject_guard_failed (${subjectHitCount} < ${SUBJECT_MIN_MENTIONS} mentions of "${subjectToken}")`;
              if (serpNormalized.length > 0 && !subjectGuardPassed) {
                subjectGuardReason = `failed_on_${engine} (${subjectHitCount} < ${SUBJECT_MIN_MENTIONS} mentions of "${subjectToken}")`;
              }
              serpApiEngineLog.push(engineLog);
            }
          }
        } catch (serpErr) {
          serpApiError = serpErr.message || "fetch error";
          serpApiEngineLog.push({ engine: "unknown", httpStatus: null, error: serpApiError, rawCount: 0, normalizedCount: 0, usedAsFinal: false, skippedReason: "exception" });
        }
      }
    }

    const response = {
      query: q,
      provider: finalProvider,
      results: finalResults.slice(0, 9).map(({ isLogo, thumbnailOriginal, ...r }) => r)
    };

    if (debug) {
      response.version = "serpapi-fallback-v10-subject-fidelity";
      response.braveRawCount = braveRaw.length;
      response.braveNormalizedCount = braveNormalized.length;
      response.braveUsefulCount = braveUseful.length;
      response.braveTriggerReason = braveTriggerReason;
      response.subjectToken = subjectToken;
      response.subjectGuardReason = subjectGuardReason;
      response.serpApiConfigured = serpApiConfigured;
      response.serpApiAttempted = serpApiAttempted;
      response.serpApiUrlNoKey = serpApiUrlNoKey;
      response.serpApiHttpStatus = serpApiHttpStatus;
      response.serpApiResponseKeys = serpApiResponseKeys;
      response.serpApiError = serpApiError;
      response.serpApiSearchMetadata = serpApiSearchMetadata;
      response.serpApiSearchParameters = serpApiSearchParameters;
      response.serpApiCandidateArrays = serpApiCandidateArrays;
      response.serpApiRawCount = serpApiRawCount;
      response.serpApiNormalizedCount = serpApiNormalizedCount;
      response.serpApiFirstResultKeys = serpApiFirstResultKeys;
      response.serpApiFirstResultSample = serpApiFirstResultSample;
      // Per-engine attempt log, in cascade order: which engines were tried, skipped (and why),
      // their HTTP status, raw/normalized candidate counts, and which one (if any) was used.
      response.serpApiEngineLog = serpApiEngineLog;
      response.fallbackUsed = finalProvider !== "brave";
      response.rawTopLevelKeys = Object.keys(braveData);
      response.firstResultKeys = braveRaw[0] ? Object.keys(braveRaw[0]) : [];
      response.firstResultSample = braveRaw[0] ?? null;
    }

    return response;
  }
}

// Thin HTTP wrapper around searchOneQuery() for manual/full-page searches — behavior
// and response shape here are unchanged from before the refactor.
export async function handler(event) {
  const q = (event.queryStringParameters?.q || "").trim();
  const provider = (event.queryStringParameters?.provider || "brave").trim();
  const debug = event.queryStringParameters?.debug === "1";

  if (!q) {
    return jsonResponse(400, { query: q, provider, results: [], error: "Missing query parameter" });
  }

  if (provider !== "brave") {
    return jsonResponse(400, { query: q, provider, results: [], error: "Unsupported provider (only 'brave' supported for now)" });
  }

  try {
    const response = await searchOneQuery(q, { debug });
    return jsonResponse(200, response);
  } catch (err) {
    return jsonResponse(500, {
      query: q,
      provider,
      results: [],
      error: err.message || "Unknown error"
    });
  }
}

function filterResults(items) {
  return items.filter(
    (r) =>
      typeof r.thumbnail === "string" &&
      r.thumbnail &&
      typeof r.link === "string" &&
      r.link &&
      !r.isLogo &&
      !isPlaceholderThumbnail(r.thumbnail) &&
      !isPlaceholderThumbnail(r.thumbnailOriginal) &&
      !isPlaceholderTitle(r.title) &&
      !isAdTitle(r.title)
  );
}

function isAdTitle(title) {
  if (!title) return false;
  const lower = title.toLowerCase();
  return AD_TITLE_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

function isCommerceDomain(source) {
  if (!source) return false;
  return [...COMMERCE_DOMAINS].some((d) => source === d || source.endsWith("." + d));
}

function isPlaceholderThumbnail(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return PLACEHOLDER_THUMBNAIL_PATTERNS.some((p) => lower.includes(p));
}

function isPlaceholderTitle(title) {
  if (!title) return false;
  const lower = title.toLowerCase();
  return PLACEHOLDER_TITLE_PATTERNS.some((p) => lower.includes(p));
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function safeHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeWebResult(item, fallbackTitle) {
  const title = item.title || item.description || fallbackTitle;
  const thumbnailObj = item.thumbnail;
  const thumbnail =
    thumbnailObj?.src ||
    thumbnailObj?.url ||
    (typeof thumbnailObj === "string" ? thumbnailObj : "") ||
    "";
  const isLogo = thumbnailObj?.logo === true;
  const thumbnailOriginal = thumbnailObj?.original || "";
  const link = item.url || "";
  const source = safeHostname(link) || "Web result";
  return { title, thumbnail, isLogo, thumbnailOriginal, link, source };
}

function normalizeSerpResult(item, fallbackTitle) {
  const title = item.title || fallbackTitle;
  const thumbnail = item.thumbnail || "";
  const thumbnailOriginal = item.original || "";
  const link = item.link || item.original || "";
  // Bing (and possibly other) SerpAPI engines return a viewer-redirect URL in `link`
  // (e.g. bing.com/images/search?...) rather than the real source page, which would
  // make safeHostname(link) resolve to the engine's own domain instead of the actual
  // site. Prefer the engine-provided `domain` field when present, since it names the
  // true origin site directly; fall back to the original link-based hostname otherwise.
  const source = item.domain || safeHostname(link) || "Image";
  return { title, thumbnail, isLogo: false, thumbnailOriginal, link, source };
}
