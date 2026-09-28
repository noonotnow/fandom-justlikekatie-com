import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { PUBLIC_STATIC_ROUTES, staticSitemapXml } from "../shared/public-routes.js";
import { publicStaticNetlifyRedirects } from "./generate-public-pages.js";
import { evaluateWatchRecord, loadWatchRecord, releaseAdvisory, renderWatchPage, WATCH_PAGE, WATCH_ROUTE } from "./where-to-watch.js";

const now = new Date("2026-09-28T13:00:00Z");
const fixture = () => ({
  slug: "against-the-current", title: "Against the Current", originalTitle: "兰香如故",
  reviewer: "Editorial reviewer", rightsReviewed: true, spoilerReviewed: true,
  checkedAt: "2026-09-28T08:00:00Z",
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
  const gate = evaluateWatchRecord(record, now);
  assert.equal(gate.publishable, true, gate.issues.join("; "));
  assert.equal(PUBLIC_STATIC_ROUTES.filter(({ path }) => path === WATCH_ROUTE).length, 1);
  assert.equal(publicStaticNetlifyRedirects().filter(({ from }) => from === WATCH_ROUTE.slice(0, -1)).length, 1);
  assert.equal(staticSitemapXml().split(`<loc>https://fandom.justlikekatie.com${WATCH_ROUTE}</loc>`).length - 1, 1);
  for (const path of ["public/c-drama-fandom/index.html", "public/c-drama-fandom/vibing-now/against-the-current-episode-21/index.html"]) {
    assert.match(readFileSync(path, "utf8"), /where-to-watch\/against-the-current/);
  }
  const unreviewed = structuredClone(record);
  unreviewed.rightsReviewed = false;
  assert.equal(evaluateWatchRecord(unreviewed, now).publishable, false);
  assert.throws(() => renderWatchPage(unreviewed, now), /publication blocked/);
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
  assert.match(renderWatchPage(updated, new Date("2026-09-29T12:00:00Z")), /Episodes:<\/strong> 1–25/);
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
  assert.match(html, /overdue for a manual recheck/);
  assert.match(html, /href="https:\/\/www.viki.com\/watch"/);
  for (const tag of ["<title>", 'property="og:title"', 'property="og:description"']) {
    assert.ok(html.includes(tag));
  }
  assert.doesNotMatch(html, /endgame|dies in|final twist/i);
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await page.setContent(html);
    await page.addStyleTag({ content: readFileSync("public/c-drama-fandom/styles.css", "utf8") });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator(".watch-option").count(), 2);
  } finally {
    await browser.close();
  }
});

test("published US observations do not imply another country or a finale date", () => {
  const record = loadWatchRecord();
  const html = renderWatchPage(record, now);
  assert.match(html, /Listing only:/);
  assert.match(html, /US listings are checked separately from other countries/);
  assert.match(html, /country-specific playback and subtitles have not been verified/);
  assert.match(html, /original-platform, standard, VIP\/express and English-subtitled regional finale times are unknown/);
  assert.equal(releaseAdvisory(record, now).broadlyReleased, false);
  assert.equal(releaseAdvisory(record, now).evergreenSafe, false);
  assert.match(releaseAdvisory(record, now, { targetEpisode: 37 }).behind.join("; "), /Viki · Viki Pass episodes \(US\): through Episode 33/);
  assert.equal(existsSync(WATCH_PAGE), true);
  assert.equal(readFileSync(WATCH_PAGE, "utf8"), html);
});