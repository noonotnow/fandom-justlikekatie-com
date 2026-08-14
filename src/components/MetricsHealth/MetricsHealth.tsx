import { useCallback, useEffect, useState } from 'react';
import {
  fetchHealth,
  fetchTopCards,
  type CardEvent,
  type HealthResponse,
  type TopCard,
} from '../../utils/cardMetrics';
import styles from './MetricsHealth.module.css';

/**
 * Internal diagnostic for the card-metrics pipeline.
 *
 * The point of this panel is to answer "are events arriving?" before anyone
 * builds anything prettier on top. The previous analytics failed silently for
 * an unknown length of time; the cheapest defense against a repeat is a boring
 * screen that shows a zero as a zero.
 *
 * It also exercises both read views, so loading it is a live check that the
 * queries work against the real database.
 */

const RANKED_EVENTS: CardEvent[] = ['export', 'legendary', 'misprint'];

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return `${Math.max(seconds, 0)}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export const MetricsHealth: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [top, setTop] = useState<Record<string, TopCard[]>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [healthResult, ...topResults] = await Promise.all([
        fetchHealth(),
        ...RANKED_EVENTS.map((event) => fetchTopCards(event, 7, 5)),
      ]);
      setHealth(healthResult);
      setTop(
        Object.fromEntries(
          topResults.map((result, index) => [RANKED_EVENTS[index], result.cards]),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read metrics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={styles.panel}>
      <div className={styles.headline}>
        <div>
          <h3>Metrics health</h3>
          <p>
            Is the card-metrics pipeline receiving events? Baseline starts at the
            first deploy of <code>/api/card-metrics</code>; earlier analytics are
            not comparable.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          Could not reach the metrics endpoint: {error}
        </p>
      )}

      {health && (
        <>
          <div
            className={health.receiving ? styles.statusOk : styles.statusWarn}
            role="status"
          >
            {health.receiving ? (
              <>
                <strong>Receiving events.</strong> {health.totals.last24h} in the last
                24h · {health.totals.last7d} in the last 7d · {health.totals.allTime}{' '}
                all time. Most recent {relativeTime(health.lastEventAt)}.
              </>
            ) : (
              <>
                <strong>No events recorded yet.</strong> Expected immediately after
                deploy if anyone has exported a card or set a tier. If this stays
                empty, check the browser console in dev — the client logs rejected
                payloads there.
              </>
            )}
          </div>

          <table className={styles.table}>
            <caption>
              Every event type is listed even at zero — a wired-up but silent event
              is indistinguishable from an untriggered one otherwise.
            </caption>
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">24h</th>
                <th scope="col">7d</th>
                <th scope="col">All time</th>
                <th scope="col">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {health.byEvent.map((entry) => (
                <tr key={entry.event} className={entry.allTime === 0 ? styles.silent : undefined}>
                  <th scope="row">{entry.event}</th>
                  <td>{entry.last24h}</td>
                  <td>{entry.last7d}</td>
                  <td>{entry.allTime}</td>
                  <td>{relativeTime(entry.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {health.silentEvents.length > 0 && (
            <p className={styles.note}>
              Never seen: {health.silentEvents.join(', ')}. Note that{' '}
              <code>save</code>, <code>share</code>, and <code>click</code> are
              accepted by the endpoint but not sent by any UI yet, so those are
              expected to stay at zero until something wires them up.
            </p>
          )}

          <div className={styles.rankings}>
            {RANKED_EVENTS.map((event) => (
              <section key={event}>
                <h4>Top {event}, last 7d</h4>
                {(top[event] ?? []).length === 0 ? (
                  <p className={styles.note}>Nothing recorded in this window.</p>
                ) : (
                  <ol>
                    {(top[event] ?? []).map((card) => (
                      <li key={card.cardId}>
                        <span className={styles.count}>{card.count}</span>
                        <span className={styles.cardLabel}>
                          {card.actor || 'Unknown'}
                          {card.vibe ? ` · ${card.vibe}` : ''}
                          <small>{card.cardId}</small>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
