import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { PUBLIC_STATIC_ROUTES, staticSitemapXml } from "../shared/public-routes.js";
import { prepareWatchPage, publicStaticNetlifyRedirects } from "./generate-public-pages.js";
import { evaluateWatchRecord, loadWatchRecord, releaseAdvisory, renderWatchPage, WATCH_PAGE, WATCH_ROUTE } from "./where-to-watch.js";

const now = new Date("2026-09-28T13:00:00Z");
const recordNow = new Date("2026-10-01T18:00:00Z");
const fixture = () => ({
  slug: "against-the-current", title: "Against the Current", originalTitle: "兰香如故",
  reviewer: "Editorial reviewer", rightsReviewed: true, spoilerReviewed: true,
  checkedAt: "2026-09-28T08:00:00Z",
  regionGuidance: ["United States", "United Kingdom", "Australia", "Germany", "France", "Spain", "Mainland China"].map((name) => ({
    name, status: name === "United States" ? "verified" : "unverified",
    note: name === "United States" ? "US listing checked." : "Local access not verified.",
    checkOrigin: "US", playbackEvidence: name === "United States" ? "US-scoped episode listing" : null,
    sourceUrl: "https://www.viki.com/official", checkedAt: "2026-09-28T08:00:00Z",
  })),
  platforms: [
    { name: "Provider A", url: "https://www.viki.com/watch", sourceUrl: "https://www.viki.com/official",
      checkedAt: "2026-09-28T08:00:00Z", territories: ["US"], accessTier: "subscription",
      episodes: { from: 1, through: 21 }, subtitles: { language: "English", status: "verified" },
      cadence: null, standardFinaleAt: null, advanceFinaleAt: null, state: "verified", conflict: null },
    { name: "Provider B", url: "https://wetv.vip/watch", sourceUrl: "https://wetv.vip/official",
       checkedAt: "2026-09-28T08:00:00Z", territories: ["US"], accessTier: "free",
      episodes: { from: 1, through: 15 }, subtitles: { language: "English", status: "verified" },
      cadence: null, standardFinaleAt: null, advanceFinaleAt: null, state: "verified", conflict: null },
  ],
  schedule: { state: "unknown", windows: [] },
});

test("source-reviewed page is registered once; unreviewed updates fail publication", () => {
  const record = loadWatchRecord();
  const gate = evaluateWatchRecord(record, recordNow);
  assert.equal(gate.publishable, true, gate.issues.join("; "));
  assert.equal(PUBLIC_STATIC_ROUTES.filter(({ path }) => path === WATCH_ROUTE).length, 1);
  assert.equal(publicStaticNetlifyRedirects().filter(({ from }) => from === WATCH_ROUTE.slice(0, -1)).length, 1);
  assert.equal(staticSitemapXml().split(`<loc>https://fandom.justlikekatie.com${WATCH_ROUTE}</loc>`).length - 1, 1);
  for (const path of ["public/c-drama-fandom/index.html", "public/c-drama-fandom/vibing-now/against-the-current-episode-21/index.html"]) {
    assert.match(readFileSync(path, "utf8"), /where-to-watch\/against-the-current/);
  }
  const unreviewed = structuredClone(record);
  unreviewed.rightsReviewed = false;
  assert.equal(evaluateWatchRecord(unreviewed, recordNow).publishable, false);
  assert.throws(() => renderWatchPage(unreviewed, recordNow), /publication blocked/);
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
     (r) => { r.regionGuidance[1].playbackEvidence = "US listing says English"; },
     (r) => { r.platforms[1].territories = ["GB"]; },
  ];
  for (const [index, change] of cases.entries()) {
    const record = fixture();
    change(record);
    assert.equal(evaluateWatchRecord(record, now).publishable, false);
    if (index === 6 || index === 8) {
      assert.match(renderWatchPage(record, now), /overdue for a manual recheck/);
    } else {
      assert.throws(() => renderWatchPage(record, now), /publication blocked/);
    }
  }
  const updated = fixture();
  updated.platforms[0].episodes.through = 25;
  updated.platforms[0].checkedAt = "2026-09-29T09:00:00Z";
  updated.checkedAt = "2026-09-29T09:00:00Z";
  assert.equal(evaluateWatchRecord(updated, new Date("2026-09-29T12:00:00Z")).publishable, true);
  assert.match(renderWatchPage(updated, new Date("2026-09-29T12:00:00Z")), /Episodes:<\/strong> 1–25/);
});

