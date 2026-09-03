import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import sharp from "sharp";
import {
  LG01_OUTCOMES,
  preparePublicPages,
  REQUIRED_PUBLIC_PAGES,
  TROPE_DECODER_SHARE_EVENT,
  WATCH_JOURNAL_PUBLIC_PAGES,
} from "./generate-public-pages.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("the C-drama fandom routes are substantial static HTML documents", () => {
  const titles = new Set();
  const canonicals = new Set();

  for (const path of REQUIRED_PUBLIC_PAGES) {
    const html = read(path);
    assert.match(html, /<!doctype html>/i, `${path} must be a full HTML document`);
    assert.match(html, /<h1[\s>]/i, `${path} must contain a crawlable H1`);
    assert.match(html, /<meta name="description" content="[^"]{80,}"/i);
    assert.match(html, /<script type="application\/ld\+json">/i);
    assert.doesNotMatch(html, /<div id="root"><\/div>/i, `${path} cannot rely on the SPA root`);
    assert.ok(html.length > 7_000, `${path} should contain substantial editorial content`);

    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
    assert.ok(title);
    assert.ok(canonical);
    titles.add(title);
    canonicals.add(canonical);
  }

  assert.equal(titles.size, REQUIRED_PUBLIC_PAGES.length, "page titles must be unique");
  assert.equal(canonicals.size, REQUIRED_PUBLIC_PAGES.length, "canonicals must be unique");
});

