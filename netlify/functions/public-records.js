import { getBlobStore } from "./lib/blob-store.js";
import {
  PUBLIC_VIBE_ATLAS_ORIGIN,
  publicActorDirectory,
  publicActorSlug,
  publicEditionPreview,
  readPublicationManifests,
} from "./lib/publication-manifest.js";
import {
  isIndexableReleasedPack,
  releasedPackCatalog,
  publicReleasedPack,
  releasedPackActorSlug,
  RELEASED_PACK_PATH,
} from "./lib/released-pack-catalog.js";
import { ACTOR_PACKS } from "./lib/actor-packs.js";
import { ELIGIBILITY_STORE } from "./lib/actor-eligibility.js";
import {
  PUBLIC_CHINESE_LOCALE,
  PUBLIC_ROUTE_PATHS,
  localizedPublicPath,
  publicAlternatePaths,
} from "./lib/public-routes.js";
import { stripLocalePath } from "../../shared/locale.js";

const PUBLIC_CACHE = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
const RECORD_STYLES = `<style>
  @font-face {
    font-family: "Vibe Atlas CJK";
    src: url("/fonts/vibe-atlas-cjk.woff2") format("woff2");
    font-style: normal;
    font-weight: 100 900;
    font-display: swap;
  }
  * { box-sizing: border-box; }
  body { margin: 0; color: #24232a; background: #fffdf9; font-family: system-ui, sans-serif; line-height: 1.65; }
  html:lang(zh-CN) body { font-family: "Vibe Atlas CJK", system-ui, sans-serif; }
  main { width: min(100% - 2rem, 68rem); margin: 0 auto; padding: 1rem 0 3rem; }
  h1 { line-height: 1.25; overflow-wrap: anywhere; }
  a { color: #7b2840; }
  a:focus-visible { outline: 3px solid #276a78; outline-offset: 3px; }
  .language-nav { display: flex; justify-content: flex-end; gap: .5rem; width: min(100% - 2rem, 68rem); margin: 0 auto; padding: .75rem 0 0; }
  .language-nav a { display: inline-block; min-height: 2.5rem; padding: .4rem .75rem; border: 1px solid #d6c9bd; border-radius: 999px; text-decoration: none; }
  .language-nav a[aria-current="page"] { color: #fff; background: #7b2840; border-color: #7b2840; }
  .record-preview-grid, .released-pack-teaser { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; max-width: 60rem; }
  .record-preview-grid figure, .released-pack-teaser figure { min-width: 0; margin: 0; }
  .record-preview-grid img, .released-pack-teaser img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: .5rem; }
  .record-preview-grid figcaption, .released-pack-teaser figcaption { overflow-wrap: anywhere; font-size: .9rem; }
  @media (max-width: 600px) {
    main { width: min(100% - 1.25rem, 68rem); padding-top: .75rem; }
    .language-nav { width: min(100% - 1.25rem, 68rem); }
    .record-preview-grid, .released-pack-teaser { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; }
    h1 { font-size: clamp(1.5rem, 7vw, 2.25rem); }
  }
</style>`;

function cleanPublicPath(path) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return null;
  try {
    const url = new URL(path, `${PUBLIC_VIBE_ATLAS_ORIGIN}/`);
    if (url.origin !== PUBLIC_VIBE_ATLAS_ORIGIN) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

function languageNavigation(englishPath, lang) {
  if (!englishPath) return "";
  const alternateLinks = publicAlternatePaths(englishPath)
    .filter(({ hreflang }) => hreflang === "en" || hreflang === "zh-CN")
    .map(({ hreflang, path }) => {
      const href = cleanPublicPath(path);
      if (!href) return "";
      const current = (lang === PUBLIC_CHINESE_LOCALE) === (hreflang === "zh-CN");
      const label = hreflang === "zh-CN" ? "简体中文" : "English";
      return `<a href="${escapeHtml(href)}" hreflang="${escapeHtml(hreflang)}" lang="${escapeHtml(hreflang)}"${current ? ' aria-current="page"' : ""}>${label}</a>`;
    })
    .filter(Boolean);
  return alternateLinks.length === 2
    ? `<nav class="language-nav" aria-label="${lang === PUBLIC_CHINESE_LOCALE ? "语言" : "Language"}">${alternateLinks.join("")}</nav>`
    : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function response(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": statusCode === 200 ? PUBLIC_CACHE : "no-store",
      ...headers,
    },
    body,
  };
}

