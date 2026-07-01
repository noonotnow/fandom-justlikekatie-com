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
      "https://api.search.brave.com/res/v1/web/search" +
      `?q=${encodeURIComponent(q)}` +
      `&count=20` +
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
    const webResults = Array.isArray(data.web) ? data.web : [];

    const normalized = webResults
      .map((item) => normalizeWebResult(item, q))
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

function normalizeWebResult(item, fallbackTitle) {
  const title = item.title || item.description || fallbackTitle;

  let thumbnail =
    item.thumbnail?.src ||
    item.thumbnail?.url ||
    item.thumbnail ||
    "";

  const link = item.url || "";

  const source = safeHostname(link) || "Web result";

  return { title, thumbnail, link, source };
}
