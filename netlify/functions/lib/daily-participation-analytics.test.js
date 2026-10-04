import test from "node:test";
import assert from "node:assert/strict";
import { PARTICIPATION_BATCH, validateParticipationEvent } from "../../../shared/daily-participation.js";
import { createParticipationCollector, participationReview } from "./daily-participation-analytics.js";
import { createEngagementExportHandler } from "./engagement-export.js";

const now = () => new Date("2026-10-01T12:00:00Z");
const anonymous = { authenticateAdmin: async () => { throw Object.assign(new Error("Not admin"), { status: 401 }); } };
const stage = { event: "daily_participation_stage", batchKey: PARTICIPATION_BATCH, stage: "report_receipt_pending" };
const req = new Request("https://example.test/.netlify/functions/log-engagement", { method: "POST", headers: { "user-agent": "Mozilla/5.0" } });
const reviewUrl = new URL("https://example.test/?from=2026-08-01&to=2026-08-29");

test("validator rejects private fields and accepts only bounded categories and calendar days", () => {
  assert.deepEqual(validateParticipationEvent(stage), stage);
  for (const field of ["imageUrl", "actor", "actualIdentity", "note", "email", "reporterId", "receiptId", "auditId", "reason"]) {
    assert.equal(validateParticipationEvent({ ...stage, [field]: "private" }), null);
  }
  assert.equal(validateParticipationEvent({ ...stage, stage: "wrong_actor" }), null);
  assert.equal(validateParticipationEvent({ ...stage, cohort: "daily_view" }), null);
  const cohort = { event: "daily_participation_cohort_returned", batchKey: PARTICIPATION_BATCH, cohort: "guide", cohortDay: "2026-10-01", returnDay: 7 };
  assert.deepEqual(validateParticipationEvent(cohort), cohort);
  for (const returnDay of [0, 8, 1.5, "1"]) assert.equal(validateParticipationEvent({ ...cohort, returnDay }), null);
  assert.equal(validateParticipationEvent({ ...cohort, cohortDay: "2026-02-30" }), null);
});

test("collector excludes admins and bots, fails closed on authority errors, and stores only safe events", async () => {
  const writes = [];
  const store = { setJSON: async (_key, value) => writes.push(value) };
  const deps = { auth: anonymous, getStore: () => store, now };
  let handler = createParticipationCollector(deps);
  assert.equal((await handler(req, {}, stage)).status, 200);
  assert.deepEqual(writes[0], { schemaVersion: 2, ...stage, timestamp: now().toISOString() });
  assert.equal((await handler(req, {}, { ...stage, receiptId: "private" })).status, 400);
  handler = createParticipationCollector({ ...deps, auth: { authenticateAdmin: async () => ({ accountId: "private-admin" }) } });
  assert.equal((await (await handler(req, {}, stage)).json()).excluded, true);
  handler = createParticipationCollector({ ...deps, auth: { authenticateAdmin: async () => { throw new Error("unavailable"); } } });
  assert.equal((await handler(req, {}, stage)).status, 503);
  const bot = new Request(req.url, { method: "POST", headers: { "user-agent": "HeadlessChrome" } });
  assert.equal((await (await createParticipationCollector(deps)(bot, {}, stage)).json()).excluded, true);
  assert.equal(writes.length, 1);
});

test("collector enforces observation day and optional-storage failure is explicit", async () => {
  const handler = createParticipationCollector({ auth: anonymous, getStore: () => ({ setJSON: async () => {} }), now });
  const start = { event: "daily_participation_cohort_started", batchKey: PARTICIPATION_BATCH, cohort: "guide", cohortDay: "2026-10-01" };
  assert.equal((await handler(req, {}, start)).status, 200);
  assert.equal((await handler(req, {}, { ...start, cohortDay: "2026-09-30" })).status, 400);
  const returned = { ...start, event: "daily_participation_cohort_returned", cohortDay: "2026-09-30", returnDay: 1 };
  assert.equal((await handler(req, {}, returned)).status, 200);
  assert.equal((await handler(req, {}, { ...returned, returnDay: 2 })).status, 400);
  const broken = createParticipationCollector({ auth: anonymous, getStore: () => { throw new Error("offline"); }, now });
  assert.equal((await broken(req, {}, stage)).status, 503);
});

