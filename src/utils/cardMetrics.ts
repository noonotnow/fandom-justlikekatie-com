/**
 * Client for the card-metrics endpoint.
 *
 * Every call is fire-and-forget: tracking must never delay or fail a user
 * action like an export.
 *
 * Failures are surfaced in dev and stay silent in production UX. This matters
 * more than it looks: the previous implementation used `.catch(() => {})`,
 * which never fired for the bug it was hiding. `fetch` resolves normally on a
 * 4xx, so a rejected payload took the success path, the empty catch was never
 * reached, and two event types went unrecorded indefinitely. Checking
 * `response.ok` is the part that was missing.
 */

/** Loud in dev, silent in production UX — tracking never interrupts the user. */
function reportTrackingFailure(detail: string): void {
  if (import.meta.env.DEV) {
    console.warn(`[cardMetrics] event not recorded: ${detail}`);
  }
}

export type CardEvent =
  | 'export'
  | 'legendary'
  | 'misprint'
  | 'save'
  | 'share'
  | 'click'
  | 'collection_save'
  | 'plan_add';

/** 'image' = one grid image; 'board' = the whole 3x3 share card. */
export type CardSubjectType = 'image' | 'board';

export interface CardEventPayload {
  event: CardEvent;
  /** Stable identity: the image id, or `<date>::<actorId>` for a board. */
  cardId: string;
  subjectType?: CardSubjectType;
  batchKey?: string;
  actor?: string;
  vibe?: string;
  /** Board date (YYYY-MM-DD) this card came from. */
  capturedDate?: string;
}

const ENDPOINT = '/api/card-metrics';

export function recordCardEvent(payload: CardEventPayload): void {
  if (!payload.cardId) {
    reportTrackingFailure(`${payload.event} sent with no cardId`);
    return;
  }

  const body: Record<string, string> = {
    event: payload.event,
    cardId: payload.cardId,
    subjectType: payload.subjectType ?? 'image',
  };
  if (payload.batchKey) body.batchKey = payload.batchKey;
  if (payload.actor) body.actor = payload.actor;
  if (payload.vibe) body.vibe = payload.vibe;
  if (payload.capturedDate) body.capturedDate = payload.capturedDate;

  void fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  })
    .then((response) => {
      // A 4xx resolves rather than rejecting, so this check — not the catch
      // below — is what catches a rejected payload.
      if (!response.ok) {
        reportTrackingFailure(`${payload.event} returned HTTP ${response.status}`);
      }
    })
    .catch((error: unknown) => {
      reportTrackingFailure(
        `${payload.event} request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
}

/**
 * Whether a tier toggle should be recorded.
 *
 * The tier controls pass `null` when you click the already-active tier to clear
 * it. Only setting a tier is an editorial judgment worth counting — recording
 * clears too would make deliberation look like popularity, and would let a
 * single indecisive session inflate a card's Legendary count.
 *
 * Extracted so the rule is unit-testable rather than an inline conditional in a
 * React handler.
 */
export function tierEventFor(tier: 'misprint' | 'legendary' | null): CardEvent | null {
  return tier === 'legendary' || tier === 'misprint' ? tier : null;
}

export interface DailyPoint {
  day: string;
  count: number;
}

export interface TrendsResponse {
  event: CardEvent | null;
  subjectType: CardSubjectType | null;
  days: number;
  series: DailyPoint[];
}

export interface TopCard {
  cardId: string;
  actor: string | null;
  vibe: string | null;
  count: number;
}

export interface TopResponse {
  event: CardEvent | null;
  subjectType: CardSubjectType;
  days: number;
  cards: TopCard[];
}

export interface CardResponse {
  cardId: string;
  subjectType: CardSubjectType | null;
  days: number;
  totals: Record<CardEvent, number>;
  series: DailyPoint[];
}

export interface EventHealth {
  event: CardEvent;
  allTime: number;
  last7d: number;
  last24h: number;
  lastSeen: string | null;
}

export interface HealthResponse {
  generatedAt: string;
  /** False means nothing has ever been recorded — the pipe may be broken. */
  receiving: boolean;
  totals: { allTime: number; last7d: number; last24h: number };
  lastEventAt: string | null;
  byEvent: EventHealth[];
  silentEvents: CardEvent[];
}

async function readMetrics<T>(params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${ENDPOINT}?${query}`);
  if (!response.ok) {
    throw new Error(`card-metrics returned ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Daily counts of one event across a window — the trend line. */
export function fetchTrends(
  event: CardEvent,
  days = 30,
  subjectType?: CardSubjectType,
): Promise<TrendsResponse> {
  return readMetrics<TrendsResponse>({
    view: 'trends',
    event,
    days: String(days),
    ...(subjectType ? { subjectType } : {}),
  });
}

/** Most-acted-on cards in a window. */
export function fetchTopCards(event: CardEvent, days = 30, limit = 10): Promise<TopResponse> {
  return readMetrics<TopResponse>({
    view: 'top',
    event,
    days: String(days),
    limit: String(limit),
  });
}

/** Lifetime totals per event for one card, plus its recent daily series. */
export function fetchCardMetrics(
  cardId: string,
  days = 30,
  subjectType?: CardSubjectType,
): Promise<CardResponse> {
  return readMetrics<CardResponse>({
    view: 'card',
    card: cardId,
    days: String(days),
    ...(subjectType ? { subjectType } : {}),
  });
}

/** Whether events are arriving at all, per event type. Internal diagnostic. */
export function fetchHealth(): Promise<HealthResponse> {
  return readMetrics<HealthResponse>({ view: 'health' });
}
