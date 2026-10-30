import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { evaluateWatchRecord, loadWatchRecord, releaseAdvisory, renderWatchPage } from "./where-to-watch.js";
import { prepareWatchPage } from "./generate-public-pages.js";

const DAY = 86400000;
const withSchedule = () => {
  const record = loadWatchRecord();
  record.schedule = {
    state: "verified", timeZone: "Asia/Shanghai", checkedAt: record.checkedAt,
    sourceUrl: "https://wetv.vip/official", standardFinaleAt: record.checkedAt,
    windows: [{ audience: "Listed audience", finaleAt: record.checkedAt }],
  };
  return record;
};

test("a real current-date site build retains the old guide without renewing evidence", () => {
  const record = loadWatchRecord();
  const before = JSON.stringify(record);
  const now = new Date(Date.parse(record.checkedAt) + 90 * DAY);
  assert.equal(evaluateWatchRecord(record, now).publishable, false);
  const html = prepareWatchPage(now);
  assert.match(html, /role="status"[^>]*>Dated reference:/);
  assert.match(html, /historical observations, not currently verified availability/);
  assert.match(html, /English subtitles at check/);
  assert.match(html, new RegExp(record.checkedAt));
  assert.equal(releaseAdvisory(record, now).evergreenSafe, false);
  assert.equal(JSON.stringify(loadWatchRecord()), before);
});

test("each required date independently ages a reference while strict release checks stay closed", () => {
  const owners = [r => r, r => r.regionGuidance[2], r => r.platforms[1], r => r.schedule];
  for (const owner of owners) {
    const record = withSchedule();
    const now = new Date(record.checkedAt);
    const old = new Date(now.getTime() - 8 * DAY).toISOString();
    owner(record).checkedAt = old;
    const strict = evaluateWatchRecord(record, now);
    const dated = evaluateWatchRecord(record, now, { allowStale: true });
    assert.equal(strict.publishable, false);
    assert.equal(dated.publishable, true, dated.issues.join("; "));
    assert.equal(dated.expiresAt, new Date(Date.parse(old) + 7 * DAY).toISOString());
    assert.match(renderWatchPage(record, now, { allowStale: true }), /role="status"[^>]*>Dated reference:/);
    assert.equal(releaseAdvisory(record, now).stage, "preview-safe");
    for (const invalid of [null, "not-a-date", new Date(now.getTime() + DAY).toISOString()]) {
      owner(record).checkedAt = invalid;
      assert.equal(evaluateWatchRecord(record, now, { allowStale: true }).publishable, false);
      assert.throws(() => renderWatchPage(record, now, { allowStale: true }), /publication blocked/);
    }
  }
});

test("dated-reference permission never bypasses source, claim, rights or spoiler gates", () => {
  const changes = [
    r => { r.rightsReviewed = false; },
    r => { r.spoilerReviewed = false; },
    r => { r.reviewer = null; },
    r => { r.slug = "another-series"; },
    r => { r.platforms[0].sourceUrl = "https://unrelated.test/source"; },
    r => { r.platforms[0].conflict = "Conflicting evidence"; },
    r => { r.platforms[0].subtitles.status = "unknown"; },
    r => { r.platforms[0].territories = ["unknown"]; },
    r => { r.platforms[0].episodes = null; },
    r => { r.platforms[0].accessTier = "unknown"; },
    r => { r.regionGuidance[1].status = "verified"; },
    r => { r.regionGuidance.pop(); },
    r => { r.schedule.sourceUrl = "https://unrelated.test/schedule"; },
  ];
  for (const change of changes) {
    const record = withSchedule();
    const now = new Date(Date.parse(record.checkedAt) + 90 * DAY);
    change(record);
    assert.equal(evaluateWatchRecord(record, now, { allowStale: true }).publishable, false);
    assert.throws(() => renderWatchPage(record, now, { allowStale: true }), /publication blocked/);
  }
});

test("cached HTML ages from the oldest evidence date, not the overall review date", () => {
  const record = loadWatchRecord();
  const now = new Date(record.checkedAt);
  record.platforms[1].checkedAt = new Date(now.getTime() - 6 * DAY).toISOString();
  const gate = evaluateWatchRecord(record, now);
  const html = renderWatchPage(record, now);
  const note = { dataset: { expiresAt: gate.expiresAt }, textContent: "Initial dated-check notice" };
  const script = html.match(/<script>(const note=document\.querySelector[\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  vm.runInNewContext(script, { document: { querySelector: () => note }, Date: { now: () => Date.parse(gate.expiresAt), parse: Date.parse } });
  assert.equal(note.textContent, "Initial dated-check notice");
  vm.runInNewContext(script, { document: { querySelector: () => note }, Date: { now: () => Date.parse(gate.expiresAt) + 1, parse: Date.parse } });
  assert.match(note.textContent, /^Dated reference:/);
  assert.match(html, /not live availability guarantees/);
  assert.match(html, new RegExp(`data-expires-at="${gate.expiresAt}"`));
});
