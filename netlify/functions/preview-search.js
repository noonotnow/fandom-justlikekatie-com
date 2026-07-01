export async function handler(event) {
  const q = (event.queryStringParameters?.q || "").trim();
  const provider = (event.queryStringParameters?.provider || "brave").trim();

  if (!q) {
    return jsonResponse(400, {
      query: q,
      provider,
      results: [],
      error: "Missing query parameter"
    });
  }

  if (provider !== "brave") {
    return jsonResponse(400, {
      query: q,
      provider,
      results: [],
      error: "Unsupported provider (only 'brave' supported for now)"
    });
  }

  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, {
      query: q,
      provider,
      results: [],
      error: "Brave API key not configured"
    });
  }

  try {
    const braveUrl =
      "https://api.search.brave.com/res/v1/images/search" +
      `?q=${encodeURIComponent(q)}` +
      `&count=12` +
      `&safesearch=moderate`;

    const resp = await fetch(braveUrl, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey
      }
    });

    if (!resp.ok) {
      return jsonResponse(resp.status, {
        query: q,
        provider,
        results: [],
        error: `Brave API error: ${resp.statusText}`
      });
    }

    const data = await resp.json();
    const rawResults = Array.isArray(data.results) ? data.results : [];

    const normalized = rawResults
      .map((item) => normalizeBraveResult(item, q))
      .filter(
        (r) =>
          typeof r.thumbnail === "string" &&
          r.thumbnail &&
          typeof r.link === "string" &&
          r.link
      )
      .slice(0, 9);

    return jsonResponse(200, {
      query: q,
      provider: "brave",
      results: normalized
    });
  } catch (err) {
    return jsonResponse(500, {
      query: q,
      provider,
      results: [],
      error: err.message || "Unknown error"
    });
  }
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

function normalizeBraveResult(item, fallbackTitle) {
  const title =
    item.title ||
    item.caption ||
    item.alt ||
    item.page_title ||
    fallbackTitle;

  const thumbnail =
    item.thumbnail?.src ||
    item.thumbnail?.url ||
    item.thumbnail ||
    item.properties?.thumbnail_url ||
    item.properties?.url ||
    "";

  const link =
    item.url ||
    item.page_url ||
    item.source_url ||
    item.image_url ||
    "";

  const source =
    item.source ||
    item.domain ||
    item.site ||
    item.host ||
    safeHostname(link);

  return { title, thumbnail, link, source };
}