function page({ title, description, canonical, englishPath, image, robots, body, lang = "en" }) {
  const alternates = englishPath
    ? publicAlternatePaths(englishPath)
      .map(({ hreflang, path }) => {
        const cleanPath = cleanPublicPath(path);
        return cleanPath
          ? `<link rel="alternate" hreflang="${escapeHtml(hreflang)}" href="${escapeHtml(`${PUBLIC_VIBE_ATLAS_ORIGIN}${cleanPath}`)}">`
          : "";
      })
      .filter(Boolean)
      .join("")
    : "";
  const jsonLd = JSON.stringify({ "@context": "https://schema.org", "@type": "Article", name: title, description, url: canonical, inLanguage: lang, ...(image ? { image } : {}) })
    .replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="${escapeHtml(robots)}"><link rel="canonical" href="${escapeHtml(canonical)}">${alternates}${RECORD_STYLES}<meta property="og:type" content="article"><meta property="og:site_name" content="Fandom Vibes"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}">${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ""}<script type="application/ld+json">${jsonLd}</script></head><body>${languageNavigation(englishPath, lang)}<main>${body}</main></body></html>`;
}

function routeUrl(path, isChinese) {
  const englishPath = stripLocalePath(path);
  const route = isChinese
    ? localizedPublicPath(englishPath, PUBLIC_CHINESE_LOCALE)
    : englishPath;
  return `${PUBLIC_VIBE_ATLAS_ORIGIN}${route}`;
}

function routePath(path, isChinese) {
  const englishPath = stripLocalePath(path);
  return isChinese
    ? localizedPublicPath(englishPath, PUBLIC_CHINESE_LOCALE)
    : englishPath;
}

function isChineseRoute(path) {
  return routePath(path, true) === path;
}

function hasChineseLocalePrefix(path) {
  return /^\/zh-cn(?:\/|$)/i.test(path);
}

function localizedErrorPage({ statusCode, title, description, body, isChinese, headers = {} }) {
  return response(statusCode, page({
    title,
    description,
    canonical: routeUrl(PUBLIC_ROUTE_PATHS.vibeAtlas, isChinese),
    robots: "noindex,follow",
    body,
    lang: isChinese ? PUBLIC_CHINESE_LOCALE : "en",
  }), headers);
}

function notFound(isChinese = false) {
  if (isChinese) {
    return localizedErrorPage({
      statusCode: 404,
      title: "未找到公开记录 | Fandom Vibes",
      description: "此精选公开记录当前不可用。",
      body: "<h1>未找到公开记录</h1><p>此精选记录当前不可用。</p>",
      isChinese,
    });
  }
  return response(404, page({
    title: "Public record not found | Fandom Vibes",
    description: "This curated public record is not available.",
    canonical: `${PUBLIC_VIBE_ATLAS_ORIGIN}/vibe-atlas/`,
    robots: "noindex,follow",
    body: "<h1>Public record not found</h1><p>This curated record is not available.</p>",
  }));
}

function methodNotAllowed(isChinese) {
  const result = localizedErrorPage({
    statusCode: 405,
    title: isChinese ? "不支持此请求方式 | Fandom Vibes" : "Method not allowed | Fandom Vibes",
    description: isChinese ? "此公开记录仅支持 GET 请求。" : "Public record pages only support GET requests.",
    body: isChinese
      ? "<h1>不支持此请求方式</h1><p>此公开记录仅支持 GET 请求。</p>"
      : "<h1>Method not allowed</h1><p>Public record pages only support GET requests.</p>",
    isChinese,
    headers: { Allow: "GET" },
  });
  return result;
}

function inventoryUnavailable(isChinese, releasedPack = false) {
  const chineseTitle = releasedPack ? "已发布卡包暂不可用 | Fandom Vibes" : "公开记录暂不可用 | Fandom Vibes";
  const chineseMessage = releasedPack
    ? "已发布卡包清单尚未准备就绪，请稍后再试。"
    : "经审核的公开记录清单尚未准备就绪，请稍后再试。";
  const englishTitle = releasedPack ? "Released pack inventory unavailable | Fandom Vibes" : "Public record inventory unavailable | Fandom Vibes";
  const englishMessage = releasedPack
    ? "The released pack inventory is not ready. Please try again later."
    : "The approved public record inventory is not ready. Please try again later.";
  const title = isChinese ? chineseTitle : englishTitle;
  const message = isChinese ? chineseMessage : englishMessage;
  return localizedErrorPage({
    statusCode: 503,
    title,
    description: message,
    body: `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`,
    isChinese,
  });
}

