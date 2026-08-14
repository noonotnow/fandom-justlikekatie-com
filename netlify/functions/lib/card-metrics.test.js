import test from "node:test";
import assert from "node:assert/strict";
import {
  fillDailySeries,
  parseMetricsQuery,
  shapeHealth,
  toDayString,
  totalsByEvent,
  validateEventPayload,
  windowStart,
  VALID_EVENTS,
} from "./card-metrics.js";

function query(params) {
  return new URLSearchParams(params);
}

test("validateEventPayload accepts a minimal export event", () => {
  const result = validateEventPayload({ event: "export", cardId: "image-1" });
  assert.equal(result.ok, true);
  assert.equal(result.value.event, "export");
  assert.equal(result.value.cardId, "image-1");
  assert.equal(result.value.subjectType, "image", "defaults to image");
  assert.equal(result.value.batchKey, null);
});

test("validateEventPayload keeps the optional provenance fields", () => {
  const result = validateEventPayload({
    event: "legendary",
    cardId: "2026-08-14::actor-7",
    subjectType: "board",
    batchKey: "2026-08-14:actor-7:0:0",
    actor: "Star",
    vibe: "氛围",
    capturedDate: "2026-08-14",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    event: "legendary",
    cardId: "2026-08-14::actor-7",
    subjectType: "board",
    batchKey: "2026-08-14:actor-7:0:0",
    actor: "Star",
    vibe: "氛围",
    capturedDate: "2026-08-14",
  });
});

test("validateEventPayload rejects unknown events", () => {
  const result = validateEventPayload({ event: "nope", cardId: "image-1" });
  assert.equal(result.ok, false);
  assert.match(result.error, /Invalid event/);
});

test("validateEventPayload accepts the events the client was already sending", () => {
  // These two used to 400 silently — see the VALID_EVENTS comment.
  for (const event of ["collection_save", "plan_add"]) {
    assert.equal(validateEventPayload({ event, cardId: "image-1" }).ok, true, event);
  }
});

test("validateEventPayload requires a card identity", () => {
  for (const cardId of [undefined, null, "", "   ", 42]) {
    const result = validateEventPayload({ event: "export", cardId });
    assert.equal(result.ok, false, String(cardId));
    assert.match(result.error, /cardId is required/);
  }
});

test("validateEventPayload rejects an unknown subjectType", () => {
  const result = validateEventPayload({ event: "export", cardId: "x", subjectType: "grid" });
  assert.equal(result.ok, false);
  assert.match(result.error, /Invalid subjectType/);
});

test("validateEventPayload rejects non-object bodies", () => {
  for (const body of [null, undefined, "export", 7]) {
    assert.equal(validateEventPayload(body).ok, false);
  }
});

test("validateEventPayload trims and caps oversized fields", () => {
  const result = validateEventPayload({
    event: "export",
    cardId: "  image-1  ",
    actor: "a".repeat(900),
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.cardId, "image-1");
  assert.equal(result.value.actor.length, 512);
});

test("parseMetricsQuery defaults to a 30-day trends view", () => {
  const result = parseMetricsQuery(query({}));
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    view: "trends",
    event: null,
    subjectType: null,
    cardId: null,
    days: 30,
    limit: 10,
  });
});

test("parseMetricsQuery clamps days and limit into range", () => {
  assert.equal(parseMetricsQuery(query({ days: "0" })).value.days, 1);
  assert.equal(parseMetricsQuery(query({ days: "9999" })).value.days, 365);
  assert.equal(parseMetricsQuery(query({ days: "abc" })).value.days, 30);
  assert.equal(parseMetricsQuery(query({ limit: "0" })).value.limit, 1);
  assert.equal(parseMetricsQuery(query({ limit: "5000" })).value.limit, 100);
});

test("parseMetricsQuery rejects unknown views and events", () => {
  assert.match(parseMetricsQuery(query({ view: "everything" })).error, /Invalid view/);
  assert.match(parseMetricsQuery(query({ event: "sneeze" })).error, /Invalid event/);
  assert.match(parseMetricsQuery(query({ subjectType: "grid" })).error, /Invalid subjectType/);
});

test("parseMetricsQuery requires a card id for the card view", () => {
  const missing = parseMetricsQuery(query({ view: "card" }));
  assert.equal(missing.ok, false);
  assert.match(missing.error, /requires a \?card=/);

  const present = parseMetricsQuery(query({ view: "card", card: "image-1" }));
  assert.equal(present.ok, true);
  assert.equal(present.value.cardId, "image-1");
});

test("toDayString normalizes dates and timestamps to a UTC day", () => {
  assert.equal(toDayString("2026-08-14"), "2026-08-14");
  assert.equal(toDayString("2026-08-14T09:31:00.000Z"), "2026-08-14");
  assert.equal(toDayString(new Date("2026-08-14T23:59:59Z")), "2026-08-14");
  assert.equal(toDayString(new Date("nonsense")), null);
  assert.equal(toDayString(undefined), null);
});

test("fillDailySeries zero-fills quiet days and keeps chronological order", () => {
  const series = fillDailySeries(
    [{ day: "2026-08-14", count: 3 }, { day: "2026-08-12", count: 1 }],
    4,
    "2026-08-14",
  );
  assert.deepEqual(series, [
    { day: "2026-08-11", count: 0 },
    { day: "2026-08-12", count: 1 },
    { day: "2026-08-13", count: 0 },
    { day: "2026-08-14", count: 3 },
  ]);
});

