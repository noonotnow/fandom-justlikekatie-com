// Hostnames known to always return brand/news logos instead of content thumbnails.
// Do NOT block entire domains that can also have valid actor/drama content.
const LOGO_DOMAINS = new Set([
  "sina.com",
  "sina.com.cn",
  "sinaimg.cn",
  "163.com",
  "126.com"
]);

// Patterns in thumbnail URLs that indicate a logo/favicon/brand placeholder.
const LOGO_URL_PATTERNS = [
  "/logo",
  "logo.",
  "favicon",
  "static/baike",
  "baike.png",
  "share-logo",
  "og-image",
  "social-media-share"
];

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

  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { query: q, provider, results: [], error: "Brave API key not configured" });
  }

  try {
    const braveUrl =
      "https://api.search.brave.com/res/v1/web/search" +
      `?q=${encodeURIComponent(q)}` +
      `&count=30` +
      `&safesearch=moderate`;

    const resp = await fetch(braveUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey
      }
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      return jsonResponse(resp.status, {
        query: q,
        provider,
        results: [],
        error: `Brave API error: ${resp.statusText}`,
        details: errorText.substring(0, 200)
      });
    }

    const data = await resp.json();

    // Support both Brave Image Search (data.results) and Web Search (data.web.results)
    const rawResults =
      Array.isArray(data.results) ? data.results :
      Array.isArray(data.web?.results) ? data.web.results :
      [];

    const normalized = rawResults
      .map((item) => normalizeWebResult(item, q))
      .filter(
        (r) =>
          typeof r.thumbnail === "string" &&
          r.thumbnail &&
          typeof r.link === "string" &&
          r.link &&
          !r.isLogo &&
          !isLogoDomain(r.source) &&
          !isLogoUrl(r.thumbnail)
      )
      .slice(0, 9);

    const response = {
      query: q,
      provider: "brave",
      results: normalized.map(({ isLogo, ...r }) => r)
    };

    if (debug) {
      response.rawTopLevelKeys = Object.keys(data);
      response.rawCount = rawResults.length;
      response.normalizedCount = normalized.length;
      response.firstResultKeys = rawResults[0] ? Object.keys(rawResults[0]) : [];
      response.firstResultSample = rawResults[0] ?? null;
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

function isLogoDomain(source) {
  if (!source) return false;
  return [...LOGO_DOMAINS].some((d) => source === d || source.endsWith("." + d));
}

function isLogoUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return LOGO_URL_PATTERNS.some((p) => lower.includes(p));
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

  const link = item.url || "";
  const source = safeHostname(link) || "Web result";

  return { title, thumbnail, isLogo, link, source };
}