function records(count = 12) {
  return Array.from({ length: count }, () => [
    { event: "daily_participation_cohort_started", batchKey: PARTICIPATION_BATCH, cohort: "guide", cohortDay: "2026-08-28", timestamp: "2026-08-28T12:00:00Z" },
    { event: "daily_participation_cohort_returned", batchKey: PARTICIPATION_BATCH, cohort: "guide", cohortDay: "2026-08-28", returnDay: 7, timestamp: "2026-09-04T12:00:00Z" },
    { ...stage, timestamp: "2026-08-28T12:00:00Z" },
  ]).flat();
}

test("review waits for all seven follow-up days, suppresses small groups, and never reflects private records", () => {
  const seeded = records();
  seeded.push({ ...stage, timestamp: "2026-07-31T12:00:00Z" });
  for (const item of seeded) Object.assign(item, { note: "private", storageKey: "secret", actor: "private identity" });
  const waiting = participationReview(seeded, reviewUrl, new Date("2026-09-04T23:59:59Z"));
  assert.equal(waiting.payload.status, "collecting");
  assert.deepEqual(waiting.payload.cohorts, []);
  const ready = participationReview(seeded, reviewUrl, new Date("2026-09-05T00:00:00Z"));
  assert.equal(ready.payload.status, "ready");
  assert.deepEqual(ready.payload.cohorts.find(row => row.cohort === "guide"), {
    cohort: "guide", suppressed: false, inconsistent: false, enrolled: 12, returnedWithin7Days: 12, returnRate: 1,
  });
  assert.equal(ready.payload.stages.find(row => row.stage === "report_receipt_pending").count, 12);
  assert.ok(!JSON.stringify(ready.payload).includes("secret"));
  assert.ok(!JSON.stringify(ready.payload).includes("private identity"));
  const small = participationReview(records(9), reviewUrl, now());
  assert.equal(small.payload.cohorts.find(row => row.cohort === "guide").returnRate, null);
  assert.equal(small.payload.stages.find(row => row.stage === "report_receipt_pending").count, null);
  assert.equal(participationReview([], new URL("https://example.test/?from=2026-08-01&to=2026-08-30"), now()).status, 400);
  assert.equal(participationReview([], new URL("https://example.test/?from=2026-02-30&to=2026-03-30"), now()).status, 400);
});

test("invalid/out-of-window returns never count and inconsistent totals do not produce a rate", () => {
  const entries = records();
  entries.push(...records().filter(entry => entry.returnDay === 7));
  const review = participationReview(entries, reviewUrl, now()).payload;
  const guide = review.cohorts.find(row => row.cohort === "guide");
  assert.equal(guide.inconsistent, true);
  assert.equal(guide.returnRate, null);
  const invalid = records().filter(entry => entry.returnDay === 7).map(entry => ({ ...entry, returnDay: 6 }));
  assert.equal(participationReview(invalid, reviewUrl, now()).payload.cohorts.find(row => row.cohort === "guide").returnedWithin7Days, null);
});

test("existing export endpoint returns only private aggregates and requires admin authorization", async () => {
  const entries = records();
  const store = {
    list: () => (async function* () {
      yield { blobs: entries.slice(0, 12).map((_, i) => ({ key: String(i) })) };
      yield { blobs: entries.slice(12).map((_, i) => ({ key: String(i + 12) })) };
    })(),
    get: async key => entries[Number(key)],
  };
  const request = new Request("https://example.test/?dailyParticipation=1&from=2026-08-01&to=2026-08-29&records=1&download=1");
  const denied = createEngagementExportHandler({ auth: anonymous, getStore: () => store, now });
  assert.equal((await denied(request, {})).status, 401);
  const authorized = createEngagementExportHandler({ auth: { authenticateAdmin: async () => ({}) }, getStore: () => store, now });
  const response = await authorized(request, {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assert.equal(body.records, undefined);
  assert.equal(body.summary, undefined);
  assert.equal(body.cohorts.find(row => row.cohort === "guide").enrolled, 12);
});