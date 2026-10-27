import { searchOneQuery } from "../preview-search.js";
import { isIP } from "node:net";

function publicUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      && !isIP(url.hostname) && url.hostname !== "localhost" && !url.hostname.endsWith(".localhost");
  } catch { return false; }
}

export function createCdramaStillHandler(search = searchOneQuery) {
  return async function cdramaStillSearch(req) {
    if (req.method !== "GET") return Response.json({ error: "Method not allowed." }, { status: 405 });
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    if (!q || q.length > 160 || /[\r\n]/.test(q)) return Response.json({ error: "Enter a short image search." }, { status: 400 });
    try {
      const result = await search(q, { providerPolicy: "cdrama-stills", resultLimit: 12 });
      const results = (Array.isArray(result.results) ? result.results : [])
        .filter(item => publicUrl(item?.thumbnail) && publicUrl(item?.link))
        .slice(0, 12)
        .map(item => ({
          title: String(item.title ?? "").slice(0, 220),
          thumbnail: `/.netlify/functions/image-proxy?url=${encodeURIComponent(item.thumbnail)}`,
          link: item.link,
          source: String(item.source ?? new URL(item.link).hostname).slice(0, 120),
        }));
      return Response.json({ query: q, results }, { headers: { "Cache-Control": "private, max-age=120" } });
    } catch {
      return Response.json({ error: "Still search unavailable. You can upload your own image instead." }, { status: 503 });
    }
  };
}
