// Pure helpers for the card-metrics endpoint: payload validation, query
// parsing, and series shaping. Kept free of any database or Netlify imports so
// they can be unit-tested with `node --test` like the other lib modules.

/**
 * Events we record. `legendary` and `misprint` are editorial tier marks; the
 * rest are engagement actions.
 *
 * `collection_save` and `plan_add` are included because collectionDB.ts and
 * planDB.ts have been sending them all along — the previous endpoint rejected
 * both with a 400 that was swallowed by a `.catch(() => {})`, so those events
 * were silently dropped.
 */
export const VALID_EVENTS = [
  'export',
  'legendary',
  'misprint',
  'save',
  'share',
  'click',
  'collection_save',
  'plan_add',
];

/** See the `subject_type` comment in db/schema.ts. */
export const SUBJECT_TYPES = ['image', 'board'];

export const VALID_VIEWS = ['card', 'trends', 'top', 'health'];

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MAX_FIELD_LENGTH = 512;

function optionalString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_FIELD_LENGTH);
}

/**
 * Validates and normalizes a POST body into a row ready for insert.
 * Returns `{ ok: true, value }` or `{ ok: false, error }`.
 */
export function validateEventPayload(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Body must be a JSON object' };
  }

  const { event, cardId, subjectType } = body;

  if (typeof event !== 'string' || !VALID_EVENTS.includes(event)) {
    return { ok: false, error: `Invalid event. Must be one of: ${VALID_EVENTS.join(', ')}` };
  }

  const normalizedCardId = optionalString(cardId);
  if (!normalizedCardId) {
    return { ok: false, error: 'cardId is required' };
  }

  const normalizedSubject = subjectType === undefined || subjectType === null
    ? 'image'
    : optionalString(subjectType);
  if (!normalizedSubject || !SUBJECT_TYPES.includes(normalizedSubject)) {
    return { ok: false, error: `Invalid subjectType. Must be one of: ${SUBJECT_TYPES.join(', ')}` };
  }

  return {
    ok: true,
    value: {
      event,
      cardId: normalizedCardId,
      subjectType: normalizedSubject,
      batchKey: optionalString(body.batchKey),
      actor: optionalString(body.actor),
      vibe: optionalString(body.vibe),
      capturedDate: optionalString(body.capturedDate),
    },
  };
}

function clampInt(raw, fallback, min, max) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/**
 * Parses a GET query string into normalized read options.
 * Returns `{ ok: true, value }` or `{ ok: false, error }`.
 */
export function parseMetricsQuery(searchParams) {
  const get = (name) => (searchParams && typeof searchParams.get === 'function'
    ? searchParams.get(name)
    : null);

  const rawView = get('view');
  const view = rawView === null || rawView === '' ? 'trends' : rawView;
  if (!VALID_VIEWS.includes(view)) {
    return { ok: false, error: `Invalid view. Must be one of: ${VALID_VIEWS.join(', ')}` };
  }

  const rawEvent = get('event');
  let event = null;
  if (rawEvent !== null && rawEvent !== '') {
    if (!VALID_EVENTS.includes(rawEvent)) {
      return { ok: false, error: `Invalid event. Must be one of: ${VALID_EVENTS.join(', ')}` };
    }
    event = rawEvent;
  }

  const rawSubject = get('subjectType');
  let subjectType = null;
  if (rawSubject !== null && rawSubject !== '') {
    if (!SUBJECT_TYPES.includes(rawSubject)) {
      return { ok: false, error: `Invalid subjectType. Must be one of: ${SUBJECT_TYPES.join(', ')}` };
    }
    subjectType = rawSubject;
  }

  const cardId = optionalString(get('card'));
  if (view === 'card' && !cardId) {
    return { ok: false, error: 'view=card requires a ?card= parameter' };
  }

  return {
    ok: true,
    value: {
      view,
      event,
      subjectType,
      cardId,
      days: clampInt(get('days'), DEFAULT_DAYS, 1, MAX_DAYS),
      limit: clampInt(get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT),
    },
  };
}

/** UTC `YYYY-MM-DD` for a Date or an already-formatted string. */
export function toDayString(value) {
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Expands sparse grouped rows into one entry per day so a chart can render a
 * continuous line. Days with no events are real information (interest dropped
 * to zero), and omitting them would silently compress the x-axis.
 *
 * `endDay` is the last day in the window, inclusive.
 */
export function fillDailySeries(rows, days, endDay) {
  const counts = new Map();
  for (const row of rows || []) {
    const day = toDayString(row.day);
    if (day) counts.set(day, Number(row.count) || 0);
  }

  const end = new Date(`${toDayString(endDay)}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return [];

  const series = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(end);
    cursor.setUTCDate(cursor.getUTCDate() - offset);
    const day = cursor.toISOString().slice(0, 10);
    series.push({ day, count: counts.get(day) ?? 0 });
  }
  return series;
}

/** Collapses `[{event, count}]` rows into `{export: 3, legendary: 1, ...}`. */
export function totalsByEvent(rows) {
  const totals = {};
  for (const event of VALID_EVENTS) totals[event] = 0;
  for (const row of rows || []) {
    if (typeof row.event === 'string' && VALID_EVENTS.includes(row.event)) {
      totals[row.event] = Number(row.count) || 0;
    }
  }
  return totals;
}

/** Start of the `days`-long window ending on `endDay`, as a UTC Date. */
export function windowStart(days, endDay) {
  const end = new Date(`${toDayString(endDay)}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return null;
  end.setUTCDate(end.getUTCDate() - (days - 1));
  return end;
}

/**
 * Shapes the health query into a report that answers one question first: are
 * events arriving at all?
 *
 * Every known event is listed even at zero, because a zero is the finding. An
 * event type that is wired up but silent looks identical to one nobody has
 * triggered yet, and only the full list makes that visible.
 */
export function shapeHealth(rows, nowIso) {
  const byEvent = VALID_EVENTS.map((event) => {
    const row = (rows || []).find((candidate) => candidate.event === event);
    return {
      event,
      allTime: row ? Number(row.allTime) || 0 : 0,
      last7d: row ? Number(row.last7d) || 0 : 0,
      last24h: row ? Number(row.last24h) || 0 : 0,
      lastSeen: row && row.lastSeen ? new Date(row.lastSeen).toISOString() : null,
    };
  });

  const totals = byEvent.reduce(
    (sum, entry) => ({
      allTime: sum.allTime + entry.allTime,
      last7d: sum.last7d + entry.last7d,
      last24h: sum.last24h + entry.last24h,
    }),
    { allTime: 0, last7d: 0, last24h: 0 },
  );

  const lastSeenTimes = byEvent
    .map((entry) => entry.lastSeen)
    .filter(Boolean)
    .sort();

  return {
    generatedAt: nowIso,
    receiving: totals.allTime > 0,
    totals,
    lastEventAt: lastSeenTimes.length ? lastSeenTimes[lastSeenTimes.length - 1] : null,
    byEvent,
    /** Wired up in the client but never yet seen — the list to check first. */
    silentEvents: byEvent.filter((entry) => entry.allTime === 0).map((entry) => entry.event),
  };
}
