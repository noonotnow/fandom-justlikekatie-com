import { readFileSync } from "node:fs";

export const WATCH_ROUTE = "/c-drama-fandom/where-to-watch/against-the-current/";
export const WATCH_PAGE = `public${WATCH_ROUTE}index.html`;
export const WATCH_RECORD = new URL("../docs/against-the-current-availability.json", import.meta.url);
const MAX_AGE_DAYS = 7;

export function loadWatchRecord() {
  return JSON.parse(readFileSync(WATCH_RECORD, "utf8"));
}

function validDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["www.viki.com", "wetv.vip", "v.qq.com"].includes(url.hostname)
      && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function evaluateWatchRecord(record, now = new Date()) {
  const issues = [];
  if (record?.slug !== "against-the-current" || !record?.title || !record?.originalTitle) issues.push("series identity");
  if (!record?.reviewer || !record?.rightsReviewed || !record?.spoilerReviewed) issues.push("reviewer and rights/spoiler signoff");
  if (!validDate(record?.checkedAt) || Date.parse(record.checkedAt) > now.getTime()
    || now.getTime() - Date.parse(record.checkedAt) > MAX_AGE_DAYS * 86400000) issues.push("fresh dated review");
  if (!Array.isArray(record?.platforms) || !record.platforms.length) issues.push("official platform evidence");
  const expectedRegions = ["United States", "United Kingdom", "Australia", "Europe (country by country)", "Mainland China"];
  if (!Array.isArray(record?.regionGuidance)
    || record.regionGuidance.length !== expectedRegions.length
    || expectedRegions.some((name) => record.regionGuidance.filter((region) => region.name === name).length !== 1)) {
    issues.push("requested reader regions");
  }
  for (const [index, region] of (record?.regionGuidance || []).entries()) {
    const label = `region ${index + 1}`;
    if (!["verified", "unverified"].includes(region.status) || !region.note
      || !safeUrl(region.sourceUrl) || !validDate(region.checkedAt)
      || Date.parse(region.checkedAt) > now.getTime()
      || now.getTime() - Date.parse(region.checkedAt) > MAX_AGE_DAYS * 86400000) {
      issues.push(`${label}: dated official source and qualified status`);
    }
    if (region.status === "verified" && region.name !== "United States") issues.push(`${label}: unsupported regional verification`);
  }
  for (const [index, item] of (record?.platforms || []).entries()) {
    const label = `platform ${index + 1}`;
    if (!item.name || !safeUrl(item.url) || !safeUrl(item.sourceUrl) || !validDate(item.checkedAt)) issues.push(`${label}: official link/source/check`);
    if (!["verified", "unknown"].includes(item.state)) issues.push(`${label}: unresolved conflict`);
    if (item.state === "verified") {
      if (!Array.isArray(item.territories) || !item.territories.length || item.territories.some((t) => !t || t === "unknown")) issues.push(`${label}: verified territories`);
      if (!item.accessTier || item.accessTier === "unknown" || !Number.isInteger(item.episodes?.from)
        || !Number.isInteger(item.episodes?.through) || item.episodes.from < 1
        || item.episodes.through < item.episodes.from) issues.push(`${label}: access and episode range`);
      if (item.subtitles?.language !== "English" || item.subtitles?.status !== "verified") issues.push(`${label}: verified English subtitles`);
      if (item.conflict) issues.push(`${label}: conflicting evidence`);
    } else if (item.territories?.some((t) => t !== "unknown") || item.accessTier !== "unknown"
      || item.episodes !== null || item.subtitles?.status !== "unknown")
      issues.push(`${label}: unverified claims must remain unknown`);
    if (!validDate(item.checkedAt) || Date.parse(item.checkedAt) > now.getTime()
      || now.getTime() - Date.parse(item.checkedAt) > MAX_AGE_DAYS * 86400000) issues.push(`${label}: stale evidence`);
    if (safeUrl(item.url) && safeUrl(item.sourceUrl) && new URL(item.url).hostname !== new URL(item.sourceUrl).hostname) issues.push(`${label}: source is not provider-owned`);
  }
  if (!record?.platforms?.some((item) => item.state === "verified" && item.territories?.includes("US"))) issues.push("verified US option");
  if (!record?.schedule || !["verified", "unknown", "conflict"].includes(record.schedule.state)) issues.push("schedule state");
  if (record?.schedule?.state === "verified") {
    if (!record.schedule.timeZone || !validDate(record.schedule.checkedAt)
      || Date.parse(record.schedule.checkedAt) > now.getTime()
      || now.getTime() - Date.parse(record.schedule.checkedAt) > MAX_AGE_DAYS * 86400000
      || !safeUrl(record.schedule.sourceUrl) || !validDate(record.schedule.standardFinaleAt)) issues.push("verified finale schedule");
    if (!Array.isArray(record.schedule.windows) || !record.schedule.windows.length
      || record.schedule.windows.some((window) => !window.audience || !validDate(window.finaleAt)))
      issues.push("complete regional finale windows");
  }
  return { publishable: issues.length === 0, issues };
}

