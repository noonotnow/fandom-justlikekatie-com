import { episodeRange } from "./cdrama-recap-search.js";

// Fixed public editorial hosts only; do not fetch arbitrary model/user URLs or
// follow redirects. Provider-discovered image URLs are still served by image-proxy.
const HOSTS = new Set(["www.tvmao.com", "m.tvmao.com", "mtmadm.tvmao.com", "tvmao.com",
  "dramakaffe.wordpress.com", "cyn-lynn.blogspot.com", "www.chinesedrama.info"]);
const decode = value => String(value).replace(/&amp;/g, "&").replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => Number(n) <= 65535 ? String.fromCharCode(Number(n)) : "");
const text = value => decode(value).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

export function scenePageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && HOSTS.has(url.hostname) && !url.username && !url.password && !url.port
      ? url.href : "";
  } catch { return ""; }
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)]
    .map(match => [match[1].toLowerCase(), decode(match[2])]));
}

export function extractScenePageImages(html, source, anchors = []) {
  const page = scenePageUrl(source.link);
  if (!page) return [];
  const title = text(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? source.title ?? "").slice(0, 220);
  const identity = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (anchors.length && !anchors.some(anchor => identity(title).includes(identity(anchor)))) return [];
  const isTvmao = new URL(page).hostname.endsWith("tvmao.com");
  // Cut recommendation/footer content; recaps' actual article images precede it.
  const body = html.split(/<(?:h[2-6]|div|section)[^>]*(?:id|class)=["'][^"']*(?:related-posts|sharedaddy|comments-area|post-footer)/i)[0];
  const article = body.match(/<article\b[\s\S]*?<\/article>/i)?.[0] ?? body;
  const candidates = [];
  for (const match of article.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const raw = attrs["data-original"] || attrs["data-src"] || attrs.src;
    if (!raw || /avatar|gravatar|logo|banner|icon|pixel|tracking|poster|advert/i.test(`${raw} ${attrs.alt ?? ""} ${attrs.class ?? ""}`)) continue;
    if ((Number(attrs.width) > 0 && Number(attrs.width) < 160)
      || (Number(attrs.height) > 0 && Number(attrs.height) < 90)) continue;
    let url;
    try { url = new URL(raw, page); } catch { continue; }
    if (url.protocol === "http:") url.protocol = "https:";
    if (url.protocol !== "https:" || url.username || url.password || url.port
      || !/\.(?:jpe?g|png|webp|gif)(?:$|\?)/i.test(url.href)) continue;
    if (isTvmao ? !/\/stillcut\//i.test(url.pathname)
      : !/blogger\.googleusercontent\.com|\.bp\.blogspot\.com|\.wordpress\.com\/wp-content\/uploads/i.test(url.href)) continue;
    const imageTitle = text(attrs.alt || title).slice(0, 220);
    candidates.push({
      title: imageTitle, thumbnail: url.href, link: page,
      source: new URL(page).hostname,
      ...episodeRange(`${imageTitle} ${title}`),
    });
    if (candidates.length >= 8) break;
  }
  return [...new Map(candidates.map(item => [item.thumbnail, item])).values()];
}

async function readPageHtml(url, signal, fetchImpl) {
  const response = await fetchImpl(url, {
    redirect: "error", signal,
    headers: { Accept: "text/html", "User-Agent": "CDramaMemeForge/1.0 (public episode-still discovery)" },
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("Episode page unavailable");
  if (Number(response.headers.get("content-length")) > 800000) throw new Error("Episode page too large");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 800000) throw new Error("Episode page too large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readScenePageImages(source, { signal, fetchImpl = fetch, anchors = [], episode } = {}) {
  let url = scenePageUrl(source.link);
  if (!url) return [];
  const budget = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(6000)]);
  let html = await readPageHtml(url, budget, fetchImpl);
  // Search engines often return an index or a nearby episode. Follow exactly
  // one real navigation link for the researched episode, never synthesize slugs.
  if (new URL(url).hostname.endsWith("tvmao.com") && Number.isInteger(episode)) {
    for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const attrs = attributes(match[1]);
      const label = text(match[2]);
      if (![String(episode), `第${episode}集`].includes(label)) continue;
      let target;
      try { target = new URL(attrs.href, url); } catch { continue; }
      if (!scenePageUrl(target.href) || target.hostname !== new URL(url).hostname
        || !target.pathname.includes("/episode/") || target.href === url) continue;
      html = await readPageHtml(target.href, budget, fetchImpl);
      url = target.href;
      break;
    }
  }
  return extractScenePageImages(html, { ...source, link: url }, anchors);
}
