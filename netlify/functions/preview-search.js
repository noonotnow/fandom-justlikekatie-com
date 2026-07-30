import { ACTOR_PACKS } from "./lib/actor-packs.js";
import { searchBaiduImages } from "./lib/baidu-images.js";

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
//   - 谢彬彬: confirmed contamination — his drama "甜甜的陷阱" was wrongly referenced
//     in 张凌赫's medical-vibe queries (now fixed to 爱你/何苏叶), but search engines
//     still associate the two via "陷阱"-adjacent keywords, causing his promotional
//     posters to appear in 张凌赫 doctor-role batches.
//   - 李大齐: homophone collision — 离十六 (Lí Shíliù, Liu Yuning's masked hero
//     in 书卷一梦) vs 李大齐 (Lǐ Dàqí, unrelated character); search engines
//     conflate these due to similar romanization, causing wrong-character results
//     in Liu Yuning drama-role queries.
const KNOWN_COSTAR_DRIFT_NAMES = ["成毅", "谢彬彬", "张凌赫", "李大齐"];

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
  "missevan.com",
  // Eyewear/fashion brand product-catalog sites — their product pages surface for
  // accessory-keyword queries (e.g. "眼镜"/glasses) with zero actor relevance.
  "molsion.com",
  "bolon.com",
  "parasol.cn",
  "lindberg.com",
  "moscot.com",
  "oliverpeoples.com",
  "tomford.com",
  "gucci.com",
  "dior.com",
  "chanel.com",
  "prada.com",
  "versace.com",
  "armani.com"
]);

// Luxury/fashion brand domains that host legitimate editorial and campaign content
// (actor collaborations, lookbooks, stories). These must NOT be domain-blocked —
// the path-based isProductUrl() filter below handles their /shop/ and /product/ pages.
const LUXURY_EDITORIAL_DOMAINS = new Set([
  "gucci.com",
  "dior.com",
  "chanel.com",
  "prada.com",
  "versace.com",
  "armani.com",
  "tomford.com"
]);

// Path patterns that indicate a product/catalog page (not editorial content).
// Used to filter product URLs from luxury editorial domains that pass domain-level checks,
// and as a negative signal for any URL when the title doesn't mention the subject actor.
const PRODUCT_PATH_PATTERNS = [
  "/shop/", "/shop?", "/product/", "/products/",
  "/catalog/", "/catalogue/", "/buy/", "/cart/",
  "/checkout/", "/add-to-bag", "/add-to-cart",
  "/p/", "/item/", "/goods/", "/mall/", "/store/", "/commodity/"
];

// Fewer than this many *useful* (non-commerce, non-placeholder) results triggers SerpAPI fallback.
// The visible unit is a 3x3 (9-slot) preview grid, so Brave should only be trusted to skip
// fallback when it can nearly fill that grid with usable candidates — a handful of thin/
// off-topic results is not enough ("crumbs are not breakfast"). Deliberately set below 9 (not
// requiring a full grid) so fallback isn't forced when Brave genuinely has 7-8 strong candidates.
const USEFUL_FALLBACK_THRESHOLD = 7;

// Simple quality score based on source diversity — a grid with results from
// 5+ unique domains is more trustworthy than 9 results all from one site.
// Returns 0.0-1.0 where 1.0 = excellent diversity.
const QUALITY_DIVERSITY_WEIGHT = 0.6;
const QUALITY_COUNT_WEIGHT = 0.4;
const QUALITY_FALLBACK_THRESHOLD = 0.7;
const SUBJECT_MIN_MENTIONS = 2;
const SUBJECT_MIN_RATIO = 0.25;

function scoreResultQuality(results) {
  if (!results || results.length === 0) return { overall: 0, diversity: 0, countScore: 0 };

  const uniqueSources = new Set(results.map(r => r.source).filter(Boolean));
  // 5+ unique sources = full diversity score
  const diversity = Math.min(uniqueSources.size / 5, 1.0);
  // 9+ results = full count score (grid is 3x3)
  const countScore = Math.min(results.length / 9, 1.0);

  const overall = (diversity * QUALITY_DIVERSITY_WEIGHT) + (countScore * QUALITY_COUNT_WEIGHT);

  return { overall, diversity, countScore, uniqueSources: uniqueSources.size };
}

