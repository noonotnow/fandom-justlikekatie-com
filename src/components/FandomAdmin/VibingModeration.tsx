import { useEffect, useRef, useState } from 'react';
import styles from './FandomAdmin.module.css';

const topics = [
  { id: 'against-the-current-episode-21', label: 'Episode 21', boundary: 21 },
  { id: 'against-the-current-episodes-22-25', label: 'Episodes 22–25', boundary: 25 },
  { id: 'against-the-current-episodes-26-30', label: 'Episodes 26–30', boundary: 30 },
] as const;
type Entry = {
  id: string;
  text: string;
  status: 'pending' | 'approved' | 'rejected' | 'hidden';
  safeThroughEpisode: number;
  submittedAt: string;
  reports?: string[];
};
type RetentionPreview = { total: number; eligible: { pending: number; rejected: number; hidden: number } };
type Capacity = { total: number; approved: number; limit: number; warningAt: number };
type TopicCount = { discussionId: string; pending: number; reported: number };

export function VibingModeration() {
  const [selectedId, setSelectedId] = useState<string>(topics[0].id);
  const [counts, setCounts] = useState<TopicCount[] | null>(null);
  const [summaryError, setSummaryError] = useState('');
  const requestId = useRef(0);
  async function refreshCounts() {
    const current = ++requestId.current;
    setCounts(null);
    setSummaryError('');
    try {
      const response = await fetch('/api/vibing-discussion?view=moderation-summary', { credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load discussion counts.');
      if (!Array.isArray(result.topics) || result.topics.length !== topics.length ||
        !topics.every(item => result.topics.some((count: TopicCount) => count.discussionId === item.id &&
          Number.isSafeInteger(count.pending) && count.pending >= 0 &&
          Number.isSafeInteger(count.reported) && count.reported >= 0))) {
        throw new Error('Discussion counts were incomplete.');
      }
      if (current === requestId.current) setCounts(result.topics);
    } catch (cause) {
      if (current === requestId.current) setSummaryError(cause instanceof Error ? cause.message : 'Could not load discussion counts.');
    }
  }
  useEffect(() => {
    void refreshCounts();
    return () => { requestId.current++; };
  }, []);
  const topic = topics.find(item => item.id === selectedId) || topics[0];
  return <>
    <label htmlFor="vibing-moderation-topic">Discussion to moderate</label>{' '}
    <select id="vibing-moderation-topic" value={selectedId} onChange={event => setSelectedId(event.target.value)}>
      {topics.map(item => {
        const count = counts?.find(value => value.discussionId === item.id);
        return <option key={item.id} value={item.id}>{item.label}{count ? ` · ${count.pending} pending · ${count.reported} reported` : ''}</option>;
      })}
    </select>
    {!counts && !summaryError && <span role="status"> Loading discussion counts…</span>}
    {summaryError && <p role="alert">Discussion counts unavailable: {summaryError} <button type="button" onClick={() => void refreshCounts()}>Retry counts</button></p>}
    <VibingTopicModeration key={topic.id} topic={topic} onArchiveChange={refreshCounts} />
  </>;
}

function VibingTopicModeration({ topic, onArchiveChange }: { topic: typeof topics[number]; onArchiveChange: () => Promise<void> }) {
  const discussionId = topic.id;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [retention, setRetention] = useState<RetentionPreview | null>(null);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [notice, setNotice] = useState('');

  async function refresh() {
    const response = await fetch(`/api/vibing-discussion?discussionId=${discussionId}&view=moderation`, { credentials: 'same-origin' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load the moderation queue.');
    setEntries(result.entries);
    setCapacity(result.capacity);
  }
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/vibing-discussion?discussionId=${discussionId}&view=moderation`, { credentials: 'same-origin' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load the moderation queue.');
        if (active) {
          setEntries(result.entries);
          setCapacity(result.capacity);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load the moderation queue.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);
  async function decide(entryId: string, decision: 'approve' | 'reject' | 'hide') {
    setBusy(true);
    setError('');
    setRetention(null);
    try {
      const response = await fetch('/api/vibing-discussion', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'moderate', discussionId, entryId, decision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Decision was not saved.');
      void onArchiveChange();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Decision was not saved. Refresh before retrying.');
    } finally {
      setBusy(false);
    }
  }
  async function previewRetention() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/vibing-discussion?discussionId=${discussionId}&view=retention`, { credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not preview cleanup.');
      setRetention(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not preview cleanup.');
    } finally {
      setBusy(false);
    }
  }
  async function prune() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/vibing-discussion', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prune', discussionId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Cleanup was not saved.');
      setRetention(null);
      setNotice(`Removed ${Object.values(result.removed as Record<string, number>).reduce((a, b) => a + b, 0)} expired records. Approved replies and their reports were kept.`);
      void onArchiveChange();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Cleanup was not saved. Refresh before retrying.');
    } finally {
      setBusy(false);
    }
  }
  return <section className={styles.journal} aria-labelledby="vibing-moderation-title">
    <header className={styles.journalHeader}><div>
      <h3 id="vibing-moderation-title">Vibing Now · {topic.label}</h3>
      <p>Review against the through-Episode-{topic.boundary} boundary before approving. No later episodes, previews, novel, or endgame hints. Reports are visible below; hide approved responses when needed.</p>
    </div></header>
    {capacity && <section aria-label="Private discussion capacity">
      <p>Archive capacity: {capacity.total} of {capacity.limit} records; {capacity.approved} approved replies protected from cleanup. {capacity.limit - capacity.total} spaces remain.</p>
      {capacity.approved >= capacity.limit
        ? <p role="alert">Approved replies fill the archive. New submissions are paused until a reviewed storage expansion; cleanup cannot remove visible replies.</p>
        : capacity.total >= capacity.limit
          ? <p role="alert">Archive full. New submissions are paused. Preview cleanup for eligible records; approved replies cannot be removed by cleanup.</p>
          : capacity.approved >= capacity.warningAt
            ? <p role="alert">Approved replies are approaching the {capacity.limit}-record limit. Plan a reviewed storage expansion before submissions stop; cleanup cannot remove visible replies.</p>
            : capacity.total >= capacity.warningAt
              ? <p role="status">Archive is approaching the {capacity.limit}-record limit. Preview cleanup for eligible records; approved replies remain protected.</p>
              : null}
    </section>}
    <section aria-label="Private archive cleanup">
      <p>Archive cleanup is manual: pending and rejected entries after 90 days; hidden entries after 180 days. Approved replies and their reports stay. Review the counts before applying.</p>
      <button type="button" disabled={busy || loading} onClick={() => void previewRetention()}>Preview archive cleanup</button>
      {retention && <div>
        <p>Archive: {retention.total} records. Eligible: {retention.eligible.pending} pending, {retention.eligible.rejected} rejected, {retention.eligible.hidden} hidden.</p>
        <button type="button" disabled={busy || !Object.values(retention.eligible).some(Boolean)} onClick={() => void prune()}>Remove eligible records</button>{' '}
        <button type="button" disabled={busy} onClick={() => setRetention(null)}>Cancel</button>
        <p>Counts are a preview; the server rechecks eligibility when cleanup runs.</p>
      </div>}
      {notice && <p role="status">{notice}</p>}
    </section>
    {error && <p role="alert">{error} <button type="button" onClick={() => { setError(''); void refresh().catch(cause => setError(String(cause))); }}>Retry loading</button></p>}
    {loading ? <p>Loading discussion…</p> : entries.length === 0 ? <p>No submissions yet.</p> :
      entries.slice().reverse().map(entry => <article key={entry.id} className={styles.journalHeader}>
        <div>
          <p>Status: {entry.status} · Reports: {entry.reports?.length || 0} · Submitted {entry.submittedAt}</p>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{entry.text}</p>
           {entry.safeThroughEpisode !== topic.boundary && <p role="alert">Boundary mismatch: do not approve.</p>}
          {entry.status === 'pending' && <>
             <button disabled={busy || entry.safeThroughEpisode !== topic.boundary} onClick={() => void decide(entry.id, 'approve')}>Approve</button>{' '}
            <button disabled={busy} onClick={() => void decide(entry.id, 'reject')}>Reject</button>
          </>}
          {entry.status === 'approved' && <button disabled={busy} onClick={() => void decide(entry.id, 'hide')}>Hide response</button>}
        </div>
      </article>)}
  </section>;
}