export function releaseAdvisory(record, now = new Date(), { targetEpisode = null } = {}) {
  const { publishable, issues } = evaluateWatchRecord(record, now);
  const behindEpisode = Number.isInteger(targetEpisode) && targetEpisode > 0
    ? (record.platforms || [])
      .filter((item) => item.state === "verified" && item.episodes?.through < targetEpisode)
      .map((item) => `${item.name} (${item.territories.join(", ")}): through Episode ${item.episodes.through}`)
    : [];
  if (!publishable || record.schedule?.state !== "verified")
    return { stage: "preview-safe", broadlyReleased: false, evergreenSafe: false, behind: [...behindEpisode, "Unknown territories"], issues };
  const finale = Date.parse(record.schedule.standardFinaleAt);
  const windows = record.schedule.windows || [];
  const behind = windows.filter((window) => !validDate(window.finaleAt) || Date.parse(window.finaleAt) > now.getTime())
    .map((window) => window.audience);
  if (now.getTime() < finale || behind.length)
    return { stage: now.getTime() < finale ? "early/original-platform or regional" : "regional", broadlyReleased: false, evergreenSafe: false, behind: [...behindEpisode, ...behind], issues: [] };
  // Even complete listed windows do not prove worldwide access or editorial permission.
  return { stage: "verified listed audiences reached finale", broadlyReleased: false, evergreenSafe: false, behind: ["Unverified territories"], issues: [] };
}