function containsCjk(text) {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
}

function subjectGuard(rawItems, subjectToken, minimumRatio = 0) {
  const subjectHitCount = subjectToken
    ? rawItems.filter((item) =>
        `${item.title || ""} ${item.description || ""}`.includes(subjectToken),
      ).length
    : rawItems.length;
  const subjectHitRatio = rawItems.length > 0 ? subjectHitCount / rawItems.length : 0;
  return {
    subjectHitCount,
    subjectHitRatio,
    passed:
      !subjectToken ||
      (subjectHitCount >= SUBJECT_MIN_MENTIONS && subjectHitRatio >= minimumRatio),
  };
}

export function sanitizeProviderResults(items, subjectToken) {
  return dedupeSameSource(
    dedupeResults(
      filterResults(items)
        .filter((result) => !isCommerceDomain(result.source))
        .filter((result) => passesPerItemSubjectFilter(result, subjectToken))
        .filter((result) => !isProductUrl(result.link, result.title, subjectToken)),
    ),
  );
}

export async function searchBaiduProvider(
  q,
  { fetchImpl = globalThis.fetch, baiduOptions = {} } = {},
) {
  const subjectToken = q.split(/\s+/)[0] || "";
  const baidu = await searchBaiduImages(q, { fetchImpl, ...baiduOptions });
  const normalized = sanitizeProviderResults(baidu.results, subjectToken);
  const rawGuard = subjectGuard(baidu.results, subjectToken, SUBJECT_MIN_RATIO);
  const normalizedGuard = subjectGuard(normalized, subjectToken, SUBJECT_MIN_RATIO);
  const subjectGuardPassed = rawGuard.passed && normalizedGuard.passed;
  const quality = scoreResultQuality(normalized);
  const viabilityPassed = normalized.length >= USEFUL_FALLBACK_THRESHOLD;
  const qualityPassed = quality.overall >= QUALITY_FALLBACK_THRESHOLD;
  const qualified = subjectGuardPassed && viabilityPassed && qualityPassed;
  const fallbackReason = !subjectGuardPassed
    ? `subject_guard_failed (raw=${rawGuard.subjectHitCount}/${baidu.results.length}, ` +
      `filtered=${normalizedGuard.subjectHitCount}/${normalized.length}, ` +
      `minimum ratio=${SUBJECT_MIN_RATIO})`
    : !viabilityPassed
      ? `useful_count_below_threshold (${normalized.length} < ${USEFUL_FALLBACK_THRESHOLD})`
      : !qualityPassed
        ? `quality_below_threshold (${quality.overall.toFixed(2)} < ${QUALITY_FALLBACK_THRESHOLD}, ` +
          `diversity=${quality.diversity.toFixed(2)}, sources=${quality.uniqueSources})`
        : null;
  return {
    query: q,
    provider: "baidu",
    results: subjectGuardPassed ? normalized : [],
    rawCount: baidu.results.length,
    normalizedCount: normalized.length,
    subjectToken,
    subjectHitCount: rawGuard.subjectHitCount,
    subjectHitRatio: rawGuard.subjectHitRatio,
    normalizedSubjectHitCount: normalizedGuard.subjectHitCount,
    normalizedSubjectHitRatio: normalizedGuard.subjectHitRatio,
    subjectGuardPassed,
    viabilityPassed,
    qualityPassed,
    quality,
    qualified,
    fallbackReason,
    telemetry: baidu.telemetry,
  };
}

function createBaiduAttemptLog(attempted = true) {
  return {
    attempted,
    httpStatus: null,
    error: null,
    errorCode: null,
    rawCount: 0,
    normalizedCount: 0,
    subjectHitCount: 0,
    subjectHitRatio: 0,
    normalizedSubjectHitCount: 0,
    normalizedSubjectHitRatio: 0,
    subjectGuardPassed: null,
    viabilityPassed: null,
    qualityPassed: null,
    quality: null,
    qualified: false,
    usedAsFinal: false,
    fallbackReason: null,
    skippedReason: attempted ? null : "non_cjk_query",
    telemetry: null,
  };
}

