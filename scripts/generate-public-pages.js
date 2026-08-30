#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptFile = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptFile), "..");
const source = resolve(
  root,
  "attached_assets/Firefly_Gemini_Flash_--ATE._THE._ENTIRE._TABLE.--_No_crumbs,_n_1788112484176.png",
);
const outputDir = resolve(root, "public/assets/c-drama-fandom");
const gamePage = resolve(root, "public/c-drama-fandom/fandom-games/index.html");
const previewDir = resolve(root, "public/c-drama-fandom/fandom-games/previews");
const gameScript = resolve(root, "public/c-drama-fandom/fandom-games/lg01.js");
const journalRanges = [
  [1, 4], [5, 8], [9, 12], [13, 16], [17, 20], [21, 24], [25, 28],
  [29, 32], [33, 36], [37, 40], [41, 44], [45, 48], [49, 50],
].map(([start, end]) => ({
  start,
  end,
  path: `public/c-drama-fandom/watch-journal/episodes-${start}-${end}/index.html`,
  url: `/c-drama-fandom/watch-journal/episodes-${start}-${end}/`,
}));

export const REQUIRED_PUBLIC_PAGES = [
  "public/c-drama-fandom/index.html",
  "public/c-drama-fandom/getting-started/index.html",
  "public/c-drama-fandom/glossary/index.html",
  "public/c-drama-fandom/trope-decoder/index.html",
  "public/c-drama-fandom/fandom-games/index.html",
];

export const WATCH_JOURNAL_PUBLIC_PAGES = [
  "public/c-drama-fandom/watch-journal/index.html",
  ...journalRanges.map((range) => range.path),
];

function loadLg01Outcomes() {
  const script = readFileSync(gameScript, "utf8");
  const matches = [
    ...script.matchAll(
      /\{\s*id: "([^"]+)",\s*number: "([^"]+)",\s*name: "([^"]+)",\s*cn: "([^"]+)",\s*color: "(#[0-9a-f]+)",\s*description: "([^"]+)",\s*\}/g,
    ),
  ];

  if (matches.length !== 9) {
    throw new Error(`Expected nine LG · 01 outcomes, found ${matches.length}.`);
  }

  return matches.map((match) => ({
    id: match[1],
    number: match[2],
    name: match[3],
    cn: match[4],
    color: match[5],
    description: match[6],
  }));
}

export const LG01_OUTCOMES = loadLg01Outcomes();

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeXml(value) {
  return escapeHtml(value).replaceAll("'", "&apos;");
}

