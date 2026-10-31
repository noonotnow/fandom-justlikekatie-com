import { isIP } from "node:net";

// This feature accepts existing public stills only, never uploads or proxy URLs.
// The server sends the URL to the provider; it does not fetch arbitrary images.
export function publicSimilarityUrl(value) {
  if (typeof value !== "string" || value.length > 4096) return "";
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.port
      || isIP(host) || !host.includes(".")
      || /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/.test(host)) return "";
    url.hash = "";
    return url.href;
  } catch { return ""; }
}

export async function discoverSimilarStills(image, {
  fetchImpl = fetch, apiKey = process.env.SERPAPI_KEY, signal,
} = {}) {
  const seed = publicSimilarityUrl(image);
  if (!seed) throw new Error("Choose a public search-result still first.");
  if (!apiKey) throw new Error("Visual similarity search is not configured.");
  const url = new URL("https://serpapi.com/search.json");
  url.search = new URLSearchParams({ engine: "google_lens", url: seed, api_key: apiKey });
  const response = await fetchImpl(url, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
    redirect: "error",
  });
  // Never return provider errors or request URLs: they can contain credentials.
  if (!response.ok) throw new Error("Visual similarity provider unavailable.");
  const data = await response.json();
  if (data.error) throw new Error("Visual similarity provider unavailable.");
  const seen = new Set([seed]);
  const results = [];
  for (const item of Array.isArray(data.visual_matches) ? data.visual_matches : []) {
    if (!item || typeof item !== "object") continue;
    const link = publicSimilarityUrl(item.link);
    const thumbnail = publicSimilarityUrl(item.image) || publicSimilarityUrl(item.thumbnail);
    if (!link || !thumbnail || seen.has(thumbnail)) continue;
    seen.add(thumbnail);
    results.push({
      title: typeof item.title === "string" ? item.title.slice(0, 220) : "Related still",
      thumbnail, link,
      source: typeof item.source === "string" ? item.source.slice(0, 120) : new URL(link).hostname,
    });
    if (results.length === 12) break;
  }
  return {
    results,
    warning: results.length
      ? "Visual matches, not verified character or scene matches. Check each source before using a still."
      : "No additional visual matches found. Your current meme is unchanged. Try another still or a keyword search.",
  };
}