function recordBaiduSuccess(log, baidu) {
  log.httpStatus = baidu.telemetry.httpStatus;
  log.rawCount = baidu.rawCount;
  log.normalizedCount = baidu.normalizedCount;
  log.subjectHitCount = baidu.subjectHitCount;
  log.subjectHitRatio = baidu.subjectHitRatio;
  log.normalizedSubjectHitCount = baidu.normalizedSubjectHitCount;
  log.normalizedSubjectHitRatio = baidu.normalizedSubjectHitRatio;
  log.subjectGuardPassed = baidu.subjectGuardPassed;
  log.viabilityPassed = baidu.viabilityPassed;
  log.qualityPassed = baidu.qualityPassed;
  log.quality = baidu.quality;
  log.qualified = baidu.qualified;
  log.usedAsFinal = baidu.qualified;
  log.fallbackReason = baidu.fallbackReason;
  log.telemetry = baidu.telemetry;
}

function baiduResponse(q, baidu, baiduAttemptLog, debug) {
  const response = {
    query: q,
    provider: "baidu",
    results: baidu.results
      .slice(0, 18)
      .map(({ isLogo, thumbnailOriginal, ...result }) => ({ ...result, provider: "baidu" })),
  };
  if (debug) {
    response.version = "baidu-images-v2-primary";
    response.providerSelectionOrder = [
      "baidu",
      "google_images",
      "bing_images",
      "yandex_images",
      "brave",
    ];
    response.providerFetchOrder = ["baidu"];
    response.baiduAttemptLog = baiduAttemptLog;
    response.baiduFallbackUsed = false;
    response.fallbackReason = null;
    response.fallbackUsed = false;
    response.braveAttempted = false;
    response.serpApiAttempted = false;
    response.subjectToken = baidu.subjectToken;
    response.subjectGuardReason =
      `passed_on_baidu (${baidu.subjectHitCount}/${baidu.rawCount} mention ` +
      `"${baidu.subjectToken}", ratio=${baidu.subjectHitRatio.toFixed(2)})`;
    response.qualityFallbackThreshold = QUALITY_FALLBACK_THRESHOLD;
    response.usefulFallbackThreshold = USEFUL_FALLBACK_THRESHOLD;
  }
  return response;
}

