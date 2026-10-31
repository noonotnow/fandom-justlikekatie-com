import { searchOneQuery } from "../preview-search.js";
import { isIP } from "node:net";
import { discoverRecaps } from "./cdrama-recap-search.js";
import { discoverScene } from "./cdrama-scene-search.js";
import { discoverSimilarStills, publicSimilarityUrl } from "./cdrama-similar-stills.js";

function publicUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      && !isIP(url.hostname) && url.hostname !== "localhost" && !url.hostname.endsWith(".localhost");
  } catch { return false; }
}

export function createCdramaStillHandler(search = searchOneQuery, recapOptions = {}, sceneOptions = {}, similar = discoverSimilarStills) {
  return async function cdramaStillSearch(req) {
    if (req.method !== "GET") return Response.json({ error: "Method not allowed." }, { status: 405 });
    const params = new URL(req.url).searchParams;
    const mode = params.get("mode") ?? "stills";
    if (mode === "similar") {
      const image = publicSimilarityUrl(params.get("image"));
      const headers = { "Cache-Control": "private, no-store" };
      if (!image) return Response.json({ error: "Choose a public search-result still first. Device images are not uploaded." }, { status: 400, headers });
      try {
        const result = await similar(image, { signal: req.signal });
        return Response.json({
          results: result.results.map(item => ({
            ...item,
            thumbnail: `/.netlify/functions/image-proxy?url=${encodeURIComponent(item.thumbnail)}`,
            evidence: "unverified",
          })),
          warning: result.warning,
        }, { headers });
      } catch {
        return Response.json({
          error: "Visual similarity search is unavailable. Your current meme is unchanged; try again or use keyword search.",
        }, { status: 503, headers });
      }
    }
    const q = params.get("q")?.trim() ?? "";
    if (!q || q.length > (mode === "scenes" ? 500 : 160) || /[\r\n]/.test(q)) return Response.json({ error: "Enter a short scene description or image search." }, { status: 400 });
    const dramaTitle = params.get("dramaTitle")?.trim() ?? "";
    if (!["stills", "recaps", "scenes"].includes(mode) || dramaTitle.length > 120 || /[\r\n]/.test(dramaTitle))
      return Response.json({ error: "Choose a search mode and a short drama title." }, { status: 400 });
    try {
      const result = mode === "scenes"
        ? await discoverScene({ query: q, dramaTitle, searchImages: search,
          signal: AbortSignal.any([req.signal, AbortSignal.timeout(45000)]), ...sceneOptions })
        : mode === "recaps"
        ? await discoverRecaps({ query: q, dramaTitle, searchImages: search, ...recapOptions })
        : await search(q, { providerPolicy: "cdrama-stills", resultLimit: 12 });
      const results = (Array.isArray(result.results) ? result.results : [])
        .filter(item => publicUrl(item?.thumbnail) && publicUrl(item?.link))
        .slice(0, 12)
        .map(item => ({
          title: String(item.title ?? "").slice(0, 220),
          thumbnail: `/.netlify/functions/image-proxy?url=${encodeURIComponent(item.thumbnail)}`,
          link: item.link,
          source: String(item.source ?? new URL(item.link).hostname).slice(0, 120),
          evidence: "unverified",
          ...(mode === "scenes" ? { match: item.match, searchQuery: item.searchQuery,
            subtitleStatus: "unchecked" } : {}),
          ...(Number.isInteger(item.episodeStart) ? { episodeStart: item.episodeStart, episodeEnd: item.episodeEnd } : {}),
        }));
      return Response.json({
        query: q, results,
        ...(mode !== "stills" ? {
          research: result.research.filter(item => publicUrl(item.link)),
          queries: result.queries, warning: result.warning,
        } : {}),
        ...(mode === "scenes" ? { clues: result.clues } : {}),
      }, { headers: { "Cache-Control": mode === "scenes" ? "private, no-store" : "private, max-age=120" } });
    } catch {
      return Response.json({ error: "Still search unavailable. You can upload your own image instead." }, { status: 503 });
    }
  };
}
