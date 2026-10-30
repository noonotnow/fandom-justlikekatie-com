import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { PUBLIC_STATIC_ROUTES, staticSitemapXml } from "../shared/public-routes.js";
import { publicStaticNetlifyRedirects } from "./generate-public-pages.js";
import { evaluateWatchRecord, loadWatchRecord, releaseAdvisory, renderWatchPage, renderRetainedWatchPage, WATCH_PAGE, WATCH_ROUTE } from "./where-to-watch.js";

const now = new Date("2026-09-28T13:00:00Z");
const fixture = () => ({
  slug: "against-the-current", title: "Against the Current", originalTitle: "兰香如故",
  reviewer: "Editorial reviewer", rightsReviewed: true, spoilerReviewed: true,
  checkedAt: "2026-09-28T08:00:00Z",
  regionGuidance: ["United States", "United Kingdom", "Australia", "Europe (country by country)", "Mainland China"].map((name) => ({
    name, status: name === "United States" ? "verified" : "unverified",
    note: name === "United States" ? "US listing checked." : "Local access not verified.",
    sourceUrl: name === "Mainland China" ? "https://v.qq.com/official" : "https://www.viki.com/official",
    checkedAt: "2026-09-28T08:00:00Z",
  })),
  platforms: [
    { name: "Provider A", url: "https://www.viki.com/watch", sourceUrl: "https://www.viki.com/official",
      checkedAt: "2026-09-28T08:00:00Z", territories: ["US"], accessTier: "subscription",
      episodes: { from: 1, through: 21 }, subtitles: { language: "English", status: "verified" },
      cadence: null, standardFinaleAt: null, advanceFinaleAt: null, state: "verified", conflict: null },
    { name: "Provider B", url: "https://wetv.vip/watch", sourceUrl: "https://wetv.vip/official",
      checkedAt: "2026-09-28T08:00:00Z", territories: ["Canada"], accessTier: "free",
      episodes: { from: 1, through: 15 }, subtitles: { language: "English", status: "verified" },
      cadence: null, standardFinaleAt: null, advanceFinaleAt: null, state: "verified", conflict: null },
  ],
  schedule: { state: "unknown", windows: [] },
});

test("source-reviewed page is registered once; unreviewed updates fail publication", () => {
  const record = loadWatchRecord();
  const reviewTime = new Date(record.checkedAt);
  const gate = evaluateWatchRecord(record, reviewTime);
  assert.equal(gate.publishable, true, gate.issues.join("; "));
  assert.equal(PUBLIC_STATIC_ROUTES.filter(({ path }) => path === WATCH_ROUTE).length, 1);
  assert.equal(publicStaticNetlifyRedirects().filter(({ from }) => from === WATCH_ROUTE.slice(0, -1)).length, 1);
  assert.equal(staticSitemapXml().split(`<loc>https://fandom.justlikekatie.com${WATCH_ROUTE}</loc>`).length - 1, 1);
  for (const path of ["public/c-drama-fandom/index.html", "public/c-drama-fandom/vibing-now/against-the-current-episode-21/index.html"]) {
    assert.match(readFileSync(path, "utf8"), /where-to-watch\/against-the-current/);
  }
  const unreviewed = structuredClone(record);
  unreviewed.rightsReviewed = false;
  assert.equal(evaluateWatchRecord(unreviewed, reviewTime).publishable, false);
  assert.throws(() => renderWatchPage(unreviewed, reviewTime), /publication blocked/);
});

test("claims require current, complete, non-contradictory provider evidence", () => {
  assert.equal(evaluateWatchRecord(fixture(), now).publishable, true);
  const cases = [
    (r) => { r.reviewer = null; },
    (r) => { r.rightsReviewed = false; },
    (r) => { r.platforms[0].territories = ["unknown"]; },
    (r) => { r.platforms[0].episodes = null; },
    (r) => { r.platforms[0].subtitles.status = "unknown"; },
    (r) => { r.platforms[0].state = "conflict"; },
    (r) => { r.platforms[0].checkedAt = "2026-09-10T08:00:00Z"; },
    (r) => { r.platforms[0].sourceUrl = "https://unrelated.test/article"; },
    (r) => { r.checkedAt = "2026-09-10T08:00:00Z"; },
    (r) => { r.regionGuidance[1].status = "verified"; },
    (r) => { r.regionGuidance[2].sourceUrl = "https://unrelated.test/listing"; },
  ];
  for (const change of cases) {
    const record = fixture();
    change(record);
    assert.equal(evaluateWatchRecord(record, now).publishable, false);
    assert.throws(() => renderWatchPage(record, now), /publication blocked/);
  }
  const updated = fixture();
  updated.platforms[0].episodes.through = 25;
  updated.platforms[0].checkedAt = "2026-09-29T09:00:00Z";
  updated.checkedAt = "2026-09-29T09:00:00Z";
  assert.equal(evaluateWatchRecord(updated, new Date("2026-09-29T12:00:00Z")).publishable, true);
  assert.match(renderWatchPage(updated, new Date("2026-09-29T12:00:00Z")), /Episodes at check:<\/strong> 1–25/);
});

