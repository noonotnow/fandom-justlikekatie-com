import { useEffect, useMemo, useState } from 'react';
import {
  fetchMyVeteranSubmissions,
  fetchVeteranSubmissionTargets,
  submitVeteranInterpretation,
  type VeteranSubmission,
  type VeteranSubmissionTarget,
} from '../../utils/watchJournal';
import styles from './VeteranSubmissionForm.module.css';

type Targets = {
  entries: VeteranSubmissionTarget[];
  predictions: VeteranSubmissionTarget[];
};

export function VeteranSubmissionForm() {
  const publicJournalId = new URLSearchParams(window.location.search).get('journal') ?? '';
  const [targets, setTargets] = useState<Targets>({ entries: [], predictions: [] });
  const [submissions, setSubmissions] = useState<VeteranSubmission[]>([]);
  const [relation, setRelation] = useState('');
  const [unlockEpisode, setUnlockEpisode] = useState('');
  const [interpretation, setInterpretation] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (!/^[A-Za-z0-9_-]{24}$/.test(publicJournalId)) {
          throw new Error('This veteran-submission link is incomplete. Ask the journal operator for the full link.');
        }
        const targetResult = await fetchVeteranSubmissionTargets(publicJournalId);
        if (cancelled) return;
        setTargets(targetResult.targets);
        const mine = await fetchMyVeteranSubmissions(publicJournalId);
        if (!cancelled) setSubmissions(mine);
      } catch (error) {
        if (!cancelled) setNotice(message(error, 'The sealed submission desk could not be loaded.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [publicJournalId]);

  const selectedMinimum = useMemo(() => {
    const [kind, id] = relation.split(':');
    if (kind === 'entry') return targets.entries.find(item => item.id === id)?.episodeEnd;
    return targets.predictions.find(item => item.id === id)?.filedAfterEpisode;
  }, [relation, targets]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const [kind, id] = relation.split(':');
    if (!id || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const submission = await submitVeteranInterpretation({
        journalId: publicJournalId,
        ...(kind === 'entry' ? { entryId: id } : { predictionId: id }),
        unlockEpisode: Number(unlockEpisode),
        interpretation,
        consent: true,
        website,
      });
      setSubmissions(current => [submission, ...current]);
      setRelation('');
      setUnlockEpisode('');
      setInterpretation('');
      setConsent(false);
      setWebsite('');
      setNotice('Submitted. Your interpretation is sealed until its episode boundary and moderation review.');
    } catch (error) {
      setNotice(message(error, 'Your interpretation was not submitted.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="veteran-submission-title">
        <header className={styles.header}>
          <p className={styles.eyebrow}>The Untamed · delayed conversation</p>
          <h1 id="veteran-submission-title">Leave a sealed veteran interpretation</h1>
          <p>Choose the first-watch journal moment you are responding to and the episode through which your comment contains spoilers. The operator cannot see your words before that episode is filed.</p>
        </header>

        {notice && <div className={styles.notice} role="status">{notice}</div>}
        {loading ? <p className={styles.empty}>Loading eligible journal moments…</p> : (
          <form className={styles.form} onSubmit={submit}>
            <label>
              <span>Related journal moment</span>
              <select required value={relation} onChange={event => {
                setRelation(event.target.value);
                setUnlockEpisode('');
              }}>
                <option value="">Choose an entry or prediction</option>
                <optgroup label="Journal entries">
                  {targets.entries.map(entry => (
                    <option key={entry.id} value={`entry:${entry.id}`}>First-watch entry · Episodes {entry.episodeStart}–{entry.episodeEnd}</option>
                  ))}
                </optgroup>
                <optgroup label="Predictions">
                  {targets.predictions.map((prediction, index) => (
                    <option key={prediction.id} value={`prediction:${prediction.id}`}>Prediction {index + 1} · filed after Episode {prediction.filedAfterEpisode}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label>
              <span>Spoilers through / unlock after Episode</span>
              <input type="number" min={selectedMinimum ?? 1} max="999" required value={unlockEpisode} onChange={event => setUnlockEpisode(event.target.value)} />
              <small>Use the latest episode someone must have watched to read this safely.</small>
            </label>
            <label>
              <span>Your interpretation</span>
              <textarea minLength={1} maxLength={5000} rows={8} required value={interpretation} onChange={event => setInterpretation(event.target.value)} />
              <small>{interpretation.length}/5000 characters</small>
            </label>
            <label className={styles.honeypot} aria-hidden="true">
              <span>Website</span>
              <input tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} />
            </label>
            <label className={styles.consent}>
              <input type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} />
              <span>I understand this contains veteran context and must stay sealed until the episode above.</span>
            </label>
            <button type="submit" disabled={busy || !consent || !relation}>{busy ? 'Sealing…' : 'Submit sealed interpretation'}</button>
          </form>
        )}

        <section className={styles.receipts} aria-labelledby="submission-receipts-title">
          <h2 id="submission-receipts-title">Your submissions from this browser</h2>
          {submissions.length ? submissions.map(submission => (
            <article key={submission.id}>
              <div><strong>{submission.status}</strong><span>Unlock Episode {submission.unlockEpisode}</span></div>
              <p>{submission.interpretation}</p>
            </article>
          )) : <p className={styles.empty}>No submissions from this browser yet.</p>}
        </section>

        <p className={styles.boundary}>Nothing is imported automatically. This form never looks up fandom context, character data, plot summaries, or commentary.</p>
      </section>
    </main>
  );
}

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}