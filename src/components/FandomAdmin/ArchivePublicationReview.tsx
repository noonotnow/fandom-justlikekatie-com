import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './ArchivePublicationReview.module.css';

type ReviewCard = {
  position: number;
  title: string;
  media?: { deliveryUrl?: string; thumbnailUrl?: string };
};

type MediaCheck = { position: number; status: string };

type ArchiveReview = {
  date: string;
  status: string;
  actor?: { name?: string; nameEn?: string };
  vibe?: { labelEn?: string; subtitleEn?: string; supportingCopyEn?: string };
  cards?: ReviewCard[];
  mediaChecks?: MediaCheck[];
  indexable?: boolean;
};

type AuditRecord = { date: string; status: string };

const ENDPOINT = '/.netlify/functions/star-of-day';

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'The archive review could not be loaded.');
  return result as T;
}

function displayDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ArchivePublicationReview() {
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [review, setReview] = useState<ArchiveReview | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [loadingReview, setLoadingReview] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const cursorRef = useRef<string | null>(null);

  const loadAudit = useCallback(async (next = false) => {
    setLoadingAudit(true);
    setError('');
    try {
      const query = new URLSearchParams({ archivePublicationAudit: '1' });
      if (next && cursorRef.current) query.set('cursor', cursorRef.current);
      const result = await readJson<{ records?: AuditRecord[]; nextCursor?: string | null }>(`${ENDPOINT}?${query}`);
      const incoming = Array.isArray(result.records) ? result.records.filter(record => /^\d{4}-\d{2}-\d{2}$/.test(record.date)) : [];
      setRecords(previous => next ? [...previous, ...incoming] : incoming);
      const nextCursor = result.nextCursor || null;
      cursorRef.current = nextCursor;
      setCursor(nextCursor);
      if (incoming[0]) setSelectedDate(current => current || incoming[0].date);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The archive audit could not be loaded.');
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  const loadReview = useCallback(async (date: string) => {
    if (!date) return;
    setLoadingReview(true);
    setNotice('');
    setError('');
    try {
      const query = new URLSearchParams({ archivePublicationReview: '1', date });
      const result = await readJson<{ review?: ArchiveReview }>(`${ENDPOINT}?${query}`);
      if (!result.review) throw new Error('No review record was returned for this date.');
      setReview(result.review);
    } catch (loadError) {
      setReview(null);
      setError(loadError instanceof Error ? loadError.message : 'The selected archive review could not be loaded.');
    } finally {
      setLoadingReview(false);
    }
  }, []);

  useEffect(() => { void loadAudit(); }, [loadAudit]);
  useEffect(() => { void loadReview(selectedDate); }, [loadReview, selectedDate]);

  async function runMediaCheck() {
    if (!selectedDate || checking) return;
    setChecking(true);
    setError('');
    setNotice('');
    try {
      const query = new URLSearchParams({ archivePublicationReview: '1', date: selectedDate, checkMedia: '1' });
      const result = await readJson<{ review?: ArchiveReview; mediaChecks?: MediaCheck[] }>(`${ENDPOINT}?${query}`);
      if (result.review) setReview(result.review);
      else if (result.mediaChecks && review) setReview({ ...review, mediaChecks: result.mediaChecks });
      else await loadReview(selectedDate);
      setNotice('Media check finished. This check does not approve or publish the archive entry.');
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : 'The media check could not be completed.');
    } finally {
      setChecking(false);
    }
  }

  const sortedCards = [...(review?.cards || [])].sort((a, b) => a.position - b.position);

  return (
    <section className={styles.review} id="archive-publication-review-panel" role="tabpanel" aria-labelledby="archive-publication-review-tab archive-publication-review-title">
      <header className={styles.reviewHeader}>
        <div>
          <p className={styles.kicker}>Private archive tools</p>
          <h3 id="archive-publication-review-title">Publication review</h3>
          <p>Inspect the original archive copy and its nine media slots before sending a precise review note.</p>
        </div>
        <aside className={styles.privacyStamp}>
          <span className={styles.stampDot} aria-hidden="true" />
          <div><strong>Private review</strong><span>Viewing and media checks do not publish or approve.</span></div>
        </aside>
      </header>

      <div className={styles.reviewLayout}>
        <aside className={styles.auditPane} aria-label="Archive audit dates">
          <div className={styles.auditHeading}>
            <div><span className={styles.kicker}>Audit trail</span><h4>Archive dates</h4></div>
            <button type="button" className={styles.quietButton} onClick={() => void loadAudit()} disabled={loadingAudit}>Refresh</button>
          </div>
          {loadingAudit && records.length === 0 ? (
            <div className={styles.auditSkeleton} aria-label="Loading audit dates"><span /><span /><span /></div>
          ) : records.length === 0 && !error ? (
            <p className={styles.empty}>No archive dates are available yet.</p>
          ) : (
            <ul className={styles.dateList}>
              {records.map((record, index) => (
                <li key={`${record.date}-${index}`}>
                  <button type="button" className={styles.dateButton} aria-current={selectedDate === record.date ? 'date' : undefined} onClick={() => setSelectedDate(record.date)}>
                    <time dateTime={record.date}>{displayDate(record.date)}</time>
                    <span>{record.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {cursor && <button type="button" className={styles.moreButton} onClick={() => void loadAudit(true)} disabled={loadingAudit}>{loadingAudit ? 'Loading…' : 'Load older dates'}</button>}
        </aside>

        <div className={styles.detailPane}>
          {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => selectedDate ? void loadReview(selectedDate) : void loadAudit()}>Retry</button></div>}
          {notice && <p className={styles.notice} role="status">{notice}</p>}
          {!selectedDate && !loadingAudit ? (
            <div className={styles.emptyDetail}><span className={styles.emptyMark} aria-hidden="true">—</span><h4>Choose an archive date</h4><p>Audit records will appear here when available.</p></div>
          ) : loadingReview ? (
            <div className={styles.detailSkeleton} aria-label="Loading selected review"><span /><span /><span /><span /></div>
          ) : review ? (
            <>
              <div className={styles.detailTopline}>
                <div><span className={styles.kicker}>Selected record</span><h4>{displayDate(review.date)}</h4></div>
                <span className={styles.statusBadge}>{review.status}</span>
              </div>
              <div className={styles.reviewMeta}>
                <div><span>Actor</span><strong>{review.actor?.nameEn || review.actor?.name || 'Not provided'}</strong>{review.actor?.nameEn && review.actor?.name && review.actor.name !== review.actor.nameEn && <small>{review.actor.name}</small>}</div>
                <div><span>Vibe</span><strong>{review.vibe?.labelEn || 'Not provided'}</strong>{review.vibe?.subtitleEn && <small>{review.vibe.subtitleEn}</small>}</div>
                <div><span>Indexable</span><strong>{review.indexable ? 'Yes' : 'No'}</strong></div>
              </div>
              {review.vibe?.supportingCopyEn && <section className={styles.copyPanel} aria-label="Original supporting copy"><span className={styles.kicker}>Original supporting copy</span><p>{review.vibe.supportingCopyEn}</p></section>}
              <section className={styles.mediaSection} aria-labelledby="archive-review-media-title">
                <div className={styles.sectionHeading}>
                   <div><h5 id="archive-review-media-title">Nine media positions</h5><p>Original titles and thumbnails in archive order. The media check downloads each full-size delivery and verifies its saved checksum.</p></div>
                  <button type="button" className={styles.checkButton} onClick={() => void runMediaCheck()} disabled={checking || sortedCards.length !== 9}>{checking ? 'Checking media…' : 'Run media check'}</button>
                </div>
                <ol className={styles.cardGrid}>
                  {Array.from({ length: 9 }, (_, index) => {
                     const position = index;
                    const card = sortedCards.find(item => item.position === position);
                    const check = review.mediaChecks?.find(item => item.position === position);
                    const image = card?.media?.thumbnailUrl || card?.media?.deliveryUrl;
                    return <li key={position} className={styles.mediaCard}>
                      <div className={styles.thumbnail}>
                        {image ? <img src={image} alt="" loading="lazy" /> : <span>No thumbnail</span>}
                         <b>{String(position + 1).padStart(2, '0')}</b>
                      </div>
                      <div className={styles.cardInfo}><strong>{card?.title || 'No card in this position'}</strong><span>{check ? `Media: ${check.status}` : card ? 'Media check not run' : 'Position empty'}</span></div>
                    </li>;
                  })}
                </ol>
              </section>
              <footer className={styles.agentNote}>
                <strong>Review handoff</strong>
                <p>When copy is approved, report the date and exact approved text to Agent. This screen records no approval.</p>
              </footer>
            </>
          ) : !error && selectedDate ? (
            <div className={styles.emptyDetail}><span className={styles.emptyMark} aria-hidden="true">—</span><h4>Review unavailable</h4><p>Retry to fetch the original copy and media for this date.</p><button type="button" className={styles.quietButton} onClick={() => void loadReview(selectedDate)}>Retry review</button></div>
          ) : null}
        </div>
      </div>
    </section>
  );
}