const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function renderWatchPage(record, now = new Date()) {
  const gate = evaluateWatchRecord(record, now);
  if (!gate.publishable) throw new Error(`Where-to-watch publication blocked: ${gate.issues.join("; ")}`);
  const route = `https://fandom.justlikekatie.com${WATCH_ROUTE}`;
  const title = `Where to Watch Against the Current (English Subtitles) | Fandom Vibes`;
  const description = "Official viewing options for Against the Current, compared by verified region, access tier, episode range and English subtitles. Checked by an editor; schedules can change.";
  const rows = record.platforms.map((item) => `<article class="watch-option">
    <h3>${escape(item.name)}</h3>
    <p><strong>Territory:</strong> ${escape(item.territories.join(", "))} · <strong>Access:</strong> ${escape(item.accessTier)}</p>
    <p><strong>Episodes:</strong> ${item.episodes ? `${escape(item.episodes.from)}–${escape(item.episodes.through)}` : "Unknown"} · <strong>English subtitles:</strong> ${escape(item.subtitles.status)}</p>
    <p><strong>Cadence / time zone:</strong> ${escape(item.cadence || "Unknown")} · <strong>Standard finale:</strong> ${escape(item.standardFinaleAt || "Unknown")} · <strong>VIP / express finale:</strong> ${escape(item.advanceFinaleAt || "Unknown")}</p>
    <p><strong>Checked:</strong> <time datetime="${escape(item.checkedAt)}">${escape(item.checkedAt)}</time> · <a href="${escape(item.sourceUrl)}">Official source</a> · ${escape(item.evidence || "Check the current platform listing before subscribing.")}</p>
${item.state === "unknown" ? "    <p><strong>Listing only:</strong> country-specific playback and subtitles have not been verified. Do not assume this option works in your region.</p>\n" : ""}    <p><a class="button" href="${escape(item.url)}" rel="noopener noreferrer">Watch on ${escape(item.name)}</a></p>
  </article>`).join("\n");
  const regions = record.regionGuidance.map((region) => `<li><strong>${escape(region.name)} — ${region.status === "verified" ? "US listing checked" : "availability not verified"}:</strong> ${escape(region.note)} <a href="${escape(region.sourceUrl)}" rel="noopener noreferrer">Official listing</a> <small>(reviewed <time datetime="${escape(region.checkedAt)}">${escape(region.checkedAt.slice(0, 10))}</time>)</small></li>`).join("\n");
  const schedule = record.schedule.state === "verified"
    ? `<p>Official schedule checked ${escape(record.schedule.checkedAt)} (${escape(record.schedule.timeZone)}). Standard finale: ${escape(record.schedule.standardFinaleAt)}. ${record.schedule.windows.map((w) => `${escape(w.audience)}: ${escape(w.finaleAt || "unknown")}`).join("; ")}. Check the platform again before watching.</p>`
    : `<p>The original-platform, standard, VIP/express and English-subtitled regional finale times are ${record.schedule.state === "conflict" ? "conflicting" : "unknown"}. An early-access audience may reach the end before a subtitled regional audience. We cannot confirm a shared release boundary.</p>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title><meta name="description" content="${escape(description)}">
<link rel="canonical" href="${route}"><meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="article"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${route}">
<meta property="og:image" content="https://fandom.justlikekatie.com/assets/c-drama-fandom/lg01-master-og.jpg">
<meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="/c-drama-fandom/styles.css">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Article", headline: title, description, dateModified: record.checkedAt.slice(0, 10), mainEntityOfPage: route })}</script></head>
<body><a class="skip-link" href="#main">Skip to content</a>
<header class="site-header"><div class="site-header__inner"><a class="brand" href="/"><span class="brand__mark">FV</span><span><strong>Fandom Vibes</strong><small>Worldbuilding launchpad</small></span></a><nav class="site-nav" aria-label="C-drama fandom"><a href="/c-drama-fandom/">Guide</a><a href="/c-drama-fandom/vibing-now/against-the-current-episode-21/">Episode 21 reading (spoilers)</a></nav></div></header>
<main id="main"><header class="hero"><p class="breadcrumb"><a href="/c-drama-fandom/">C-drama fandom</a> / Where to watch</p><p class="eyebrow">Against the Current · ${escape(record.originalTitle)} · spoiler-free</p><h1>Where to watch <em>Against the Current.</em></h1>
<p class="hero__lede">Official viewing links and the differences that matter when you are following along in English. We cover the US, UK, Australia, Europe and mainland China separately. Access and subtitles can change without notice; a listing is not a playback guarantee.</p>
<p class="meta-row">Checked ${escape(record.checkedAt)} · Reviewed by ${escape(record.reviewer)}</p></header>
<div class="content-shell"><article class="article">
<p class="callout" id="watch-freshness" role="status" data-checked-at="${escape(record.checkedAt)}">Listing observations are checked manually, not updated live. If more than seven days have passed since the check, treat every availability claim as unverified until an editor rechecks it.</p>
<section><h2>Check your country first</h2><p>These are dated observations, not worldwide streaming rights. An official title page can be visible even when an episode will not play in your location. We have not verified access for the UK, Australia, individual European countries or mainland China.</p><ul>${regions}</ul></section>
<section><h2>Choose your viewing option</h2><p>Start with your location, then compare the episode range and access tier. A platform can list an episode before it is available with English subtitles, and a subscription in one country does not guarantee access in another. These links go directly to the official platform, not an aggregator.</p><div class="watch-options">${rows}</div></section>
<section><h2>Why viewers may be at different episodes</h2>${schedule}<p>Original broadcasts, standard access, VIP or express releases and English-subtitled regional releases need not happen together. We do not infer a worldwide finale from an episode tile. If a schedule is absent or disputed, treat every audience outside the verified listing as behind or unknown.</p><p>This page does not reveal any ending or later-episode events. If you want analysis, the <a href="/c-drama-fandom/vibing-now/against-the-current-episode-21/">Episode 21 reading</a> contains spoilers through Episode 21; open it only after reaching that boundary.</p></section>
<section><h2>How we check this guide</h2><p>We manually compare each official platform listing, its region and access terms, and its English subtitle labels. The date above is the last editorial check, not a promise of future access. We recheck while the series is active and remove or qualify claims when the evidence expires, conflicts or disappears. Rights and subscriptions vary by territory. If a link does not play where you are, check the platform’s local listing; do not assume a VPN or unofficial mirror is an equivalent legal option.</p><p>For the broader fandom context, visit the <a href="/c-drama-fandom/">C-drama companion</a>. This independent fan guide is not affiliated with any broadcaster or platform.</p></section>
</article><aside class="side-rail" aria-label="Viewing notes"><section class="side-card"><h2>Check your region</h2><p>These are verified listing observations, not guarantees. Confirm access and subtitle tracks on the provider before subscribing.</p></section><section class="side-card"><h3>Stay spoiler-safe</h3><p>Availability is not permission to publish ending details. Different audiences can be at different points.</p><a href="/c-drama-fandom/">Return to the C-drama guide →</a></section></aside></div></main>
<footer class="site-footer"><div class="site-footer__inner"><div><h2>Fandom Vibes</h2><p>Independent C-drama editorial guidance.</p></div><div><a href="/c-drama-fandom/">C-drama fandom</a></div></div></footer>
<script>const note=document.querySelector("#watch-freshness");if(Date.now()-Date.parse(note.dataset.checkedAt)>7*86400000)note.textContent="This guide is overdue for a manual recheck. Treat all access and subtitle claims as unverified; use the official links to confirm before subscribing.";</script>
</body></html>`;
}