function chineseSubtitleMarkup(vibe) {
  const subtitle = String(vibe?.subtitle || "").trim();
  const subtitleEn = String(vibe?.subtitleEn || "").trim();
  const chineseSubtitle = subtitle && subtitle !== subtitleEn ? subtitle : "";
  return [
    chineseSubtitle
      ? `<p><strong>中文副标题：</strong>${escapeHtml(chineseSubtitle)}</p>`
      : "",
    subtitleEn
      ? `<p><strong>英文副标题（原文）：</strong>${escapeHtml(subtitleEn)}</p>`
      : "",
  ].join("");
}

function chineseEditorialCopyMarkup(record) {
  const copy = String(record?.copy || "").trim();
  const copyEn = String(record?.copyEn || "").trim();
  const copyZh = String(record?.copyZh || "").trim();
  if (copyZh) {
    const chinese = `<p><strong>编辑说明（中文）：</strong>${escapeHtml(copyZh)}</p>`;
    if (copyEn) {
      return `${chinese}<p><strong>经审核的英文原文：</strong>${escapeHtml(copyEn)}</p>`;
    }
    return copy && copy !== copyZh
      ? `${chinese}<p><strong>现有历史原文（暂无单独英文版本）：</strong>${escapeHtml(copy)}</p>`
      : chinese;
  }
  const historicalCopy = copyEn || copy;
  return historicalCopy
    ? `<p><strong>现有英文原文（暂无中文说明）：</strong>${escapeHtml(historicalCopy)}</p>`
    : "";
}

function renderEdition(edition, query, isChinese) {
  const noindex = query !== "";
  const title = isChinese
    ? `${edition.actor.name} · ${edition.vibe.label}｜Vibe Atlas 每日收藏卡`
    : `${edition.actor.nameEn || edition.actor.name} · ${edition.vibe.labelEn} | Vibe Atlas`;
  const description = isChinese
    ? `${edition.date} 发布的 Vibe Atlas 每日收藏卡，收录演员 ${edition.actor.name} 与「${edition.vibe.label}」主题的九张精选图片。`
    : edition.vibe.copy;
  const hero = edition.previews[edition.heroPosition]?.deliveryUrl || edition.previews[0]?.deliveryUrl;
  const cards = edition.previews.map(card => (
    `<figure><img src="${escapeHtml(card.thumbnailUrl)}" data-media-delivery-url="${escapeHtml(card.deliveryUrl)}" alt="${escapeHtml(card.title)}" loading="lazy"><figcaption>${isChinese ? `<strong>来源标题（原题）：</strong>${escapeHtml(card.title)}${card.source ? `<br><strong>来源：</strong>${escapeHtml(card.source)}` : ""}` : escapeHtml(card.title)}</figcaption></figure>`
  )).join("");
  const actorHref = routePath(edition.actor.path, isChinese);
  const publicEditionUrl = `${routePath(PUBLIC_ROUTE_PATHS.vibeAtlas, isChinese)}?date=${encodeURIComponent(edition.date)}`;
  const openEditionSection = isChinese
    ? `<section aria-label="打开完整公开卡组"><h2>浏览完整公开卡组</h2><p>每期已发布卡组均可免费浏览、拼图和导出。发布不超过三天的卡片可免费保存；更早期的单张卡片需核验收藏会员权限后保存。</p><a href="${escapeHtml(publicEditionUrl)}">打开全部图片，收藏单卡或使用本期素材创作</a></section>`
    : `<section aria-label="Open the full public edition"><h2>Browse the full public edition</h2><p>Every published edition is free to browse, build from, and export. Individual-card saves are free for editions no more than three days old; verified saves from older published editions require Collector.</p><a href="${escapeHtml(publicEditionUrl)}">Open all cards and save or build from this edition</a></section>`;
  const recordBody = isChinese
    ? `<a href="${escapeHtml(actorHref)}">查看 ${escapeHtml(edition.actor.name)} 的全部精选记录</a><h1>${escapeHtml(title)}</h1><p>主题：${escapeHtml(edition.vibe.label)}${edition.vibe.emoji ? ` ${escapeHtml(edition.vibe.emoji)}` : ""}</p>${edition.actor.nameEn ? `<p><strong>演员英文原名：</strong>${escapeHtml(edition.actor.nameEn)}</p>` : ""}${edition.vibe.labelEn ? `<p><strong>英文主题名（原文）：</strong>${escapeHtml(edition.vibe.labelEn)}</p>` : ""}${chineseSubtitleMarkup(edition.vibe)}${chineseEditorialCopyMarkup(edition.vibe)}<section class="record-preview-grid" aria-label="已发布的精选图片">${cards}</section>`
    : `<a href="${escapeHtml(actorHref)}">All ${escapeHtml(edition.actor.nameEn || edition.actor.name)} records</a><h1>${escapeHtml(title)}</h1><p>${escapeHtml(edition.vibe.subtitleEn)}</p><p>${escapeHtml(description)}</p><section class="record-preview-grid" aria-label="Approved preview grid">${cards}</section>`;
  const body = recordBody + openEditionSection;
  return response(200, page({
    title, description,
    canonical: routeUrl(edition.path, isChinese),
    englishPath: edition.path,
    image: hero,
    robots: noindex ? "noindex,follow" : "index,follow,max-image-preview:large",
    body,
    lang: isChinese ? PUBLIC_CHINESE_LOCALE : "en",
  }), noindex ? { "Cache-Control": "no-store" } : {});
}