test("unknown or conflicting schedules do not grant finale publication permission", () => {
  for (const state of ["unknown", "conflict"]) {
    const record = fixture();
    record.schedule.state = state;
    const advisory = releaseAdvisory(record, now);
    assert.equal(advisory.broadlyReleased, false);
    assert.equal(advisory.evergreenSafe, false);
    assert.match(renderWatchPage(record, now), state === "unknown" ? /times are unknown/ : /times are conflicting/);
  }
  const record = fixture();
  record.schedule = { state: "verified", timeZone: "Asia/Shanghai", checkedAt: "2026-09-28T08:00:00Z",
    sourceUrl: "https://wetv.vip/schedule", standardFinaleAt: "2026-10-02T12:00:00Z",
    windows: [{ audience: "Early", finaleAt: "2026-09-28T00:00:00Z" },
      { audience: "English regional", finaleAt: "2026-10-05T00:00:00Z" }] };
  assert.deepEqual(releaseAdvisory(record, now).behind, ["English regional"]);
  assert.equal(releaseAdvisory(record, new Date("2026-10-06T00:00:00Z")).evergreenSafe, false);
});

test("approved document has one safe canonical, source links and a narrow-screen layout", async () => {
  const html = renderWatchPage(fixture(), now);
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.match(html, new RegExp(`href="https://fandom.justlikekatie.com${WATCH_ROUTE}"`));
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(html, /Official source/);
  assert.match(html, /Needs recheck/);
  assert.match(html, /href="https:\/\/www.viki.com\/watch"/);
  for (const tag of ["<title>", 'property="og:title"', 'property="og:description"']) {
    assert.ok(html.includes(tag));
  }
  assert.doesNotMatch(html, /endgame|dies in|final twist/i);
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.addStyleTag({ content: readFileSync("public/c-drama-fandom/styles.css", "utf8") });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator(".watch-option").count(), 2);
  } finally {
    await browser.close();
  }
});

test("refreshed Viki evidence keeps the special separate and retains historical checks", () => {
  const record = loadWatchRecord();
  const pass = record.platforms.find((item) => item.name === "Viki · Viki Pass episodes");
  const special = record.platforms.find((item) => item.name === "Viki · Special Episode (listed as 48)");
  assert.deepEqual(pass.episodes, { from: 7, through: 47 });
  assert.deepEqual(special.episodes, { from: 48, through: 48 });
  assert.match(special.accessTier, /special, not a regular story episode/);
  assert.match(special.evidence, /Actual playback.*were not checked/);
  assert.ok(record.history.some((entry) => entry.checkedAt === "2026-10-06T19:04:23Z"));
  assert.ok(record.history.some((entry) => entry.checkedAt === record.checkedAt));
  assert.equal(record.schedule.state, "unknown");
  const reviewTime = new Date(record.checkedAt);
  assert.equal(evaluateWatchRecord(record, reviewTime).publishable, true);
  assert.equal(evaluateWatchRecord(record, new Date(reviewTime.getTime() + 7 * 86400000)).publishable, true);
  assert.equal(evaluateWatchRecord(record, new Date(reviewTime.getTime() + 7 * 86400000 + 1)).publishable, false);
  assert.throws(() => renderWatchPage(record, new Date(reviewTime.getTime() + 8 * 86400000)), /publication blocked/);
});

test("published US observations do not imply another country or a finale date", () => {
  const record = loadWatchRecord();
  const reviewTime = new Date(record.checkedAt);
  const html = renderWatchPage(record, reviewTime);
  assert.match(html, /Listing only:/);
  assert.match(html, /We have not verified access for the UK, Australia, individual European countries or mainland China/);
  for (const region of ["United Kingdom", "Australia", "Europe (country by country)", "Mainland China"]) {
    assert.match(html, new RegExp(region.replace(/[()]/g, "\\$&") + " — availability not verified"));
  }
  assert.match(html, /href="https:\/\/v\.qq\.com\/x\/cover\/mzc00200803dr6b\.html"/);
  assert.match(html, /country-specific playback and subtitles have not been verified/);
  assert.match(html, /original-platform, standard, VIP\/express and English-subtitled regional finale times are unknown/);
  assert.equal(releaseAdvisory(record, reviewTime).broadlyReleased, false);
  assert.equal(releaseAdvisory(record, reviewTime).evergreenSafe, false);
  const pass = record.platforms.find((item) => item.name === "Viki · Viki Pass episodes");
  assert.ok(pass?.episodes?.through > 0);
  assert.ok(releaseAdvisory(record, reviewTime, { targetEpisode: pass.episodes.through + 1 }).behind
    .includes(`Viki · Viki Pass episodes (US): through Episode ${pass.episodes.through}`));
  assert.equal(releaseAdvisory(record, reviewTime, { targetEpisode: pass.episodes.through }).behind
    .some((item) => item.startsWith("Viki · Viki Pass episodes")), false);
  assert.equal(evaluateWatchRecord(record, new Date(reviewTime.getTime() + 8 * 86400000)).publishable, false);
  assert.equal(existsSync(WATCH_PAGE), true);
  const stored = readFileSync(WATCH_PAGE, "utf8");
  const snapshotTime = stored.includes('data-watch-state="needs-recheck"')
    ? new Date(Date.parse(record.checkedAt) + 8 * 86400000)
    : reviewTime;
  assert.equal(stored, renderRetainedWatchPage(record, snapshotTime));
});