test("robots and sitemap expose only intended public surfaces", () => {
  const robots = read("public/robots.txt");
  const sitemap = read("public/sitemap.xml");
  const viteConfig = read("vite.config.ts");
  const netlify = read("netlify.toml");
  const editorialUrls = [
    "https://fandom.justlikekatie.com/c-drama-fandom/",
    "https://fandom.justlikekatie.com/c-drama-fandom/getting-started/",
    "https://fandom.justlikekatie.com/c-drama-fandom/glossary/",
    "https://fandom.justlikekatie.com/c-drama-fandom/glossary/cp/",
    "https://fandom.justlikekatie.com/c-drama-fandom/glossary/cultivation/",
    "https://fandom.justlikekatie.com/c-drama-fandom/glossary/xianxia/",
    "https://fandom.justlikekatie.com/c-drama-fandom/glossary/jianghu/",
    "https://fandom.justlikekatie.com/c-drama-fandom/trope-decoder/",
    "https://fandom.justlikekatie.com/c-drama-fandom/fandom-games/",
  ];
  const journalUrls = WATCH_JOURNAL_PUBLIC_PAGES.map((path) => (
    `https://fandom.justlikekatie.com/${path
      .replace(/^public\//, "")
      .replace(/index\.html$/, "")}`
  ));

  assert.match(robots, /^User-agent: \*/m);
  assert.match(robots, /^Sitemap: https:\/\/fandom\.justlikekatie\.com\/sitemap\.xml$/m);
  assert.equal(XMLValidator.validate(sitemap), true, "sitemap must be valid XML");

  const sitemapDocument = new XMLParser({ ignoreAttributes: true }).parse(sitemap);
  const sitemapUrls = sitemapDocument.urlset?.url?.map((entry) => entry.loc);
  assert.ok(Array.isArray(sitemapUrls), "sitemap must contain a urlset with url entries");
  for (const url of editorialUrls) {
    assert.equal(
      sitemapUrls.filter((sitemapUrl) => sitemapUrl === url).length,
      1,
      `${url} must appear in the sitemap exactly once`,
    );
  }
  for (const url of journalUrls) {
    assert.equal(
      sitemapUrls.filter((sitemapUrl) => sitemapUrl === url).length,
      1,
      `${url} must appear in the sitemap exactly once`,
    );
  }
  assert.equal(
    sitemapUrls.filter((url) => url.startsWith("https://fandom.justlikekatie.com/c-drama-fandom/")).length,
    editorialUrls.length + journalUrls.length,
    "sitemap must expose only the intended editorial and journal routes",
  );
  assert.ok(sitemapUrls.includes("https://fandom.justlikekatie.com/vibe-atlas"));
  assert.doesNotMatch(sitemap, /view=(?:collection|builder|plan|membership)/);
  assert.doesNotMatch(sitemap, /\/api\/|\/auth\/|create-handoff|idea-packet/);
  assert.match(viteConfig, /['"]\/c-drama-fandom\/trope-decoder['"]\s*,\s*['"]\/c-drama-fandom\/trope-decoder\/index\.html['"]/);
  assert.match(netlify, /from = "\/c-drama-fandom\/trope-decoder"[\s\S]*?to = "\/c-drama-fandom\/trope-decoder\/index\.html"/);
  for (const slug of ["cp", "cultivation", "xianxia", "jianghu"]) {
    assert.match(
      viteConfig,
      new RegExp(`['"]/c-drama-fandom/glossary/${slug}['"]\\s*,\\s*['"]/c-drama-fandom/glossary/${slug}/index\\.html['"]`),
    );
    assert.match(
      netlify,
      new RegExp(`from = "/c-drama-fandom/glossary/${slug}"[\\s\\S]*?to = "/c-drama-fandom/glossary/${slug}/index\\.html"`),
    );
  }
});

test("the fandom-literacy pages answer independently and continue honestly into Atlas", () => {
  const literacyPages = [
    ["cp", /What does CP mean in C-drama fandom\?/i],
    ["cultivation", /What is cultivation in Chinese dramas\?/i],
    ["xianxia", /What is xianxia\?/i],
    ["jianghu", /What is jianghu\?/i],
  ];

  for (const [slug, question] of literacyPages) {
    const html = read(`public/c-drama-fandom/glossary/${slug}/index.html`);
    assert.match(html, question);
    assert.match(html, /data-content-mode="fandom-literacy"/);
    assert.match(html, /class="field-lens"/);
    assert.match(html, /data-atlas-continuation/);
    assert.match(html, /Today’s Vibe Atlas drop/i);
    assert.match(html, /src="\/c-drama-fandom\/editorial\.js"/);
  }
});

test("the public field journal has crawlable direct routes with spoiler-safe metadata", () => {
  const netlify = read("netlify.toml");
  const viteConfig = read("vite.config.ts");
  const canonicals = new Set();
  const titles = new Set();

  for (const path of WATCH_JOURNAL_PUBLIC_PAGES) {
    const html = read(path);
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
    assert.ok(title, `${path} must have a title`);
    assert.ok(canonical, `${path} must have a canonical`);
    titles.add(title);
    canonicals.add(canonical);
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /<h1[\s>]/i);
    assert.match(html, /<script type="application\/ld\+json">/i);
    assert.match(html, /name="robots" content="index,follow,max-image-preview:large"/i);
    assert.match(html, /property="og:image" content="https:\/\/fandom\.justlikekatie\.com\/assets\/c-drama-fandom\/watch-journal-og\.jpg"/);
    assert.doesNotMatch(html, /accountId|admin controls|privateDraft|audience=admin/i);
    assert.doesNotMatch(canonical, /[?&](?:safeThroughEpisode|account|email)=/i);
  }

  assert.equal(titles.size, WATCH_JOURNAL_PUBLIC_PAGES.length);
  assert.equal(canonicals.size, WATCH_JOURNAL_PUBLIC_PAGES.length);
  assert.match(
    netlify,
    /from = "\/c-drama-fandom\/watch-journal\/episodes-1-4"[\s\S]*?to = "\/c-drama-fandom\/watch-journal\/episodes-1-4\/index\.html"/,
  );
  assert.match(
    viteConfig,
    /`\/c-drama-fandom\/watch-journal\/episodes-\$\{start\}-\$\{end\}`/,
  );
});

test("the C-drama guide makes the Watch Journal discoverable", () => {
  const guide = read("public/c-drama-fandom/index.html");

  assert.match(
    guide,
    /<a href="\/c-drama-fandom\/watch-journal\/">Field journal<\/a>/,
    "the shared C-drama navigation must link to the Watch Journal",
  );
  assert.match(
    guide,
    /<a class="button button--secondary" href="\/c-drama-fandom\/watch-journal\/">Read The Untamed field journal<\/a>/,
    "the guide must have a clear Watch Journal call to action",
  );
  assert.match(
    guide,
    /<a href="\/c-drama-fandom\/watch-journal\/">Open the Watch Journal →<\/a>/,
    "the guide exploration rail must link to the Watch Journal",
  );
});

test("the field journal source persists a strict boundary and fetches no unfiltered payload", () => {
  const index = read("public/c-drama-fandom/watch-journal/index.html");
  const range = read("public/c-drama-fandom/watch-journal/episodes-1-4/index.html");

  assert.match(index, /data-default-safe-through=""/);
  assert.match(range, /data-default-safe-through="4"/);
  assert.match(index, /fandom-watch-journal-safe-through:the-untamed/);
  assert.match(index, /\/\^\[1-9\]\[0-9\]\{0,2\}\$\//);
  assert.match(index, /Number\(value\) <= 999/);
  assert.match(index, /safeThroughEpisode=" \+ encodeURIComponent\(boundary\)/);
  assert.match(index, /credentials: "omit", cache: "no-store"/);
  assert.match(index, /payload\.safeThroughEpisode !== boundary/);
  assert.match(range, /const routeMaximum = validBoundary\(defaultBoundary\) \? Number\(defaultBoundary\) : null/);
  assert.match(range, /routeMaximum === null \|\| Number\(value\) <= routeMaximum/);
  assert.match(range, /if \(!allowedOnRoute\(stored\)\) return defaultBoundary \|\| null/);
  assert.match(index, /content\.replaceChildren\(\)/);
  assert.match(index, /node\.textContent = value/);
  assert.doesNotMatch(index, /innerHTML|dangerouslySetInnerHTML/);
  assert.doesNotMatch(index, /journal\s*=\s*\{\s*"entries"/);
  assert.doesNotMatch(index, /fetch\("[^"]*audience=reader"\)/);
  assert.match(index, /The journal stayed locked because the boundary is malformed/);
  assert.match(index, /new URL\(window\.location\.pathname, window\.location\.origin\)\.href/);
});

test("the field journal analytics track outcomes without journal content or private values", () => {
  const index = read("public/c-drama-fandom/watch-journal/index.html");
  const range = read("public/c-drama-fandom/watch-journal/episodes-1-4/index.html");
  const eventNames = [...index.matchAll(/trackJournalEvent\("([^"]+)"/g)].map((match) => match[1]);
  const trackedData = [...index.matchAll(/trackJournalEvent\("[^"]+", \{([\s\S]*?)\}\);/g)].map((match) => match[1]);

  assert.deepEqual([...new Set(eventNames)].sort(), [
    "watch_journal_boundary_changed",
    "watch_journal_safe_view_loaded",
    "watch_journal_shared",
  ]);
  assert.match(index, /const trackEvent = \(name, data\) => \{\s*try \{\s*window\.umami\?\.track\(name, data\);\s*\} catch \{/);
  assert.match(index, /route_end_episode: routeMaximum/);
  assert.match(index, /safe_through_episode: boundary/);
  assert.match(index, /from_episode: previousBoundary/);
  assert.match(index, /to_episode: boundary/);
  assert.match(index, /outcome: "failed"/);
  assert.match(index, /failure_reason: "invalid_boundary"/);
  assert.match(index, /loadFailureReason = "invalid_response"/);
  assert.match(index, /safe_through_episode: boundary/);
  assert.match(index, /outcome: "failed"/);
  assert.match(index, /trackShareOutcome\(error && error\.name === "AbortError" \? "cancelled" : "failed"/);
  assert.match(index, /trackShareOutcome\("success", "native"\)/);
  assert.match(index, /trackShareOutcome\("success", "copy"\)/);
  assert.doesNotMatch(index, /trackJournalEvent\([^)]*(?:originalText|interpretation|publicUrl|error\.message|accountId|email)/i);
  for (const data of trackedData) {
    assert.doesNotMatch(data, /text|evidence|prediction|entry|url|account|email|error/i);
  }
  assert.match(range, /route_end_episode: routeMaximum/);
});

test("the trope decoder is searchable, shareable, and spoiler-light", () => {
  const html = read("public/c-drama-fandom/trope-decoder/index.html");
  const entryIds = [...html.matchAll(/class="trope-card" id="([^"]+)"/g)].map((match) => match[1]);
  const categoryIds = [...html.matchAll(/class="trope-card"[^>]+data-category="([^"]+)"/g)].map((match) => match[1]);
  const filterIds = [...html.matchAll(/class="decoder-filter[^"]*"[^>]+data-filter="([^"]+)"/g)].map((match) => match[1]);

  assert.equal(entryIds.length, 14);
  assert.equal(new Set(entryIds).size, 14);
  assert.equal((html.match(/class="trope-card__newcomer"/g) ?? []).length, 14);
  assert.equal((html.match(/class="trope-card__veteran"/g) ?? []).length, 14);
  assert.deepEqual([...new Set(categoryIds)].sort(), ["love", "realm", "signs"]);
  assert.deepEqual(
    categoryIds.reduce((counts, category) => ({ ...counts, [category]: (counts[category] ?? 0) + 1 }), {}),
    { love: 5, realm: 5, signs: 4 },
  );
  assert.deepEqual(filterIds, ["all", "love", "realm", "signs"]);
  assert.match(html, /Newcomers see:<\/span> Certain death\./);
  assert.match(html, /Veterans know:<\/span> She’d need amnesia to fall for him in this enemies-to-lovers arc\./);
  assert.doesNotMatch(html, /It’s never a cliff of death\. It’s a cliff of amnesia\./);
  assert.match(html, /id="trope-search"/);
  assert.match(html, /data-search="[^"]+"/);
  assert.match(html, /matchesCategory = activeFilter === "all" \|\| card\.dataset\.category === activeFilter/);
  assert.match(html, /id="share-decoder"/);
  assert.match(html, /publicUrl = "https:\/\/fandom\.justlikekatie\.com\/c-drama-fandom\/trope-decoder\/"/);
  assert.match(html, /window\.gtag\("event", name, data\)/);
  assert.match(html, /window\.dataLayer\.push\(\["event", name, data\]\)/);
  assert.match(html, /trackEvent\("trope_filter_used", \{\s*category: activeFilter,\s*query_present: Boolean\(query\),\s*result_count: visible\s*\}\)/);
  assert.match(html, new RegExp(`trackEvent\\("${TROPE_DECODER_SHARE_EVENT}", \\{ method: "native" \\}\\)`));
  assert.match(html, new RegExp(`trackEvent\\("${TROPE_DECODER_SHARE_EVENT}", \\{ method: "copy" \\}\\)`));
  assert.doesNotMatch(html, /trackEvent\("trope_filter_used"[\s\S]*?search\.value/);
  assert.doesNotMatch(html, /trackEvent\("decoder_share_succeeded", \{[^}]*publicUrl/);
  assert.match(html, /no account, Collection, name, or browsing information/i);
  assert.match(html, /original descriptions—not dialogue, scripts, or episode transcripts/i);
  assert.match(html, /"@type": "ItemList"/);
  assert.match(html, /"numberOfItems": 14/);
});

test("LG01 has nine bounded outcomes and a privacy-safe share contract", () => {
  const html = read("public/c-drama-fandom/fandom-games/index.html");
  const script = read("public/c-drama-fandom/fandom-games/lg01.js");
  const outcomeIds = [...html.matchAll(/data-fate="([^"]+)"/g)].map((match) => match[1]);

  assert.equal(outcomeIds.length, 9);
  assert.equal(new Set(outcomeIds).size, 9);
  for (const id of outcomeIds) {
    assert.match(id, /^[a-z]+(?:-[a-z]+)*$/);
    assert.match(script, new RegExp(`id: "${id}"`));
  }
  assert.match(script, /searchParams\.set\("fate", outcome\.id\)/);
  assert.doesNotMatch(script, /localStorage|sessionStorage|document\.cookie/);
  assert.doesNotMatch(script, /email|accountId|collectionId|userId/);
  assert.match(html, /requires no account|no sign-in gate|private by default|Privacy note/i);
});

test("LG01 promo media uses published assets with an accessible reduced-motion fallback", async () => {
  await preparePublicPages();
  const html = read("public/c-drama-fandom/fandom-games/index.html");
  const script = read("public/c-drama-fandom/fandom-games/lg01.js");
  const styles = read("public/c-drama-fandom/styles.css");
  const videoPath = resolve(root, "public/assets/c-drama-fandom/xianxia-fate-lg01-promo.mp4");
  const posterPath = resolve(root, "public/assets/c-drama-fandom/xianxia-fate-lg01-promo-poster.jpg");
  assert.equal(existsSync(videoPath), true);
  assert.equal(existsSync(posterPath), true);
  assert.ok(readFileSync(videoPath).length > 100_000);
  const posterMeta = await sharp(posterPath).metadata();
  assert.equal(posterMeta.format, "jpeg");
  assert.equal(posterMeta.width, 1080);
  assert.equal(posterMeta.height, 1080);

  assert.match(html, /class="promo-media"/);
  assert.match(html, /src="\/assets\/c-drama-fandom\/xianxia-fate-lg01-promo\.mp4" type="video\/mp4"/);
  assert.match(html, /poster="\/assets\/c-drama-fandom\/xianxia-fate-lg01-promo-poster\.jpg"/);
  assert.match(html, /aria-label="Preview of Which Xianxia Fate Chose You\?"/);
  assert.match(html, /aria-describedby="promo-media-description"/);
  assert.match(html, /\bcontrols\b/);
  assert.match(html, /\bloop\b/);
  assert.match(html, /\bmuted\b/);
  assert.match(html, /\bplaysinline\b/);
  assert.match(html, /data-autoplay="normal-motion-only"/);
  assert.match(html, /Video unavailable\./);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.promo-media__poster \{ display: none; \}/);
  assert.doesNotMatch(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.promo-media__video \{ display: none; \}/);
  assert.match(styles, /\.promo-media__toggle \{ display: none; \}/);
  assert.match(script, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
  assert.match(script, /if \(!reducedMotion\)/);
  assert.match(html, /The poster above and the master grid image still show the full nine-fate board/);
  for (const name of [
    "Moonlit Strategist", "Exiled Immortal", "Chaos Prince", "Lotus Healer",
    "Silent Sword", "Fox Spirit", "Celestial Guardian", "Bamboo Recluse", "Fated Romantic",
  ]) {
    assert.match(html, new RegExp(name));
  }
  assert.doesNotMatch(html, /attached_assets|localhost|127\.0\.0\.1/);
});

test("asset preparation produces optimized content and social images", async () => {
  await preparePublicPages();
  const contentPath = resolve(root, "public/assets/c-drama-fandom/which-xianxia-fate-chose-you-lg01.webp");
  const socialPath = resolve(root, "public/assets/c-drama-fandom/lg01-master-og.jpg");
  const journalSocialPath = resolve(root, "public/assets/c-drama-fandom/watch-journal-og.jpg");
  const promoVideoPath = resolve(root, "public/assets/c-drama-fandom/xianxia-fate-lg01-promo.mp4");
  const promoPosterPath = resolve(root, "public/assets/c-drama-fandom/xianxia-fate-lg01-promo-poster.jpg");
  assert.equal(existsSync(contentPath), true);
  assert.equal(existsSync(socialPath), true);
  assert.equal(existsSync(journalSocialPath), true);
  assert.equal(existsSync(promoVideoPath), true);
  assert.equal(existsSync(promoPosterPath), true);

  const contentMeta = await sharp(contentPath).metadata();
  const socialMeta = await sharp(socialPath).metadata();
  const journalSocialMeta = await sharp(journalSocialPath).metadata();
  assert.equal(contentMeta.format, "webp");
  assert.ok((contentMeta.width ?? 0) <= 1100);
  assert.equal(socialMeta.format, "jpeg");
  assert.equal(socialMeta.width, 1200);
  assert.equal(socialMeta.height, 630);
  assert.equal(journalSocialMeta.format, "jpeg");
  assert.equal(journalSocialMeta.width, 1200);
  assert.equal(journalSocialMeta.height, 630);
});

test("each allowlisted LG01 fate has a static social preview and exact query rewrite", async () => {
  await preparePublicPages();
  const netlify = read("netlify.toml");

  for (const outcome of LG01_OUTCOMES) {
    const previewPath = `public/c-drama-fandom/fandom-games/previews/${outcome.id}/index.html`;
    const html = read(previewPath);
    const title = `Your Xianxia Fate: ${outcome.name} | Fandom Vibes`;
    const imageUrl = `https://fandom.justlikekatie.com/assets/c-drama-fandom/lg01-${outcome.id}-og.jpg`;
    const openGraphUrl = `https://fandom.justlikekatie.com/c-drama-fandom/fandom-games/?fate=${outcome.id}`;

    assert.match(html, new RegExp(`<title>${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/title>`));
    assert.match(html, new RegExp(`name="description" content="${outcome.description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(html, new RegExp(`property="og:image" content="${imageUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(html, /property="og:image:width" content="1200"/);
    assert.match(html, /property="og:image:height" content="630"/);
    assert.match(html, /name="robots" content="noindex,follow,max-image-preview:large"/);
    assert.match(html, /<link rel="canonical" href="https:\/\/fandom\.justlikekatie\.com\/c-drama-fandom\/fandom-games\/">/);
    assert.match(html, new RegExp(`property="og:url" content="${openGraphUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.doesNotMatch(html, /property="og:url" content="[^"]*utm_/);
    assert.match(
      netlify,
      new RegExp(
        `to = "/c-drama-fandom/fandom-games/previews/${outcome.id}/index\\.html"[\\s\\S]*?query = \\{ fate = "${outcome.id}" \\}`,
      ),
    );
    assert.match(html, /\/assets\/c-drama-fandom\/xianxia-fate-lg01-promo\.mp4/);
    assert.match(html, /\/assets\/c-drama-fandom\/xianxia-fate-lg01-promo-poster\.jpg/);
    assert.doesNotMatch(html, /attached_assets|localhost|127\.0\.0\.1/);

    const socialMeta = await sharp(resolve(root, `public/assets/c-drama-fandom/lg01-${outcome.id}-og.jpg`)).metadata();
    assert.equal(socialMeta.format, "jpeg");
    assert.equal(socialMeta.width, 1200);
    assert.equal(socialMeta.height, 630);
  }

  assert.doesNotMatch(netlify, /query = \{ fate = ":fate" \}/);
});