test("fillDailySeries handles Date objects and string counts from the driver", () => {
  const series = fillDailySeries(
    [{ day: new Date("2026-08-14T00:00:00Z"), count: "7" }],
    2,
    "2026-08-14",
  );
  assert.deepEqual(series, [
    { day: "2026-08-13", count: 0 },
    { day: "2026-08-14", count: 7 },
  ]);
});

test("fillDailySeries spans month boundaries", () => {
  const series = fillDailySeries([], 3, "2026-09-01");
  assert.deepEqual(series.map((point) => point.day), ["2026-08-30", "2026-08-31", "2026-09-01"]);
});

test("fillDailySeries returns nothing for an unusable end day", () => {
  assert.deepEqual(fillDailySeries([{ day: "2026-08-14", count: 1 }], 3, "not-a-date"), []);
});

test("totalsByEvent reports every known event, including zeros", () => {
  const totals = totalsByEvent([{ event: "export", count: 4 }, { event: "legendary", count: "2" }]);
  assert.equal(totals.export, 4);
  assert.equal(totals.legendary, 2);
  assert.equal(totals.misprint, 0);
  assert.deepEqual(Object.keys(totals).sort(), [...VALID_EVENTS].sort());
});

test("totalsByEvent ignores rows for unrecognized events", () => {
  const totals = totalsByEvent([{ event: "telepathy", count: 9 }]);
  assert.equal(totals.telepathy, undefined);
  assert.equal(totals.export, 0);
});

test("windowStart is inclusive of the end day", () => {
  assert.equal(windowStart(1, "2026-08-14").toISOString(), "2026-08-14T00:00:00.000Z");
  assert.equal(windowStart(30, "2026-08-14").toISOString(), "2026-07-16T00:00:00.000Z");
});

test("windowStart and fillDailySeries agree on window length", () => {
  const days = 14;
  const series = fillDailySeries([], days, "2026-08-14");
  assert.equal(series.length, days);
  assert.equal(series[0].day, toDayString(windowStart(days, "2026-08-14")));
});

test("parseMetricsQuery accepts the health view", () => {
  const result = parseMetricsQuery(query({ view: "health" }));
  assert.equal(result.ok, true);
  assert.equal(result.value.view, "health");
});

test("shapeHealth reports every event type even when nothing has arrived", () => {
  const health = shapeHealth([], "2026-08-14T12:00:00.000Z");
  assert.equal(health.receiving, false, "no rows means the pipe is unproven");
  assert.equal(health.lastEventAt, null);
  assert.deepEqual(health.totals, { allTime: 0, last7d: 0, last24h: 0 });
  assert.equal(health.byEvent.length, VALID_EVENTS.length);
  assert.deepEqual(health.silentEvents, [...VALID_EVENTS]);
});

test("shapeHealth sums windows and finds the most recent event", () => {
  const health = shapeHealth(
    [
      { event: "export", allTime: 10, last7d: 4, last24h: 1, lastSeen: "2026-08-14T09:00:00.000Z" },
      { event: "legendary", allTime: 3, last7d: 3, last24h: 2, lastSeen: "2026-08-14T11:30:00.000Z" },
    ],
    "2026-08-14T12:00:00.000Z",
  );
  assert.equal(health.receiving, true);
  assert.deepEqual(health.totals, { allTime: 13, last7d: 7, last24h: 3 });
  assert.equal(health.lastEventAt, "2026-08-14T11:30:00.000Z", "latest across all events");
  assert.equal(health.generatedAt, "2026-08-14T12:00:00.000Z");
});

test("shapeHealth lists wired-but-silent events separately from active ones", () => {
  const health = shapeHealth(
    [{ event: "export", allTime: 2, last7d: 2, last24h: 0, lastSeen: "2026-08-13T09:00:00.000Z" }],
    "2026-08-14T12:00:00.000Z",
  );
  assert.ok(!health.silentEvents.includes("export"));
  assert.ok(health.silentEvents.includes("legendary"));
  assert.ok(health.silentEvents.includes("plan_add"));

  const exportRow = health.byEvent.find((entry) => entry.event === "export");
  assert.deepEqual(exportRow, {
    event: "export",
    allTime: 2,
    last7d: 2,
    last24h: 0,
    lastSeen: "2026-08-13T09:00:00.000Z",
  });
});

test("shapeHealth tolerates driver strings and Date objects for counts and timestamps", () => {
  const health = shapeHealth(
    [{ event: "export", allTime: "5", last7d: "2", last24h: "1", lastSeen: new Date("2026-08-14T08:00:00Z") }],
    "2026-08-14T12:00:00.000Z",
  );
  const row = health.byEvent.find((entry) => entry.event === "export");
  assert.equal(row.allTime, 5);
  assert.equal(row.last7d, 2);
  assert.equal(row.lastSeen, "2026-08-14T08:00:00.000Z");
  assert.equal(health.totals.allTime, 5);
});

test("shapeHealth ignores rows for events it does not know about", () => {
  const health = shapeHealth(
    [{ event: "telepathy", allTime: 99, last7d: 99, last24h: 99, lastSeen: "2026-08-14T09:00:00.000Z" }],
    "2026-08-14T12:00:00.000Z",
  );
  assert.equal(health.totals.allTime, 0);
  assert.equal(health.receiving, false);
  assert.ok(!health.byEvent.some((entry) => entry.event === "telepathy"));
});