function journalPageHtml({ start = null, end = null } = {}) {
  const isRange = start !== null && end !== null;
  const route = isRange
    ? `/c-drama-fandom/watch-journal/episodes-${start}-${end}/`
    : "/c-drama-fandom/watch-journal/";
  const title = isRange
    ? `The Untamed First-Watch Journal: Episodes ${start}–${end} | Fandom Vibes`
    : "The Untamed First-Watch Journal | Fandom Vibes";
  const description = isRange
    ? `Read the approved first-watch journal records available through Episodes ${end}, with predictions and veteran evidence sealed behind a reader-controlled spoiler boundary.`
    : "A spoiler-safe first-watch journal for The Untamed, preserving what was knowable at each episode boundary without turning it into a recap.";
  const defaultBoundary = isRange ? String(end) : "";
  const rangeHeading = isRange ? `Episodes ${start}–${end}` : "The public field journal";
  const rangeLede = isRange
    ? `A reader-safe window through Episode ${end}. The journal will show only approved records the server allows at that boundary.`
    : "A first watch, kept intact: entries, predictions, and evidence appear only after the server checks the boundary you choose.";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="https://fandom.justlikekatie.com${route}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Fandom Vibes">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="https://fandom.justlikekatie.com${route}">
  <meta property="og:image" content="https://fandom.justlikekatie.com/assets/c-drama-fandom/watch-journal-og.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="https://fandom.justlikekatie.com/assets/c-drama-fandom/watch-journal-og.jpg">
  <link rel="stylesheet" href="/c-drama-fandom/styles.css">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": ${JSON.stringify(title)},
    "description": ${JSON.stringify(description)},
    "isPartOf": {"@type": "WebSite", "name": "Fandom Vibes", "url": "https://fandom.justlikekatie.com/"},
    "mainEntityOfPage": "https://fandom.justlikekatie.com${route}"
  }
  </script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="site-header__inner">
      <a class="brand" href="/"><span class="brand__mark">FV</span><span><strong>Fandom Vibes</strong><small>Worldbuilding launchpad</small></span></a>
      <nav class="site-nav" aria-label="C-drama fandom">
        <a href="/c-drama-fandom/">Guide</a>
        <a href="/c-drama-fandom/getting-started/">Getting started</a>
        <a href="/c-drama-fandom/glossary/">Glossary</a>
        <a href="/c-drama-fandom/trope-decoder/">Trope decoder</a>
        <a href="/c-drama-fandom/fandom-games/">Fandom games</a>
        <a href="/c-drama-fandom/watch-journal/" aria-current="page">Field journal</a>
        <a href="/vibe-atlas">Vibe Atlas</a>
      </nav>
    </div>
  </header>
  <main id="main">
    <header class="hero hero--journal" data-default-safe-through="${defaultBoundary}">
      <p class="breadcrumb"><a href="/c-drama-fandom/">C-drama fandom</a> / <a href="/c-drama-fandom/watch-journal/">Field journal</a>${isRange ? ` / Episodes ${start}–${end}` : ""}</p>
      <p class="eyebrow">The Untamed · first-watch record</p>
      <h1>${rangeHeading} <em>without the recap.</em></h1>
      <p class="hero__lede">${rangeLede}</p>
      <div class="journal-boundary" aria-labelledby="journal-boundary-title">
        <div>
          <p class="section-kicker" id="journal-boundary-title">Reader control</p>
          <label for="safe-through">Safe through Episode</label>
          <div class="journal-boundary__form">
            <input id="safe-through" type="number" min="1" max="999" inputmode="numeric" required value="${defaultBoundary}">
            <button class="button" id="load-journal" type="button">Open safe view</button>
          </div>
          <p class="journal-boundary__note">This setting stays on this device. Change it any time; the server filters the response again.</p>
        </div>
        <p class="journal-status" id="journal-status" role="status" aria-live="polite">Choose a boundary to open the journal.</p>
      </div>
      <div class="hero__actions">
        <button class="button button--secondary" id="share-journal" type="button">Share this safe journal page</button>
        <span class="share-status" id="share-status" role="status" aria-live="polite"></span>
      </div>
      <p class="privacy-note">No account, name, private draft, or admin control is part of this reader view. Share links contain only this public route.</p>
    </header>
    <div class="content-shell">
      <article class="article" id="journal-content" aria-live="polite">
        <section class="journal-locked">
          <p class="section-kicker">Nothing is loaded yet</p>
          <h2>Knowledge has a boundary.</h2>
          <p>Enter the episode you have reached. A missing, malformed, or rejected boundary stays locked rather than guessing what you are safe to see.</p>
        </section>
      </article>
      <aside class="side-rail" aria-label="Field journal navigation">
        <section class="side-card"><p class="section-kicker">Why this exists</p><h2>Not a recap</h2><p>The point is the changing state of knowledge: what was written then, what was predicted, and what was learned later.</p></section>
        <section class="side-card"><p class="section-kicker">Episode windows</p><h3>Choose a safe page</h3><div class="journal-range-links">${journalRanges.map((range) => `<a href="${range.url}">Episodes ${range.start}–${range.end}</a>`).join("")}</div></section>
      </aside>
    </div>
  </main>
  <footer class="site-footer"><div class="site-footer__inner"><div><h2>Fandom Vibes</h2><p>A creative home for the tools, rituals, and artifacts fans make around the worlds they love.</p></div><div><strong>Learn</strong><a href="/c-drama-fandom/">C-drama fandom guide</a><a href="/c-drama-fandom/glossary/">Glossary</a></div><div><strong>Create</strong><a href="/c-drama-fandom/fandom-games/">Fandom games</a><a href="/vibe-atlas">Vibe Atlas</a></div></div></footer>
  <script>
  (() => {
    const settingKey = "fandom-watch-journal-safe-through:the-untamed";
    const root = document.querySelector(".hero--journal");
    const input = document.querySelector("#safe-through");
    const loadButton = document.querySelector("#load-journal");
    const status = document.querySelector("#journal-status");
    const content = document.querySelector("#journal-content");
    const shareButton = document.querySelector("#share-journal");
    const shareStatus = document.querySelector("#share-status");
    const defaultBoundary = root.dataset.defaultSafeThrough;
    const validBoundary = (value) => /^[1-9][0-9]{0,2}$/.test(String(value)) && Number(value) <= 999;
    const routeMaximum = validBoundary(defaultBoundary) ? Number(defaultBoundary) : null;
    const allowedOnRoute = (value) => validBoundary(value) && (routeMaximum === null || Number(value) <= routeMaximum);
    const trackEvent = (name, data) => {
      try {
        window.umami?.track(name, data);
      } catch {
        // Analytics must never interrupt the journal.
      }
    };
    const trackJournalEvent = (name, data) => {
      trackEvent(name, routeMaximum === null ? data : { route_end_episode: routeMaximum, ...data });
    };
    const announce = (message, isError = false) => {
      status.textContent = message;
      status.dataset.error = isError ? "true" : "false";
    };
    const text = (tag, value, className) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      node.textContent = value;
      return node;
    };
    const clearContent = () => { content.replaceChildren(); };
    const render = (payload, boundary) => {
      const journal = payload && payload.journal;
      if (!journal || payload.safeThroughEpisode !== boundary || !Array.isArray(journal.entries) || !Array.isArray(journal.predictions) || !Array.isArray(journal.evidence)) {
        throw new Error("The safe journal response was invalid.");
      }
      clearContent();
      const heading = document.createElement("section");
      heading.append(text("p", "Server-filtered reader view", "section-kicker"), text("h2", journal.entries.length ? "What was knowable here." : "No approved entries at this boundary."));
      heading.append(text("p", journal.entries.length ? "These are the approved records available through Episode " + boundary + ". The page does not fill in what the journal did not say." : "The journal remains intentionally empty until approved records are published through a boundary you can safely read."));
      content.append(heading);
      journal.entries.forEach((entry) => {
        const section = document.createElement("section");
        section.className = "journal-entry";
        section.append(text("p", "Filed record", "section-kicker"), text("h2", "Episodes " + entry.episodeStart + "–" + entry.episodeEnd), text("p", "Watched through Episode " + entry.watchedThroughEpisode, "meta-row"));
        const fields = [["Current condition", entry.fields.emotionalCondition], ["Relationship monitored", entry.fields.relationshipMonitored], ["Trust", entry.fields.trustedPeople.join(" · ") || "Nothing filed"], ["Distrust", entry.fields.distrustedPeople.join(" · ") || "Nothing filed"], ["Suspects or objects", entry.fields.recurringSuspects.join(" · ") || "Nothing filed"], ["What seemed to be happening", entry.fields.currentTheory]];
        fields.forEach(([label, value]) => { const p = document.createElement("p"); p.append(text("strong", label + ": "), text("span", value)); section.append(p); });
        const predictions = journal.predictions.filter((prediction) => prediction.entryId === entry.id);
        if (predictions.length) {
          const predictionSection = document.createElement("div");
          predictionSection.className = "journal-predictions";
          predictionSection.append(text("h3", "Prediction ledger"));
          predictions.forEach((prediction) => {
            const item = document.createElement("p");
            item.append(text("strong", "“" + prediction.originalText + "”"));
            if (prediction.resolution) item.append(text("span", " · " + prediction.resolution.verdict + " in Episode " + prediction.resolution.resolutionEpisode));
            predictionSection.append(item);
          });
          section.append(predictionSection);
        }
        const evidence = journal.evidence.filter((item) => item.entryId === entry.id || predictions.some((prediction) => prediction.id === item.predictionId));
        if (evidence.length) {
          const evidenceSection = document.createElement("div");
          evidenceSection.className = "journal-evidence";
          evidenceSection.append(text("h3", "Unlocked veteran evidence"));
          evidence.forEach((item) => evidenceSection.append(text("p", item.interpretation)));
          section.append(evidenceSection);
        }
        content.append(section);
      });
    };
    let lastLoadedBoundary = null;
    const readStoredBoundary = () => {
      let stored;
      try { stored = localStorage.getItem(settingKey); } catch { return null; }
      if (stored === null) return defaultBoundary || null;
      if (!allowedOnRoute(stored)) return defaultBoundary || null;
      return stored;
    };
    const load = async () => {
      const value = input.value.trim();
      if (!allowedOnRoute(value)) {
        clearContent();
        const guidance = routeMaximum === null
          ? "Enter a whole episode number from 1 to 999 before opening the journal."
          : "This shared page is capped at Episode " + routeMaximum + ". Choose a later episode page before raising the boundary.";
        content.append(text("section", guidance, "journal-locked"));
        announce("The journal stayed locked because the boundary is malformed.", true);
        trackJournalEvent("watch_journal_safe_view_loaded", {
          outcome: "failed",
          failure_reason: "invalid_boundary",
        });
        if (lastLoadedBoundary !== null) {
          trackJournalEvent("watch_journal_boundary_changed", {
            from_episode: lastLoadedBoundary,
            outcome: "failed",
            failure_reason: "invalid_boundary",
          });
        }
        return;
      }
      const boundary = Number(value);
      const previousBoundary = lastLoadedBoundary;
      try { localStorage.setItem(settingKey, String(boundary)); } catch {}
      loadButton.disabled = true;
      announce("Checking the server-safe view…");
      let loadFailureReason = "request";
      try {
        const response = await fetch("/.netlify/functions/watch-journal?audience=reader&safeThroughEpisode=" + encodeURIComponent(boundary), { credentials: "omit", cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload && payload.error ? payload.error : "The journal stayed locked.");
        loadFailureReason = "invalid_response";
        render(payload, boundary);
        lastLoadedBoundary = boundary;
        trackJournalEvent("watch_journal_safe_view_loaded", {
          outcome: "success",
          safe_through_episode: boundary,
        });
        if (previousBoundary !== null && previousBoundary !== boundary) {
          trackJournalEvent("watch_journal_boundary_changed", {
            from_episode: previousBoundary,
            to_episode: boundary,
            outcome: "success",
          });
        }
        announce("Showing only approved records safe through Episode " + boundary + ".");
      } catch (error) {
        clearContent();
        content.append(text("section", "The journal stayed locked. " + (error && error.message ? error.message : "Try again later."), "journal-locked"));
        announce("No safe journal view was loaded.", true);
        trackJournalEvent("watch_journal_safe_view_loaded", {
          outcome: "failed",
          failure_reason: loadFailureReason,
          safe_through_episode: boundary,
        });
        if (previousBoundary !== null && previousBoundary !== boundary) {
          trackJournalEvent("watch_journal_boundary_changed", {
            from_episode: previousBoundary,
            to_episode: boundary,
            outcome: "failed",
            failure_reason: loadFailureReason,
          });
        }
      } finally { loadButton.disabled = false; }
    };
    const initial = readStoredBoundary();
    if (initial) { input.value = initial; void load(); }
    loadButton.addEventListener("click", () => void load());
    shareButton.addEventListener("click", async () => {
      const publicUrl = new URL(window.location.pathname, window.location.origin).href;
      const trackShareOutcome = (outcome, method) => {
        const data = { outcome, method };
        if (lastLoadedBoundary !== null) data.safe_through_episode = lastLoadedBoundary;
        trackJournalEvent("watch_journal_shared", data);
      };
      try {
        if (navigator.share) {
          await navigator.share({ title: document.title, text: "A spoiler-safe first-watch journal", url: publicUrl });
          trackShareOutcome("success", "native");
          shareStatus.textContent = "Safe public page ready to share.";
        } else {
          await navigator.clipboard.writeText(publicUrl);
          trackShareOutcome("success", "copy");
          shareStatus.textContent = "Safe public page link copied.";
        }
      } catch (error) {
        trackShareOutcome(error && error.name === "AbortError" ? "cancelled" : "failed", navigator.share ? "native" : "copy");
        if (error && error.name !== "AbortError") shareStatus.textContent = "Copy the public page URL from your browser.";
      }
    });
  })();
  </script>
