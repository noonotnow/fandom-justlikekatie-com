const easternClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function easternParts(date) {
  return Object.fromEntries(easternClock.formatToParts(date)
    .filter(part => part.type !== "literal")
    .map(part => [part.type, Number(part.value)]));
}

// Retain the existing edition labels: the drop at Eastern noon carries the
// following calendar date. Only the rollover moves in winter; Shanghai-based
// Collection save cutoffs continue to use the separate Shanghai clock.
export function getDailyDropDateString(date = new Date()) {
  const { year, month, day, hour } = easternParts(date);
  return new Date(Date.UTC(year, month - 1, day + (hour >= 12 ? 1 : 0)))
    .toISOString().slice(0, 10);
}

// Netlify cron is UTC. Invoke at both possible UTC noons, then select the
// correct noon hour using the IANA timezone, including daylight-saving
// transitions. Allow delayed scheduled starts within that hour.
export function isDailyDropRefreshTime(date = new Date()) {
  const { hour } = easternParts(date);
  return hour === 12;
}