// Runs Baidu first. Only when Baidu fails or does not clear filtering, identity,
// viability, and quality gates does it invoke the existing Brave baseline -> SerpAPI
// (google_images -> bing_images -> yandex_images) cascade for the query.
// Includes the ad/commerce/placeholder
// filters and the subject-relevance guard. Returns a plain response-shaped
// object (not an HTTP response) so both the HTTP handler below (manual/full-page
// searches) and other in-process callers (e.g. the star-of-day cache builder)
// can reuse the exact same search logic without an extra HTTP round-trip.
//
// Throws on hard failures (missing key, network error) — callers decide how to
// handle that (the HTTP handler below turns it into a 500; star-of-day treats a
// thrown/empty result as "this candidate query produced nothing usable").
export async function searchOneQuery(
  q,
  { debug = false, fetchImpl = globalThis.fetch, baiduOptions = {} } = {},
) {
  if (!q) {
    throw new Error("Missing query parameter");
  }

  const baiduEligible = containsCjk(q);
  const baiduAttemptLog = createBaiduAttemptLog(baiduEligible);
  if (baiduEligible) {
    try {
      const baidu = await searchBaiduProvider(q, { fetchImpl, baiduOptions });
      recordBaiduSuccess(baiduAttemptLog, baidu);
      if (baidu.qualified) {
        return baiduResponse(q, baidu, baiduAttemptLog, debug);
      }
    } catch (baiduError) {
      baiduAttemptLog.error = baiduError.message || "Baidu fetch error";
      baiduAttemptLog.errorCode = baiduError.code || "unknown";
      baiduAttemptLog.httpStatus = baiduError.status ?? null;
      baiduAttemptLog.fallbackReason = "provider_exception";
      console.warn("Baidu Images provider failed; continuing fallback cascade", {
        query: q,
        code: baiduAttemptLog.errorCode,
        status: baiduAttemptLog.httpStatus,
        message: baiduAttemptLog.error,
      });
    }
  }

  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!braveKey) {
    throw new Error("Brave API key not configured");
  }

  {
    const braveUrl =
      "https://api.search.brave.com/res/v1/web/search" +
      `?q=${encodeURIComponent(q)}` +
      `&count=40` +
      `&safesearch=moderate`;

    const braveResp = await fetchImpl(braveUrl, {
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
        .filter((r) => passesPerItemSubjectFilter(r, subjectToken))
        // Product-URL filter: reject product/catalog pages that don't mention the subject
        .filter((r) => !isProductUrl(r.link, r.title, subjectToken));
      braveNormalized = dedupeResults(braveNormalized);
      braveNormalized = dedupeSameSource(braveNormalized);
      braveUseful = braveNormalized.filter((r) => !isCommerceDomain(r.source))
        .filter((r) => !isProductUrl(r.link, r.title, subjectToken));
    }

    const braveGuard = subjectGuard(braveRaw, subjectToken, SUBJECT_MIN_RATIO);
    const braveSubjectHitCount = braveGuard.subjectHitCount;
    const braveSubjectHitRatio = braveGuard.subjectHitRatio;
    const braveSubjectGuardPassed = braveGuard.passed;

    // Use braveUseful (not braveNormalized) so commerce results are never shown as fallback.
    // For actor/person searches, still try the stronger image providers even when Brave
    // has enough nominal volume: titles that mention the actor can accompany an ensemble
    // or co-star image, which text-only Brave quality checks cannot detect.
    let finalResults = braveSubjectGuardPassed ? braveUseful : [];
    let finalProvider = "brave";
    if (braveSubjectGuardPassed && braveUseful.length > 0) {
      subjectGuardReason = `passed (${braveSubjectHitCount}/${braveRaw.length} mention "${subjectToken}") on brave`;
    } else if (!braveSubjectGuardPassed) {
      subjectGuardReason = `failed_on_brave (${braveSubjectHitCount}/${braveRaw.length} mention "${subjectToken}", minimum ratio ${SUBJECT_MIN_RATIO})`;
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
    const braveQuality = scoreResultQuality(braveUseful);
    const qualityBelowThreshold = braveQuality.overall < QUALITY_FALLBACK_THRESHOLD;
    const preferActorIdentityProvider = !!subjectToken;
    const braveTriggerReason = !braveSubjectGuardPassed
      ? `subject_guard_failed (${braveSubjectHitCount}/${braveRaw.length} mention "${subjectToken}", ratio=${braveSubjectHitRatio.toFixed(2)})`
      : preferActorIdentityProvider
      ? "actor_identity_provider_preference"
      : hasCommerceResults
      ? "commerce_results_present"
      : braveUseful.length < USEFUL_FALLBACK_THRESHOLD
        ? `useful_count_below_threshold (${braveUseful.length} < ${USEFUL_FALLBACK_THRESHOLD})`
        : qualityBelowThreshold
          ? `quality_below_threshold (${braveQuality.overall.toFixed(2)} < ${QUALITY_FALLBACK_THRESHOLD}, diversity=${braveQuality.diversity.toFixed(2)}, sources=${braveQuality.uniqueSources})`
          : `sufficient_quality (${braveQuality.overall.toFixed(2)} >= ${QUALITY_FALLBACK_THRESHOLD}, sources=${braveQuality.uniqueSources})`;
    if (preferActorIdentityProvider || !braveSubjectGuardPassed || hasCommerceResults || braveUseful.length < USEFUL_FALLBACK_THRESHOLD || qualityBelowThreshold) {
      const serpKey = process.env.SERPAPI_KEY;
      serpApiConfigured = !!serpKey;
      if (serpKey) {
        serpApiAttempted = true;
        // Baidu is fetched directly above because SerpAPI has no supported Baidu Images
        // engine. If it is unavailable or fails its gates, continue through the existing
        // SerpAPI engines in their established order.
        const IMAGE_ENGINES = ["google_images", "bing_images", "yandex_images"];
        for (const engine of IMAGE_ENGINES) {
          const engineLog = { engine, httpStatus: null, error: null, rawCount: 0, normalizedCount: 0, subjectHitCount: 0, subjectGuardPassed: null, usedAsFinal: false, skippedReason: null };
          try {

            const serpUrl =
              "https://serpapi.com/search.json" +
              `?engine=${engine}` +
              `&q=${encodeURIComponent(q)}` +
              `&api_key=${serpKey}`;

            serpApiUrlNoKey = serpUrl.replace(serpKey, "[REDACTED]");

            const serpResp = await fetchImpl(serpUrl);
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

            const serpNormalized = dedupeSameSource(dedupeResults(
              filterResults(serpRaw.map((item) => normalizeSerpResult(item, q)))
                .filter((r) => !isCommerceDomain(r.source))
                // Per-item negative filter: reject co-star/wrong-actor and non-subject-content
                // items, same as the Brave path above.
                .filter((r) => passesPerItemSubjectFilter(r, subjectToken))
                .filter((r) => !isProductUrl(r.link, r.title, subjectToken))
            ));
            serpApiNormalizedCount = serpNormalized.length;
            engineLog.normalizedCount = serpNormalized.length;

            // Subject-relevance guard: count how many raw candidates actually mention the
            // subject token in title/description (not the normalized `link`, which always
            // echoes the query string back via SerpAPI's own redirect URL and would trivially
            // "pass" regardless of real relevance).
            const serpGuard = subjectGuard(serpRaw, subjectToken, SUBJECT_MIN_RATIO);
            const subjectHitCount = serpGuard.subjectHitCount;
            const subjectGuardPassed = serpGuard.passed;
            engineLog.subjectHitCount = subjectHitCount;
            engineLog.subjectHitRatio = serpGuard.subjectHitRatio;
            engineLog.subjectGuardPassed = subjectGuardPassed;

            if (serpNormalized.length > 0 && subjectGuardPassed) {
              finalResults = serpNormalized;
              finalProvider = engine;
              engineLog.usedAsFinal = true;
              subjectGuardReason =
                `passed_on_${engine} (${subjectHitCount}/${serpRaw.length} mention "${subjectToken}", ` +
                `ratio=${serpGuard.subjectHitRatio.toFixed(2)})`;
              serpApiEngineLog.push(engineLog);
              break;
            } else {
              engineLog.skippedReason = serpNormalized.length === 0
                ? "zero_useful_results_after_filtering"
                : `subject_guard_failed (${subjectHitCount}/${serpRaw.length}, ` +
                  `ratio=${serpGuard.subjectHitRatio.toFixed(2)} < ${SUBJECT_MIN_RATIO})`;
              if (serpNormalized.length > 0 && !subjectGuardPassed) {
                subjectGuardReason =
                  `failed_on_${engine} (${subjectHitCount}/${serpRaw.length}, ` +
                  `ratio=${serpGuard.subjectHitRatio.toFixed(2)} < ${SUBJECT_MIN_RATIO})`;
              }
              serpApiEngineLog.push(engineLog);
            }
          } catch (serpErr) {
            serpApiError = serpErr.message || "fetch error";
            engineLog.error = serpApiError;
            engineLog.skippedReason = "exception";
            serpApiEngineLog.push(engineLog);
          }
        }
      }
    }

    const response = {
      query: q,
      provider: finalProvider,
      results: finalResults
        .slice(0, 18)
        .map(({ isLogo, thumbnailOriginal, ...result }) => ({ ...result, provider: finalProvider }))
    };

    if (debug) {
      response.version = "baidu-images-v2-primary";
      response.providerSelectionOrder = baiduEligible
        ? ["baidu", "google_images", "bing_images", "yandex_images", "brave"]
        : ["google_images", "bing_images", "yandex_images", "brave"];
      response.providerFetchOrder = [
        ...(baiduEligible ? ["baidu"] : []),
        "brave_baseline",
        ...serpApiEngineLog.map((entry) => entry.engine),
      ];
      response.braveRawCount = braveRaw.length;
      response.braveNormalizedCount = braveNormalized.length;
      response.braveUsefulCount = braveUseful.length;
      response.braveTriggerReason = braveTriggerReason;
      response.braveQuality = braveQuality;
      response.braveSubjectHitRatio = braveSubjectHitRatio;
      response.braveSubjectMinimumRatio = SUBJECT_MIN_RATIO;
      response.qualityFallbackThreshold = QUALITY_FALLBACK_THRESHOLD;
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
      response.baiduAttemptLog = baiduAttemptLog;
      response.baiduFallbackUsed = baiduEligible;
      response.fallbackReason = baiduEligible ? baiduAttemptLog.fallbackReason : null;
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

// Thin HTTP wrapper for manual/full-page searches. `brave` runs the complete provider
// cascade; `baidu` exposes the direct provider path for diagnostics and explicit use.
export async function handler(event) {
  const q = (event.queryStringParameters?.q || "").trim();
  const provider = (event.queryStringParameters?.provider || "brave").trim();
  const debug = event.queryStringParameters?.debug === "1";

  if (!q) {
    return jsonResponse(400, { query: q, provider, results: [], error: "Missing query parameter" });
  }

  if (!["brave", "baidu"].includes(provider)) {
    return jsonResponse(400, {
      query: q,
      provider,
      results: [],
      error: "Unsupported provider (supported: 'brave', 'baidu')",
    });
  }

  try {
    if (provider === "baidu") {
      const baidu = await searchBaiduProvider(q);
      const baiduAttemptLog = createBaiduAttemptLog();
      recordBaiduSuccess(baiduAttemptLog, baidu);
      const response = {
        query: q,
        provider,
        results: (baidu.qualified ? baidu.results : [])
          .slice(0, 18)
          .map(({ isLogo, thumbnailOriginal, ...result }) => ({ ...result, provider })),
      };
      if (!baidu.qualified) {
        response.error = `Baidu batch rejected: ${baidu.fallbackReason}`;
      }
      if (debug) {
        response.version = "baidu-images-v2-primary";
        response.baiduAttemptLog = baiduAttemptLog;
      }
      return jsonResponse(200, response);
    }

    const response = await searchOneQuery(q, { debug });
    return jsonResponse(200, response);
  } catch (err) {
    return jsonResponse(provider === "baidu" ? 502 : 500, {
      query: q,
      provider,
      results: [],
      error: err.message || "Unknown error",
      ...(debug && provider === "baidu"
        ? {
            baiduAttemptLog: {
              attempted: true,
              error: err.message || "Unknown error",
              errorCode: err.code || "unknown",
              httpStatus: err.status ?? null,
            },
          }
        : {}),
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

function isLuxuryEditorialDomain(source) {
  if (!source) return false;
  return [...LUXURY_EDITORIAL_DOMAINS].some((d) => source === d || source.endsWith("." + d));
}

function isCommerceDomain(source) {
  if (!source) return false;
  // Luxury editorial domains are never treated as commerce — their product pages
  // are caught by the path-based isProductUrl() filter instead.
  if (isLuxuryEditorialDomain(source)) return false;
  return [...COMMERCE_DOMAINS].some((d) => source === d || source.endsWith("." + d));
}

// Detects product/catalog URLs that matched on a generic keyword (e.g. "眼镜") but
// have nothing to do with the actor. Only rejects when subject is NOT mentioned in
// the title — editorial pages that happen to live under /product/ paths are kept.
function isProductUrl(link, title, subjectToken) {
  if (!link || !subjectToken) return false;
  if (title && title.includes(subjectToken)) return false;
  const lower = link.toLowerCase();
  return PRODUCT_PATH_PATTERNS.some((p) => lower.includes(p));
}

// Same-source near-dedup: collapses results from the same domain that share a very
// similar title (likely zoomed/cropped variants of the same image or the same ad
// shown multiple times). Keeps the first occurrence only.
function dedupeSameSource(items) {
  const seen = new Map(); // domain → Set of normalized title prefixes
  return items.filter((r) => {
    if (!r.source || !r.title) return true;
    const key = r.source;
    const titleNorm = r.title.replace(/\s+/g, "").slice(0, 20);
    if (!seen.has(key)) {
      seen.set(key, new Set([titleNorm]));
      return true;
    }
    const titles = seen.get(key);
    if (titles.has(titleNorm)) return false;
    titles.add(titleNorm);
    return true;
  });
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
