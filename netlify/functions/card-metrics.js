import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { cardEvents } from '../../db/schema.js';
import {
  fillDailySeries,
  parseMetricsQuery,
  shapeHealth,
  toDayString,
  totalsByEvent,
  validateEventPayload,
  windowStart,
} from './lib/card-metrics.js';

// Card engagement tracking and trends.
//
// POST /api/card-metrics
//   Body: { event, cardId, subjectType?, batchKey?, actor?, vibe?, capturedDate? }
//   → Appends one row. Fire-and-forget from the client; never blocks an export.
//
// GET /api/card-metrics?view=trends&event=export&days=30
//   → Daily counts across the window, zero-filled: [{ day, count }]
//
// GET /api/card-metrics?view=top&event=export&days=30&limit=10
//   → Most-acted-on cards in the window: [{ cardId, actor, vibe, count }]
//
// GET /api/card-metrics?view=card&card=<cardId>&days=30
//   → One card's lifetime totals per event, plus its daily series.

function jsonResponse(status, body) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/** Day bucket for the trend series, aliased as `day` in the response rows. */
const dayExpr = sql`date_trunc('day', ${cardEvents.createdAt})::date`;

// `day` is the first item in both day-bucketed SELECTs below, so grouping and
// ordering by output-column ordinal 1 refers to it unambiguously and avoids
// restating (and re-evaluating) the date_trunc expression.
const byDay = sql`1`;

async function handleTrends(options, today) {
  const since = windowStart(options.days, today);
  const filters = [gte(cardEvents.createdAt, since)];
  if (options.event) filters.push(eq(cardEvents.event, options.event));
  if (options.subjectType) filters.push(eq(cardEvents.subjectType, options.subjectType));

  const rows = await db
    .select({ day: dayExpr.as('day'), count: count() })
    .from(cardEvents)
    .where(and(...filters))
    .groupBy(byDay)
    .orderBy(byDay);

  return {
    event: options.event,
    subjectType: options.subjectType,
    days: options.days,
    series: fillDailySeries(rows, options.days, today),
  };
}

async function handleTop(options, today) {
  const since = windowStart(options.days, today);
  const filters = [gte(cardEvents.createdAt, since)];
  if (options.event) filters.push(eq(cardEvents.event, options.event));
  // Default to images: boards are unique per date+actor, so ranking them by
  // card_id would just list recent boards rather than popular cards.
  filters.push(eq(cardEvents.subjectType, options.subjectType || 'image'));

  const rows = await db
    .select({
      cardId: cardEvents.cardId,
      actor: sql`max(${cardEvents.actor})`.as('actor'),
      vibe: sql`max(${cardEvents.vibe})`.as('vibe'),
      count: count(),
    })
    .from(cardEvents)
    .where(and(...filters))
    .groupBy(cardEvents.cardId)
    .orderBy(desc(count()))
    .limit(options.limit);

  return {
    event: options.event,
    subjectType: options.subjectType || 'image',
    days: options.days,
    cards: rows.map((row) => ({
      cardId: row.cardId,
      actor: row.actor ?? null,
      vibe: row.vibe ?? null,
      count: Number(row.count) || 0,
    })),
  };
}

async function handleCard(options, today) {
  const identity = [eq(cardEvents.cardId, options.cardId)];
  if (options.subjectType) identity.push(eq(cardEvents.subjectType, options.subjectType));

  // Lifetime totals, deliberately not windowed — "how often has this card been
  // exported" should not silently mean "in the last 30 days".
  const totalRows = await db
    .select({ event: cardEvents.event, count: count() })
    .from(cardEvents)
    .where(and(...identity))
    .groupBy(cardEvents.event);

  const since = windowStart(options.days, today);
  const seriesFilters = [...identity, gte(cardEvents.createdAt, since)];
  if (options.event) seriesFilters.push(eq(cardEvents.event, options.event));

  const seriesRows = await db
    .select({ day: dayExpr.as('day'), count: count() })
    .from(cardEvents)
    .where(and(...seriesFilters))
    .groupBy(byDay)
    .orderBy(byDay);

  return {
    cardId: options.cardId,
    subjectType: options.subjectType,
    days: options.days,
    totals: totalsByEvent(totalRows),
    series: fillDailySeries(seriesRows, options.days, today),
  };
}

/**
 * Is the pipe alive? Per-event counts across three windows in one pass, using
 * filtered aggregates so a silent event type still returns a row-shaped zero.
 */
async function handleHealth() {
  const rows = await db
    .select({
      event: cardEvents.event,
      allTime: count(),
      last7d: sql`count(*) filter (where ${cardEvents.createdAt} >= now() - interval '7 days')`.as('last7d'),
      last24h: sql`count(*) filter (where ${cardEvents.createdAt} >= now() - interval '24 hours')`.as('last24h'),
      lastSeen: sql`max(${cardEvents.createdAt})`.as('lastSeen'),
    })
    .from(cardEvents)
    .groupBy(cardEvents.event);

  return shapeHealth(rows, new Date().toISOString());
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return jsonResponse(204, null);
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' });
    }

    const parsed = validateEventPayload(body);
    if (!parsed.ok) {
      return jsonResponse(400, { error: parsed.error });
    }

    try {
      await db.insert(cardEvents).values(parsed.value);
      return jsonResponse(202, { ok: true });
    } catch (err) {
      console.error('card-metrics insert failed:', err);
      return jsonResponse(500, { error: 'Could not record event' });
    }
  }

  if (req.method === 'GET') {
    const parsed = parseMetricsQuery(new URL(req.url).searchParams);
    if (!parsed.ok) {
      return jsonResponse(400, { error: parsed.error });
    }

    const options = parsed.value;
    const today = toDayString(new Date());

    try {
      if (options.view === 'health') return jsonResponse(200, await handleHealth());
      if (options.view === 'card') return jsonResponse(200, await handleCard(options, today));
      if (options.view === 'top') return jsonResponse(200, await handleTop(options, today));
      return jsonResponse(200, await handleTrends(options, today));
    } catch (err) {
      console.error('card-metrics read failed:', err);
      return jsonResponse(500, { error: 'Could not read metrics' });
    }
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};