function renderActor(actor, query, isChinese) {
  const noindex = query !== "";
  const actorName = isChinese ? actor.name : actor.nameEn || actor.name;
  const title = isChinese
    ? `${actorName}｜Vibe Atlas 精选记录 | Fandom Vibes`
    : `${actorName} · Curated Vibe Atlas records | Fandom Vibes`;
  const description = isChinese
    ? `浏览 ${actorName} 的 ${actor.editionCount} 期已审核 Vibe Atlas 公开记录，查看原始精选图片与编辑说明。`
    : `Explore ${actor.editionCount} approved Vibe Atlas records for ${actorName}, with original editorial context and materialized previews.`;
  const links = actor.editions.map(edition => (
    `<li><a href="${escapeHtml(routePath(edition.path, isChinese))}">${escapeHtml(isChinese ? `${edition.date} 期` : `${edition.date} edition`)}</a></li>`
  )).join("");
  const context = actor.relatedContext.map(item => escapeHtml(isChinese ? item.label || item.labelEn : item.labelEn || item.label)).join("、");
  const body = isChinese
    ? `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p>${actor.nameEn ? `<p><strong>演员英文原名：</strong>${escapeHtml(actor.nameEn)}</p>` : ""}<p>相关主题：${context}。</p><ul>${links}</ul>`
    : `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><p>Related curated context: ${context}.</p><ul>${links}</ul>`;
  return response(200, page({
    title, description,
    canonical: routeUrl(actor.path, isChinese),
    englishPath: actor.path,
    robots: noindex ? "noindex,follow" : "index,follow,max-image-preview:large",
    body,
    lang: isChinese ? PUBLIC_CHINESE_LOCALE : "en",
  }), noindex ? { "Cache-Control": "no-store" } : {});
}