test("expiry retains the URL and real dates but withholds stale claims even without JavaScript", () => {
  const record = loadWatchRecord();
  const original = JSON.stringify(record);
  const expired = new Date(Date.parse(record.checkedAt) + 8 * 86400000);
  const gate = evaluateWatchRecord(record, expired);
  assert.equal(gate.publishable, false);
  assert.equal(gate.structurallyValid, true);
  assert.equal(gate.needsRecheck, true);
  assert.throws(() => renderWatchPage(record, expired), /publication blocked/);
  const html = renderRetainedWatchPage(record, expired);
  assert.match(html, /data-watch-state="needs-recheck"/);
  assert.match(html, /Needs recheck:/);
  assert.ok(html.includes(record.checkedAt));
  assert.ok(html.includes(`rel="canonical" href="https://fandom.justlikekatie.com${WATCH_ROUTE}"`));
  assert.match(html, /Viki official listing/);
  assert.match(html, /WeTV official listing/);
  assert.match(html, /Tencent Video official listing/);
  assert.doesNotMatch(html, /Viki Pass|free episodes|US listing checked|Episodes at check:<|1–6|7–47|100%|These are verified listing/);
  assert.doesNotMatch(html, /id="watch-current-claims"/);
  assert.equal(JSON.stringify(record), original, "rendering must not renew evidence or signoff");
  assert.equal(releaseAdvisory(record, expired).evergreenSafe, false);
});

test("stale retention never excuses missing signoff, unsafe links or invalid/future dates", () => {
  const expired = new Date(now.getTime() + 8 * 86400000);
  for (const change of [
    r => { r.rightsReviewed = false; },
    r => { r.spoilerReviewed = false; },
    r => { r.checkedAt = "invalid"; },
    r => { r.checkedAt = "2099-01-01T00:00:00Z"; },
    r => { r.platforms[0].sourceUrl = "https://unrelated.test/"; },
    r => { r.platforms[0].checkedAt = "2099-01-01T00:00:00Z"; },
    r => { r.regionGuidance[0].checkedAt = "invalid"; },
    r => { r.platforms[0].state = "conflict"; },
  ]) {
    const record = fixture();
    change(record);
    assert.equal(evaluateWatchRecord(record, expired).structurallyValid, false);
    assert.throws(() => renderRetainedWatchPage(record, expired), /publication blocked/);
  }
});

test("updating only the headline date cannot restore current claims; a complete fresh review can", () => {
  const record = fixture();
  const expired = new Date(now.getTime() + 8 * 86400000);
  record.checkedAt = expired.toISOString();
  assert.equal(evaluateWatchRecord(record, expired).publishable, false);
  assert.match(renderRetainedWatchPage(record, expired), /data-watch-state="needs-recheck"/);
  for (const entry of [...record.platforms, ...record.regionGuidance]) entry.checkedAt = expired.toISOString();
  assert.equal(evaluateWatchRecord(record, expired).publishable, true);
  assert.doesNotMatch(renderRetainedWatchPage(record, expired), /<html[^>]+data-watch-state="needs-recheck"/);
  assert.match(renderRetainedWatchPage(record, expired), /Episodes at check:<\/strong> 1–21/);
});

test("freshly rendered page switches to the safe links when evidence expires between builds", async () => {
  const record = fixture();
  const html = renderWatchPage(record, now);
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    for (const expired of [false, true]) {
      const page = await browser.newPage();
      const time = expired ? now.getTime() + 8 * 86400000 : now.getTime();
      await page.clock.setFixedTime(new Date(time));
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      assert.equal(await page.locator("#watch-current-claims").isVisible(), !expired);
      assert.equal(await page.locator("#watch-stale-links").isVisible(), expired);
      if (expired) {
        assert.match(await page.locator("#watch-freshness").innerText(), /Needs recheck/);
        assert.doesNotMatch(await page.locator('meta[name="description"]').getAttribute("content"), /compared by verified/);
        assert.doesNotMatch(await page.locator(".side-card p").first().innerText(), /dated listing observations/);
      }
      await page.close();
    }
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    const page = await noJs.newPage({ viewport: { width: 375, height: 812 } });
    const staleHtml = renderRetainedWatchPage(record, new Date(now.getTime() + 8 * 86400000));
    const styledHtml = staleHtml.replace("</head>", `<style>${readFileSync("public/c-drama-fandom/styles.css", "utf8")}</style></head>`);
    await page.setContent(styledHtml, { waitUntil: "domcontentloaded" });
    assert.match(await page.locator("#watch-freshness").innerText(), /Needs recheck/);
    assert.equal(await page.locator(".watch-option").count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await noJs.close();
  } finally {
    await browser.close();
  }
});