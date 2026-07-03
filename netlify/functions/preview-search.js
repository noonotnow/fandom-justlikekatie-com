// Only reject thumbnails that are definitively placeholder assets.
// Do NOT block source domains — sina.com, 163.com, sohu.com etc. all
// serve real actor/drama images. Block bad thumbnails, not bad websites.
const PLACEHOLDER_THUMBNAIL_PATTERNS = [
  "favicon",
  "static/baike",
  "baike.png",
  "x320.png",   // Sina brand logo assets: 320X320.png, 20X320.png (case-insensitive match below)
  "/logo.",     // Generic logo image files in URL paths (e.g. /logo.png, /logo.svg)
  "_logo.",     // Underscore-delimited logo filenames (e.g. sina_logo.png)
  "-logo.",     // Dash-delimited logo filenames (e.g. sina-logo.png)
  "/logos/"     // Logo asset directories
];

const PLACEHOLDER_TITLE_PATTERNS = [
  "sina logo",
  "site logo",
  "favicon"
];

// Minimum Brave results before falling back to Baidu via SerpAPI
const BRAVE_FALLBACK_THRESHOLD = 3;

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
    // --- Brave primary ---
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
    let braveRaw = [];
    let braveData = {};

    if (braveResp.ok) {
      braveData = await braveResp.json();
      braveRaw =
        Array.isArray(braveData.results) ? braveData.results :
        Array.isArray(braveData.web?.results) ? braveData.web.results :
        [];
      braveNormalized = filterResults(braveRaw.map((item) => normalizeWebResult(item, q)));
    }

    // --- Baidu fallback via SerpAPI ---
    let finalResults = braveNormalized;
    let finalProvider = "brave";

    if (braveNormalized.length < BRAVE_FALLBACK_THRESHOLD) {
      const serpKey = process.env.SERPAPI_KEY;
      if (serpKey) {
        try {
          const serpUrl =
            "https://serpapi.com/search.json" +
            `?engine=baidu_images` +
            `&q=${encodeURIComponent(q)}` +
            `&api_key=${serpKey}`;

          const serpResp = await fetch(serpUrl);
          if (serpResp.ok) {
            const serpData = await serpResp.json();
            const serpRaw = Array.isArray(serpData.images_results) ? serpData.images_results : [];
            const serpNormalized = filterResults(serpRaw.map((item) => normalizeSerpResult(item, q)));
            if (serpNormalized.length > 0) {
              finalResults = serpNormalized;
              finalProvider = "baidu";
            }
          }
        } catch (_) {
          // SerpAPI failure is non-fatal — stick with whatever Brave returned
        }
      }
    }

    const response = {
      query: q,
      provider: finalProvider,
      results: finalResults.slice(0, 9).map(({ isLogo, thumbnailOriginal, ...r }) => r)
    };

    if (debug) {
      response.braveRawCount = braveRaw.length;
      response.braveNormalizedCount = braveNormalized.length;
      response.fallbackUsed = finalProvider === "baidu";
      if (braveData) {
        response.rawTopLevelKeys = Object.keys(braveData);
        response.firstResultKeys = braveRaw[0] ? Object.keys(braveRaw[0]) : [];
        response.firstResultSample = braveRaw[0] ?? null;
      }
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
  // SerpAPI baidu_images shape: { title, original, thumbnail, source, link }
  const title = item.title || fallbackTitle;
  const thumbnail = item.thumbnail || "";
  const thumbnailOriginal = item.original || "";
  const link = item.link || item.original || "";
  const source = safeHostname(link) || "Baidu";
  return { title, thumbnail, isLogo: false, thumbnailOriginal, link, source };
}
