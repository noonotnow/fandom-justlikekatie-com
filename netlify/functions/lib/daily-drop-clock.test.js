import test from "node:test";
import assert from "node:assert/strict";
import { getDailyDropDateString, isDailyDropRefreshTime } from "./daily-drop-clock.js";
import { getShanghaiDateString } from "./date-seed.js";

test("the edition changes exactly at Eastern noon across summer, winter, DST, leap days and year boundaries", () => {
  for (const [noon, previous, next] of [
    ["2026-10-06T16:00:00Z", "2026-10-06", "2026-10-07"],
    ["2027-01-15T17:00:00Z", "2027-01-15", "2027-01-16"],
    ["2026-03-07T17:00:00Z", "2026-03-07", "2026-03-08"],
    ["2026-03-08T16:00:00Z", "2026-03-08", "2026-03-09"],
    ["2026-10-31T16:00:00Z", "2026-10-31", "2026-11-01"],
    ["2026-11-01T17:00:00Z", "2026-11-01", "2026-11-02"],
    ["2026-12-31T17:00:00Z", "2026-12-31", "2027-01-01"],
    ["2028-02-28T17:00:00Z", "2028-02-28", "2028-02-29"],
    ["2028-02-29T17:00:00Z", "2028-02-29", "2028-03-01"],
  ]) {
    const clock = new Date(noon);
    assert.equal(getDailyDropDateString(new Date(clock.getTime() - 1)), previous);
    assert.equal(getDailyDropDateString(clock), next);
    assert.equal(isDailyDropRefreshTime(clock), true);
    assert.equal(isDailyDropRefreshTime(new Date(clock.getTime() - 1)), false);
    assert.equal(getDailyDropDateString(new Date(clock.getTime() + 11 * 3_600_000)), next);
  }
});

test("winter daily rollover is independent of the unchanged Shanghai save clock", () => {
  const clock = new Date("2027-01-15T16:59:59Z");
  assert.equal(getDailyDropDateString(clock), "2027-01-15");
  assert.equal(getShanghaiDateString(clock), "2027-01-16");
  assert.equal(isDailyDropRefreshTime(new Date("2027-01-15T16:00:00Z")), false);
  assert.equal(isDailyDropRefreshTime(new Date("2026-10-06T17:00:00Z")), false);
  assert.equal(isDailyDropRefreshTime(new Date("2027-01-15T17:04:00Z")), true);
});