function renderReleasedPack(pack, query, isChinese) {
  const noindex = query !== "";
  const actorName = isChinese ? pack.actor.name : pack.actor.nameEn;
  const vibeLabel = isChinese ? pack.vibe.label : pack.vibe.labelEn;
  const title = isChinese
    ? `${actorName} · ${vibeLabel}｜Vibe Atlas 已发布卡包`
    : `${actorName} · ${vibeLabel} | Released Vibe Pack`;
  const description = isChinese
    ? `浏览 ${actorName} 的「${vibeLabel}」Vibe Atlas 已发布卡包，包含九张精选图片与经审核的公开预览。`
    : pack.preview.copy;
  const collectorLibrary = `${isChinese ? routePath(PUBLIC_ROUTE_PATHS.vibeAtlas, true) : PUBLIC_ROUTE_PATHS.vibeAtlas}/?view=released&source=public_record&actorId=${encodeURIComponent(pack.actor.id)}&vibeIdx=${encodeURIComponent(pack.vibeIdx)}`;
  const cards = pack.preview.cards.slice(0, 6).map(card =>
    `<figure><img src="${escapeHtml(card.thumbnailUrl)}" alt="${escapeHtml(card.title)}" loading="lazy"><figcaption>${isChinese ? `<strong>来源标题（原题）：</strong>${escapeHtml(card.title)}${card.source ? `<br><strong>来源：</strong>${escapeHtml(card.source)}` : ""}` : escapeHtml(card.title)}</figcaption></figure>`).join("");
  const teaserStyle = `<style>
    .released-pack-teaser{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem;max-width:960px}
    .released-pack-teaser figure{min-width:0;margin:0}
    .released-pack-teaser img{display:block;width:100%;aspect-ratio:1;object-fit:cover}
    @media(max-width:600px){.released-pack-teaser{grid-template-columns:repeat(2,minmax(0,1fr))}.released-pack-teaser figure:nth-child(n+5){display:none}}
  </style>`;
  const actorPackPath = `${RELEASED_PACK_PATH}/${releasedPackActorSlug(pack.actor)}/`;
  const actorPackHref = routePath(actorPackPath, isChinese);
  const body = isChinese
    ? `${teaserStyle}<a href="${escapeHtml(actorPackHref)}">查看 ${escapeHtml(actorName)} 的全部卡包</a><h1>${escapeHtml(title)}</h1><p>主题：${escapeHtml(vibeLabel)}${pack.vibe.emoji ? ` ${escapeHtml(pack.vibe.emoji)}` : ""}</p>${pack.actor.nameEn ? `<p><strong>演员英文原名：</strong>${escapeHtml(pack.actor.nameEn)}</p>` : ""}${pack.vibe.labelEn ? `<p><strong>英文主题名（原文）：</strong>${escapeHtml(pack.vibe.labelEn)}</p>` : ""}${chineseSubtitleMarkup(pack.vibe)}${chineseEditorialCopyMarkup(pack.preview)}<section class="released-pack-teaser" aria-label="已发布卡包预览">${cards}</section><p>Fandom Collector 可查看完整来源资料。<a href="${escapeHtml(collectorLibrary)}">在 Collector 收藏库中打开此卡包</a>。</p>`
    : `${teaserStyle}<a href="${escapeHtml(actorPackHref)}">All ${escapeHtml(pack.actor.nameEn)} packs</a><h1>${escapeHtml(title)}</h1><p>${escapeHtml(pack.vibe.subtitleEn)}</p><p>${escapeHtml(description)}</p><section class="released-pack-teaser" aria-label="Released pack preview">${cards}</section><p>Full source depth is available to Fandom Collectors. <a href="${escapeHtml(collectorLibrary)}">Open this pack in the Collector library</a>.</p>`;
  return response(200, page({
    title, description,
    canonical: routeUrl(new URL(pack.canonical).pathname, isChinese),
    englishPath: new URL(pack.canonical).pathname,
    image: pack.preview.cards[0]?.deliveryUrl,
    robots: noindex ? "noindex,follow" : "index,follow,max-image-preview:large",
    body,
    lang: isChinese ? PUBLIC_CHINESE_LOCALE : "en",
  }), { "Cache-Control": "no-store" });
}

