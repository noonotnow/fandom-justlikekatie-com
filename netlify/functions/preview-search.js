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

// Fewer than this many *useful* (non-commerce, non-placeholder) results triggers Baidu fallback
const USEFUL_FALLBACK_THRESHOLD = 3;

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

  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!braveKey) {
    return jsonResponse(500, { query: q, provider, results: [], error: "Brave API key not configured" });
  }

  try {
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

    if (braveResp.ok) {
      braveData = await braveResp.json();
      braveRaw =
        Array.isArray(braveData.results) ? braveData.results :
        Array.isArray(braveData.web?.results) ? braveData.web.results :
        [];
      braveNormalized = filterResults(braveRaw.map((item) => normalizeWebResult(item, q)));
      braveUseful = braveNormalized.filter((r) => !isCommerceDomain(r.source));
    }

    // Fall back to Baidu via SerpAPI if any commerce/junk results are present, or useful count is low.
    // Use braveUseful (not braveNormalized) so commerce results are never shown as fallback.
    let finalResults = braveUseful;
    let finalProvider = "brave";

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

    const hasCommerceResults = braveNormalized.length > braveUseful.length;
    if (hasCommerceResults || braveUseful.length < USEFUL_FALLBACK_THRESHOLD) {
      const serpKey = process.env.SERPAPI_KEY;
      serpApiConfigured = !!serpKey;
      if (serpKey) {
        serpApiAttempted = true;
        try {
          const serpUrl =
            "https://serpapi.com/search.json" +
            `?engine=baidu_images` +
            `&q=${encodeURIComponent(q)}` +
            `&api_key=${serpKey}`;

          serpApiUrlNoKey = serpUrl.replace(serpKey, "[REDACTED]");

          const serpResp = await fetch(serpUrl);
          serpApiHttpStatus = serpResp.status;
          const serpData = await serpResp.json();
          serpApiResponseKeys = Object.keys(serpData);
          serpApiError = serpData.error ?? null;
          serpApiSearchMetadata = serpData.search_metadata
            ? { status: serpData.search_metadata.status, engine_url: serpData.search_metadata.engine_url }
            : null;
          serpApiSearchParameters = serpData.search_parameters ?? null;

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
          serpApiFirstResultKeys = serpRaw[0] ? Object.keys(serpRaw[0]) : [];
          serpApiFirstResultSample = serpRaw[0]
            ? Object.fromEntries(Object.keys(serpRaw[0]).map(k => [k, typeof serpRaw[0][k]]))
            : null;

          const serpNormalized = filterResults(serpRaw.map((item) => normalizeSerpResult(item, q)))
            .filter((r) => !isCommerceDomain(r.source));
          serpApiNormalizedCount = serpNormalized.length;
          if (serpNormalized.length > 0) {
            finalResults = serpNormalized;
            finalProvider = "baidu";
          }
        } catch (serpErr) {
          serpApiError = serpErr.message || "fetch error";
        }
      }
    }

    const response = {
      query: q,
      provider: finalProvider,
      results: finalResults.slice(0, 9).map(({ isLogo, thumbnailOriginal, ...r }) => r)
    };

    if (debug) {
      response.version = "serpapi-fallback-v3";
      response.braveRawCount = braveRaw.length;
      response.braveNormalizedCount = braveNormalized.length;
      response.braveUsefulCount = braveUseful.length;
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
      response.fallbackUsed = finalProvider === "baidu";
      response.rawTopLevelKeys = Object.keys(braveData);
      response.firstResultKeys = braveRaw[0] ? Object.keys(braveRaw[0]) : [];
      response.firstResultSample = braveRaw[0] ?? null;
    }

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
      !isPlaceholderTitle(r.title)
  );
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
  const source = safeHostname(link) || "Baidu";
  return { title, thumbnail, isLogo: false, thumbnailOriginal, link, source };
}