test("a new country requires its own playback evidence and matching provider claim", () => {
  const record = fixture();
  const uk = record.regionGuidance[1];
  uk.status = "verified";
  uk.playbackEvidence = "Viki episode player and subtitle selector in the UK";
  record.platforms[1].territories = ["GB"];
  assert.equal(evaluateWatchRecord(record, now).publishable, false);
  uk.checkOrigin = "GB";
  assert.equal(evaluateWatchRecord(record, now).publishable, true);
  const html = renderWatchPage(record, now);
  assert.match(html, /United Kingdom — local listing checked/);
  assert.match(html, /Germany — availability not verified/);
  assert.doesNotMatch(html, /Europe — local listing checked/);
});

test("future-dated preparation stays available while expired viewing claims are visibly qualified", () => {
  const future = new Date("2026-10-10T00:00:00Z");
  const record = loadWatchRecord();
  assert.equal(evaluateWatchRecord(record, future).publishable, false);
  const html = prepareWatchPage(future);
  assert.match(html, /This guide is overdue for a manual recheck/);
  assert.match(html, /Treat all access and subtitle claims as unverified/);
  assert.match(html, /href="https:\/\/www.viki.com/);
  const unreviewed = structuredClone(record);
  unreviewed.rightsReviewed = false;
  assert.throws(() => renderWatchPage(unreviewed, future), /publication blocked/);
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
    await page.goto("about:blank");
    await page.setContent(renderWatchPage(loadWatchRecord(), recordNow));
    await page.addStyleTag({ content: readFileSync("public/c-drama-fandom/styles.css", "utf8") });
    assert.equal(await page.locator(".viewer-report").count(), 1);
    assert.match(await page.locator(".viewer-report").textContent(), /Episode 39/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.goto("about:blank");
    await page.evaluate(() => { Date.now = () => Date.parse("2026-10-10T00:00:00Z"); });
    // Render with a fresh editorial date so the browser, not the renderer, must expire it.
    await page.setContent(renderWatchPage(loadWatchRecord(), recordNow));
    for (const text of await page.locator(".observation-freshness").allTextContents()) {
      assert.match(text, /over seven days old/);
    }
    assert.match(await page.locator("#watch-freshness").textContent(), /overdue for a manual recheck/);
  } finally {
    await browser.close();
  }
});

test("published US observations do not imply another country or a finale date", () => {
  const record = loadWatchRecord();
  const html = renderWatchPage(record, recordNow);
  assert.match(html, /Listing only:/);
  assert.match(html, /United Kingdom, Australia, Germany, France, Spain, Mainland China still need local playback checks/);
  for (const region of ["United Kingdom", "Australia", "Germany", "France", "Spain", "Mainland China"]) {
    assert.match(html, new RegExp(region.replace(/[()]/g, "\\$&") + " — availability not verified"));
  }
  assert.match(html, /href="https:\/\/v\.qq\.com\/x\/cover\/mzc00200803dr6b\.html"/);
  assert.match(html, /country-specific playback and subtitles have not been verified/);
  assert.match(html, /listing reviewed .* from US/);
  assert.match(html, /original-platform, standard, VIP\/express and English-subtitled regional finale times are unknown/);
  assert.equal(releaseAdvisory(record, recordNow).broadlyReleased, false);
  assert.equal(releaseAdvisory(record, recordNow).evergreenSafe, false);
  assert.match(releaseAdvisory(record, recordNow, { targetEpisode: 37 }).behind.join("; "), /Viki · Viki Pass episodes \(US\): through Episode 33/);
  assert.equal(existsSync(WATCH_PAGE), true);
  assert.equal(readFileSync(WATCH_PAGE, "utf8"), html);
});

test("US Express Episode 39 is viewer-confirmed without inferring a range or worldwide release", () => {
  const record = loadWatchRecord();
  const html = renderWatchPage(record, recordNow);
  assert.equal(record.playbackReports.length, 1);
  assert.deepEqual(record.playbackReports[0], {
    provider: "WeTV", countryCode: "US", countryName: "United States", sourceType: "viewer-report",
    reportedAt: "2026-10-01T17:43:03Z", url: "https://wetv.vip/en/play/94jt6sxiwsjw5n6",
    episode: 39, accessTier: "Express", englishSubtitles: true,
  });
  assert.match(html, /WeTV · Express · United States/);
  assert.match(html, /Viewer-confirmed playback:<\/strong> Episode 39/);
  assert.match(html, /English subtitles:<\/strong> Yes, used by the viewer/);
  assert.match(html, /not an independent editor player test/);
  assert.doesNotMatch(html, /Episodes:<\/strong> 1–39/);
  assert.equal(record.platforms.find((p) => p.name.startsWith("WeTV")).state, "unknown");
  assert.equal(record.schedule.state, "unknown");
  assert.equal(releaseAdvisory(record, recordNow, { targetEpisode: 39 }).evergreenSafe, false);
  const stale = renderWatchPage(record, new Date("2026-10-10T00:00:00Z"));
  assert.match(stale, /This observation is over seven days old/);
  assert.match(stale, /querySelectorAll\(".observation-freshness"\)/);
  assert.match(stale, /data-checked-at="2026-09-28T12:16:32Z"/);
});

test("Tencent screenshot is a separate attributed calendar, not a WeTV Express promise", () => {
  const record = loadWatchRecord();
  const html = renderWatchPage(record, recordNow);
  assert.match(html, /Tencent calendar: planned releases, not local playback/);
  assert.match(html, /September 30:<\/strong> VIP No update · SVIP No update/);
  assert.match(html, /October 1:<\/strong> VIP 38 · SVIP 39/);
  assert.match(html, /Tencent VIP\/SVIP must not be treated as WeTV Express/);
  assert.match(html, /Original source URL not supplied/);
  for (const change of [
    (r) => { r.playbackReports[0].countryCode = "GB"; },
    (r) => { r.playbackReports[0].reportedAt = "2026-10-02T18:00:00Z"; },
    (r) => { r.playbackReports[0].url = "https://unrelated.test/play"; },
    (r) => { r.playbackReports[0].sourceType = "official"; },
    (r) => { r.playbackReports[0].episode = 0; },
    (r) => { r.playbackReports[0].englishSubtitles = "verified"; },
    (r) => { r.calendarNote.reviewedAt = null; },
    (r) => { r.calendarNote.rows = []; },
  ]) {
    const invalid = structuredClone(record);
    change(invalid);
    assert.equal(evaluateWatchRecord(invalid, recordNow).publishable, false);
    assert.throws(() => renderWatchPage(invalid, recordNow), /publication blocked/);
  }
  const escaped = structuredClone(record);
  escaped.playbackReports[0].accessTier = '<img src=x onerror="alert(1)">';
  escaped.calendarNote.rows[0].dateLabel = "<script>alert(1)</script>";
  assert.doesNotMatch(renderWatchPage(escaped, recordNow), /<img src=x|<script>alert\(1\)/);
  escaped.playbackReports[0].englishSubtitles = false;
  assert.match(renderWatchPage(escaped, recordNow), /Not used by the viewer; availability unknown/);
});