function renderReleasedActor(actor, query, isChinese) {
  const noindex = query !== "";
  const actorName = isChinese ? actor.name : actor.nameEn;
  const title = isChinese
    ? `${actorName}｜Vibe Atlas 已发布卡包`
    : `${actorName} · Released Vibe Packs | Vibe Atlas`;
  const description = isChinese
    ? `浏览 ${actorName} 已审核并发布的 Vibe Atlas 卡包。`
    : `Explore approved released Vibe Atlas packs for ${actorName}.`;
  const links = actor.packs.map(pack => {
    const subtitle = isChinese
      ? `${pack.vibe.subtitle && pack.vibe.subtitle !== pack.vibe.subtitleEn ? `<span><strong>中文副标题：</strong>${escapeHtml(pack.vibe.subtitle)}</span>` : ""}${pack.vibe.subtitleEn ? `<span><strong>英文副标题（原文）：</strong>${escapeHtml(pack.vibe.subtitleEn)}</span>` : ""}`
      : escapeHtml(pack.vibe.subtitleEn);
    return `<li><a href="${escapeHtml(routePath(new URL(pack.canonical).pathname, isChinese))}">${escapeHtml(isChinese ? pack.vibe.label : pack.vibe.labelEn)}</a> — ${subtitle}</li>`;
  }).join("");
  const canonicalPath = new URL(actor.canonical).pathname;
  return response(200, page({
    title, description,
    canonical: routeUrl(canonicalPath, isChinese),
    englishPath: canonicalPath,
    robots: noindex ? "noindex,follow" : "index,follow",
    body: isChinese
      ? `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p>${actor.nameEn ? `<p><strong>演员英文原名：</strong>${escapeHtml(actor.nameEn)}</p>` : ""}<ul>${links}</ul>`
      : `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><ul>${links}</ul>`,
    lang: isChinese ? PUBLIC_CHINESE_LOCALE : "en",
  }), { "Cache-Control": "no-store" });
}

export function createPublicRecordsHandler({
  getStore = getBlobStore,
  actorPacks = ACTOR_PACKS,
  eligibilityStoreName = ELIGIBILITY_STORE,
  buildReleaseCatalog = releasedPackCatalog,
} = {}) {
  return async (request, context) => {
    const url = new URL(request.url || PUBLIC_VIBE_ATLAS_ORIGIN);
    const englishPath = stripLocalePath(url.pathname);
    const chineseRequest = hasChineseLocalePrefix(url.pathname);
    if (request.method && request.method !== "GET") return methodNotAllowed(chineseRequest);
    const isChinese = isChineseRoute(url.pathname);
    if (chineseRequest && !isChinese) return notFound(true);
    const parts = englishPath.split("/").filter(Boolean);
    const publicationStore = getStore("star-of-day", context);
    const { manifests, inventory } = await readPublicationManifests(publicationStore);
    if (!inventory.complete) return inventoryUnavailable(isChinese);
    const directory = publicActorDirectory(manifests);

    if (parts[1] === "packs") {
      const releaseCatalog = await buildReleaseCatalog(
        getStore(eligibilityStoreName, context),
        { publicationStore, actorPacks },
      );
      if (!releaseCatalog.complete || releaseCatalog.indexingComplete === false) {
        return inventoryUnavailable(isChinese, true);
      }
      const packs = releaseCatalog.packs.filter(isIndexableReleasedPack);
      if (parts.length === 4) {
        const pack = packs.find(item =>
          item.canonical.endsWith(`/${parts[2]}/${parts[3]}/`));
          return pack ? renderReleasedPack(publicReleasedPack(pack), url.search, isChinese) : notFound(isChinese);
      }
      if (parts.length === 3) {
        const actorPacksForRoute = packs.filter(item =>
          releasedPackActorSlug(item.actor) === parts[2]);
        if (!actorPacksForRoute.length) return notFound(isChinese);
        const actor = actorPacksForRoute[0].actor;
        return renderReleasedActor({
          ...actor,
          canonical: `${new URL(actorPacksForRoute[0].canonical).origin}${RELEASED_PACK_PATH}/${parts[2]}/`,
          packs: actorPacksForRoute.map(publicReleasedPack),
        }, url.search, isChinese);
      }
      return notFound(isChinese);
    }

    if (parts[1] === "actors" && parts.length === 3) {
      const actor = directory.find(item => publicActorSlug(item) === parts[2]);
      return actor ? renderActor(actor, url.search, isChinese) : notFound(isChinese);
    }
    if (parts[1] === "editions" && parts.length === 4) {
      const edition = manifests
        .filter(item => item.publicationDate === parts[2] && publicActorSlug(item.actor) === parts[3])
        .map(publicEditionPreview)
        .find(Boolean);
      return edition ? renderEdition(edition, url.search, isChinese) : notFound(isChinese);
    }
    return notFound(isChinese);
  };
}

// Netlify only injects context.blobs for the V2 entrypoint. A named `handler`
// switches this function to the classic runtime without Blobs credentials.
export default async function publicRecords(request, context) {
  const result = await createPublicRecordsHandler()(request, context);
  return new Response(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}
