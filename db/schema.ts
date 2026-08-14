import { pgTable, serial, text, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Append-only log of engagement events on cards.
 *
 * Append-only rather than a counter column, for two reasons:
 *  - Trends need a timestamp per event. A running total can tell you a card has
 *    40 exports but never that 38 of them were in one week.
 *  - Concurrent increments to a shared counter race (the previous Blobs
 *    implementation lost events to last-write-wins). Inserts don't.
 *
 * Totals are derived with `count(*)`, which is what the indexes below are for.
 */
export const cardEvents = pgTable(
  'card_events',
  {
    id: serial().primaryKey(),

    /**
     * Which kind of thing was acted on. The app has two distinct notions of
     * "card" and they aggregate differently, so they are never mixed in one
     * leaderboard:
     *  - 'image' — a single grid image. Identity is stable across days, so
     *    counts accumulate over the card's lifetime.
     *  - 'board' — the whole 3x3 share card. A board is unique to one
     *    date+actor by construction, so its counts are meaningful grouped by
     *    actor or by day, not per card_id.
     */
    subjectType: text('subject_type').notNull(),

    /** Stable identity within `subject_type`: image id, or `<date>::<actorId>`. */
    cardId: text('card_id').notNull(),

    /** Server-issued batch key for the grid this came from, when known. */
    batchKey: text('batch_key'),

    actor: text('actor'),
    vibe: text('vibe'),

    /** See VALID_EVENTS in netlify/functions/lib/card-metrics.js. */
    event: text('event').notNull(),

    /** Board date (YYYY-MM-DD) the card came from — which grid, not when acted on. */
    capturedDate: text('captured_date'),

    /** When the action happened. Drives every trend query. */
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    // Totals and per-card series for a single card.
    index('card_events_card_idx').on(table.subjectType, table.cardId, table.event),
    // Daily buckets and top-N, both of which filter by event then window by time.
    index('card_events_event_created_at_idx').on(table.event, table.createdAt),
  ],
);
