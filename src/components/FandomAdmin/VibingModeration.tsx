import { useEffect, useState } from 'react';
import styles from './FandomAdmin.module.css';

const discussionId = 'against-the-current-episode-21';
type Entry = {
  id: string;
  text: string;
  status: 'pending' | 'approved' | 'rejected' | 'hidden';
  safeThroughEpisode: number;
  submittedAt: string;
  reports?: string[];
};
type RetentionPreview = { total: number; eligible: { pending: number; rejected: number; hidden: number } };

export function VibingModeration() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [retention, setRetention] = useState<RetentionPreview | null>(null);
  const [notice, setNotice] = useState('');

  async function refresh() {
    const response = await fetch(`/api/vibing-discussion?discussionId=${discussionId}&view=moderation`, { credentials: 'same-origin' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load the moderation queue.');
    setEntries(result.entries);
  }
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/vibing-discussion?discussionId=${discussionId}&view=moderation`, { credentials: 'same-origin' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load the moderation queue.');
        if (active) setEntries(result.entries);
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
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Cleanup was not saved. Refresh before retrying.');
    } finally {
      setBusy(false);
    }
  }
  return <section className={styles.journal} aria-labelledby="vibing-moderation-title">
    <header className={styles.journalHeader}><div>
      <h3 id="vibing-moderation-title">Vibing Now · Episode 21</h3>
      <p>Review against the through-Episode-21 boundary before approving. No later episodes, previews, novel, or endgame hints. Reports are visible below; hide approved responses when needed.</p>
    </div></header>
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
          {entry.safeThroughEpisode !== 21 && <p role="alert">Boundary mismatch: do not approve.</p>}
          {entry.status === 'pending' && <>
            <button disabled={busy || entry.safeThroughEpisode !== 21} onClick={() => void decide(entry.id, 'approve')}>Approve</button>{' '}
            <button disabled={busy} onClick={() => void decide(entry.id, 'reject')}>Reject</button>
          </>}
          {entry.status === 'approved' && <button disabled={busy} onClick={() => void decide(entry.id, 'hide')}>Hide response</button>}
        </div>
      </article>)}
  </section>;
}