</body>
</html>`;
}

function wrapText(value, maxCharacters) {
  const words = value.split(/\s+/);
  const lines = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function socialCardSvg(outcome) {
  const descriptionLines = wrapText(outcome.description, 59).slice(0, 3);
  const description = descriptionLines
    .map(
      (line, index) =>
        `<text x="100" y="${405 + index * 36}" fill="#dce5e8" font-family="Arial, sans-serif" font-size="27">${escapeXml(line)}</text>`,
    )
    .join("");

  return `
    <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#061321" stop-opacity=".88"/>
          <stop offset=".55" stop-color="#061321" stop-opacity=".72"/>
          <stop offset="1" stop-color="#061321" stop-opacity=".9"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#shade)"/>
      <rect x="58" y="52" width="1084" height="526" rx="8" fill="#061321" fill-opacity=".68" stroke="${escapeXml(outcome.color)}" stroke-width="3"/>
      <text x="100" y="125" fill="${escapeXml(outcome.color)}" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="3">LG · 01 / FATE ${escapeXml(outcome.number)}</text>
      <text x="100" y="205" fill="#f3eee5" font-family="Georgia, serif" font-size="33" letter-spacing="2">YOUR XIANXIA FATE IS</text>
      <text x="100" y="305" fill="#f3eee5" font-family="Georgia, serif" font-size="70" font-weight="700">${escapeXml(outcome.name.toUpperCase())}</text>
      <text x="100" y="355" fill="${escapeXml(outcome.color)}" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="2">YOUR RESULT · NINE FATES, ONE ANSWER</text>
      ${description}
      <text x="100" y="535" fill="#d5ac58" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="2">FANDOM VIBES · FANDOM.JUSTLIKEKATIE.COM</text>
      <text x="100" y="560" fill="#91a4b0" font-family="Arial, sans-serif" font-size="18">Don&apos;t pick your favorite. Pick the one that exposes you.</text>
    </svg>
  `;
}

function previewHtml(template, outcome) {
  const title = `Your Xianxia Fate: ${outcome.name} | Fandom Vibes`;
  const description = outcome.description;
  const image = `https://fandom.justlikekatie.com/assets/c-drama-fandom/lg01-${outcome.id}-og.jpg`;
  const openGraphUrl = `https://fandom.justlikekatie.com/c-drama-fandom/fandom-games/?fate=${outcome.id}`;
  const replaceAttribute = (html, pattern, value) =>
    html.replace(pattern, `$1${escapeHtml(value)}$2`);

  let html = template.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  html = replaceAttribute(html, /(<meta name="description" content=")[^"]*(")/i, description);
  html = replaceAttribute(html, /(<meta name="robots" content=")[^"]*(")/i, "noindex,follow,max-image-preview:large");
  html = replaceAttribute(html, /(<meta property="og:title" content=")[^"]*(")/i, title);
  html = replaceAttribute(html, /(<meta property="og:description" content=")[^"]*(")/i, description);
  html = replaceAttribute(html, /(<meta property="og:url" content=")[^"]*(")/i, openGraphUrl);
  html = replaceAttribute(html, /(<meta property="og:image" content=")[^"]*(")/i, image);
  html = replaceAttribute(html, /(<meta name="twitter:title" content=")[^"]*(")/i, title);
  html = replaceAttribute(html, /(<meta name="twitter:description" content=")[^"]*(")/i, description);
  html = replaceAttribute(html, /(<meta name="twitter:image" content=")[^"]*(")/i, image);
  return html;
}

async function prepareOutcomeAssets(template) {
  mkdirSync(previewDir, { recursive: true });
  await Promise.all(
    LG01_OUTCOMES.flatMap((outcome) => {
      const socialPath = resolve(outputDir, `lg01-${outcome.id}-og.jpg`);
      const pageDir = resolve(previewDir, outcome.id);
      mkdirSync(pageDir, { recursive: true });
      const pagePath = resolve(pageDir, "index.html");
      const image = sharp(source)
        .rotate()
        .resize(1200, 630, { fit: "cover", position: "attention" })
        .modulate({ brightness: 0.72, saturation: 0.86 })
        .composite([{ input: Buffer.from(socialCardSvg(outcome)) }])
        .jpeg({ quality: 88, progressive: true })
        .toFile(socialPath);
      writeFileSync(pagePath, previewHtml(template, outcome));
      return [image];
    }),
  );
}

export async function preparePublicPages() {
  if (!existsSync(source)) {
    throw new Error(`LG · 01 master is missing: ${source}`);
  }
  for (const page of REQUIRED_PUBLIC_PAGES) {
    if (!existsSync(resolve(root, page))) {
      throw new Error(`Required public page is missing: ${page}`);
    }
  }
  for (const page of WATCH_JOURNAL_PUBLIC_PAGES) {
    mkdirSync(dirname(resolve(root, page)), { recursive: true });
    writeFileSync(resolve(root, page), journalPageHtml(
      page.includes("episodes-")
        ? journalRanges.find((range) => range.path === page)
        : {},
    ));
  }

  mkdirSync(outputDir, { recursive: true });
  const template = readFileSync(gamePage, "utf8");

  await Promise.all([
    sharp(source)
      .rotate()
      .resize({ width: 1100, withoutEnlargement: true })
      .webp({ quality: 86 })
      .toFile(resolve(outputDir, "which-xianxia-fate-chose-you-lg01.webp")),
    sharp(source)
      .rotate()
      .resize(1200, 630, {
        fit: "contain",
        background: { r: 5, g: 18, b: 31, alpha: 1 },
      })
      .jpeg({ quality: 88, progressive: true })
      .toFile(resolve(outputDir, "lg01-master-og.jpg")),
    sharp(Buffer.from(`
      <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <rect width="1200" height="630" fill="#061321"/>
        <rect x="58" y="52" width="1084" height="526" rx="8" fill="#0b2135" stroke="#d5ac58" stroke-width="3"/>
        <text x="100" y="150" fill="#d5ac58" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="4">FANDOM VIBES · FIELD JOURNAL</text>
        <text x="100" y="280" fill="#f3eee5" font-family="Georgia, serif" font-size="72">The Untamed</text>
        <text x="100" y="355" fill="#e28b76" font-family="Georgia, serif" font-size="42">A first watch, kept intact.</text>
        <text x="100" y="520" fill="#91a4b0" font-family="Arial, sans-serif" font-size="21">Read only what your episode boundary allows.</text>
      </svg>
    `)).jpeg({ quality: 88, progressive: true }).toFile(resolve(outputDir, "watch-journal-og.jpg")),
    prepareOutcomeAssets(template),
  ]);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptFile) {
  await preparePublicPages();
  console.log("Prepared crawlable C-drama fandom pages and LG · 01 assets.");
}