import { useEffect, useMemo, useState } from 'react';
import {
  addWatchJournalEvidence,
  fetchVeteranModeration,
  fetchVeteranPublicJournalId,
  fetchWatchJournal,
  fileWatchJournalEntry,
  moderateVeteranSubmission,
  publishWatchJournal,
  resolveWatchJournalPrediction,
  type PredictionVerdict,
  type VeteranSubmission,
  type WatchJournal,
  type WatchJournalPrediction,
} from '../../utils/watchJournal';
import styles from './FandomAdmin.module.css';

type Draft = {
  episodeStart: string;
  episodeEnd: string;
  emotionalCondition: string;
  trustedPeople: string;
  distrustedPeople: string;
  relationshipMonitored: string;
  recurringSuspects: string;
  currentTheory: string;
  predictions: string;
};

type ResolutionDraft = {
  resolutionEpisode: string;
  verdict: PredictionVerdict;
  postRevealReaction: string;
};

const DRAFT_KEY = 'fandom-watch-journal-draft:the-untamed';
const VERDICTS: Array<{ value: PredictionVerdict; label: string }> = [
  { value: 'vindicated', label: 'Vindicated' },
  { value: 'technically-correct', label: 'Technically correct' },
  { value: 'catastrophically-wrong', label: 'Catastrophically wrong' },
  { value: 'right-conclusion-deranged-reasoning', label: 'Right conclusion, deranged reasoning' },
  { value: 'drama-committed-a-crime', label: 'The drama committed a crime I could not anticipate' },
];

const EMPTY_DRAFT: Draft = {
  episodeStart: '',
  episodeEnd: '',
  emotionalCondition: '',
  trustedPeople: '',
  distrustedPeople: '',
  relationshipMonitored: '',
  recurringSuspects: '',
  currentTheory: '',
  predictions: '',
};

export const WatchJournalCapture: React.FC = () => {
  const [journal, setJournal] = useState<WatchJournal | null>(null);
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, ResolutionDraft>>({});
  const [evidenceEntryId, setEvidenceEntryId] = useState('');
  const [evidencePredictionId, setEvidencePredictionId] = useState('');
  const [evidenceUnlockEpisode, setEvidenceUnlockEpisode] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [safeThroughEpisode, setSafeThroughEpisode] = useState('');
  const [readerJournal, setReaderJournal] = useState<WatchJournal | null>(null);
  const [moderation, setModeration] = useState<VeteranSubmission[]>([]);
  const [moderationLoading, setModerationLoading] = useState(true);
  const [correctionDrafts, setCorrectionDrafts] = useState<Record<string, string>>({});
  const [publicJournalId, setPublicJournalId] = useState('');
  const [publishThroughEpisode, setPublishThroughEpisode] = useState('');
  const [publishedThroughEpisode, setPublishedThroughEpisode] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchWatchJournal(), fetchVeteranPublicJournalId()])
      .then(([result, nextPublicJournalId]) => {
        if (!cancelled) {
          setJournal(result.journal);
          setPublicJournalId(nextPublicJournalId);
        }
      })
      .catch(error => { if (!cancelled) setNotice(errorMessage(error, 'The private watch journal could not be loaded.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchVeteranModeration()
      .then(result => { if (!cancelled) setModeration(result.submissions); })
      .catch(() => { /* The journal remains usable if the queue is unavailable. */ })
      .finally(() => { if (!cancelled) setModerationLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      if (!hasDraftContent(draft)) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // A blocked storage API must not make the private capture workspace unusable.
    }
  }, [draft]);

  const entriesById = useMemo(
    () => new Map((journal?.entries ?? []).map(entry => [entry.id, entry])),
    [journal],
  );
  const filedThroughEpisode = useMemo(
    () => (journal?.entries ?? []).reduce(
      (latest, entry) => Math.max(latest, entry.watchedThroughEpisode),
      0,
    ),
    [journal],
  );

  function updateDraft(field: keyof Draft, value: string) {
    setDraft(current => ({ ...current, [field]: value }));
  }

  async function submitEntry(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy('entry');
    setNotice('');
    try {
      const next = await fileWatchJournalEntry({
        episodeStart: Number(draft.episodeStart),
        episodeEnd: Number(draft.episodeEnd),
        emotionalCondition: draft.emotionalCondition,
        trustedPeople: lines(draft.trustedPeople),
        distrustedPeople: lines(draft.distrustedPeople),
        relationshipMonitored: draft.relationshipMonitored,
        recurringSuspects: lines(draft.recurringSuspects),
        currentTheory: draft.currentTheory,
        predictions: lines(draft.predictions),
      });
      setJournal(next);
      setDraft(EMPTY_DRAFT);
      setNotice('First-watch entry filed. Its episode boundary and predictions are sealed.');
    } catch (error) {
      setNotice(errorMessage(error, 'That first-watch entry was not filed.'));
    } finally {
      setBusy('');
    }
  }

  async function resolvePrediction(event: React.FormEvent, prediction: WatchJournalPrediction) {
    event.preventDefault();
    const resolution = resolutionDrafts[prediction.id];
    if (!resolution || busy) return;
    setBusy(`prediction:${prediction.id}`);
    setNotice('');
    try {
      const next = await resolveWatchJournalPrediction({
        predictionId: prediction.id,
        resolutionEpisode: Number(resolution.resolutionEpisode),
        verdict: resolution.verdict,
        postRevealReaction: resolution.postRevealReaction,
      });
      setJournal(next);
      setNotice('Prediction verdict recorded. The original filing remains unchanged.');
    } catch (error) {
      setNotice(errorMessage(error, 'That prediction verdict was not saved.'));
    } finally {
      setBusy('');
    }
  }

  async function submitEvidence(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy('evidence');
    setNotice('');
    try {
      const next = await addWatchJournalEvidence({
        ...(evidenceEntryId ? { entryId: evidenceEntryId } : {}),
        ...(evidencePredictionId ? { predictionId: evidencePredictionId } : {}),
        unlockEpisode: Number(evidenceUnlockEpisode),
        interpretation: evidenceText,
      });
      setJournal(next);
      setEvidenceEntryId('');
      setEvidencePredictionId('');
      setEvidenceUnlockEpisode('');
      setEvidenceText('');
      setNotice('Veteran evidence sealed until its unlock episode.');
    } catch (error) {
      setNotice(errorMessage(error, 'That veteran evidence was not sealed.'));
    } finally {
      setBusy('');
    }
  }

  async function loadReaderPreview(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy('reader');
    setNotice('');
    setReaderJournal(null);
    try {
      const result = await fetchWatchJournal('reader', Number(safeThroughEpisode));
      setReaderJournal(result.journal);
    } catch (error) {
      setNotice(errorMessage(error, 'The reader preview stayed locked.'));
    } finally {
      setBusy('');
    }
  }

  async function moderate(submission: VeteranSubmission, decision: 'approve' | 'reject' | 'correct-unlock') {
    if (busy) return;
    const unlockEpisode = correctionDrafts[submission.id];
    if (decision === 'correct-unlock' && !unlockEpisode) return;
    setBusy(`moderation:${submission.id}`);
    setNotice('');
    try {
      await moderateVeteranSubmission({
        submissionId: submission.id,
        decision,
        ...(decision === 'correct-unlock' ? { unlockEpisode: Number(unlockEpisode) } : {}),
      });
      const [nextJournal, nextModeration] = await Promise.all([
        fetchWatchJournal(),
        fetchVeteranModeration(),
      ]);
      setJournal(nextJournal.journal);
      setModeration(nextModeration.submissions);
      setNotice(decision === 'approve' ? 'Veteran interpretation approved and sealed.' : 'Veteran submission updated.');
    } catch (error) {
      setNotice(errorMessage(error, 'That moderation decision was not saved.'));
    } finally {
      setBusy('');
    }
  }

  async function publishJournal(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy('publish');
    setNotice('');
    try {
      const result = await publishWatchJournal({
        approvedThroughEpisode: Number(publishThroughEpisode),
      });
      setJournal(result.journal);
      setPublishedThroughEpisode(result.publishedThroughEpisode);
      setNotice(`Approved records through Episode ${result.publishedThroughEpisode} are now available in the public journal.`);
    } catch (error) {
      setNotice(errorMessage(error, 'The approved journal records were not published.'));
    } finally {
      setBusy('');
    }
  }

  if (loading) return <div className={styles.loading} aria-label="Loading watch journal"><span /><span /></div>;

  return (
    <section className={styles.journal} aria-labelledby="watch-journal-title">
      <header className={styles.journalHeader}>
        <div>
          <p className={styles.eyebrow}>Private first-watch experiment</p>
          <h3 id="watch-journal-title">The Untamed · Field Journal</h3>
          <p>Capture what was knowable at the time. Nothing here supplies plot context, fandom answers, or helpful spoilers.</p>
        </div>
        <div className={styles.journalBoundary}>
          <span>Latest filed boundary</span>
          <div>Katie has watched through Episode <strong>{filedThroughEpisode || '—'}</strong>.</div>
          {draft.episodeEnd && <small>Unfiled draft: through Episode {draft.episodeEnd}</small>}
          {publicJournalId && <a className={styles.journalPublicLink} href={`/vibe-atlas/veteran-journal?journal=${encodeURIComponent(publicJournalId)}`}>Open public veteran form</a>}
        </div>
      </header>
      {notice && <div className={styles.notice} role="status">{notice}</div>}

      <form className={styles.journalForm} onSubmit={submitEntry}>
        <div className={styles.journalSectionHeader}>
          <div><h4>1. File a first-watch entry</h4><p>Write only from your current state of knowledge. The next range must begin with Episode {filedThroughEpisode + 1}; the server stamps and preserves it when filed.</p></div>
          <span className={styles.journalDraftStatus}>{hasDraftContent(draft) ? 'Draft protected locally' : 'No draft saved'}</span>
        </div>
        <div className={styles.journalEpisodeGrid}>
          <label className={styles.journalLabel}><span>Episode start</span><input type="number" min={filedThroughEpisode + 1} max={filedThroughEpisode + 1} required value={draft.episodeStart} onChange={event => updateDraft('episodeStart', event.target.value)} /></label>
          <label className={styles.journalLabel}><span>Episode end</span><input type="number" min="1" max="999" required value={draft.episodeEnd} onChange={event => updateDraft('episodeEnd', event.target.value)} /></label>
        </div>
        <div className={styles.journalFieldGrid}>
          <JournalTextarea label="Current emotional condition" value={draft.emotionalCondition} onChange={value => updateDraft('emotionalCondition', value)} placeholder="e.g. intrigued, under-informed, already attached" />
          <JournalTextarea label="Relationship I’m monitoring" value={draft.relationshipMonitored} onChange={value => updateDraft('relationshipMonitored', value)} placeholder="Who or what dynamic has your attention?" />
          <JournalTextarea label="People I trust" value={draft.trustedPeople} onChange={value => updateDraft('trustedPeople', value)} placeholder="One person or suspicion per line" />
          <JournalTextarea label="People I absolutely do not trust" value={draft.distrustedPeople} onChange={value => updateDraft('distrustedPeople', value)} placeholder="One person or suspicion per line" />
          <JournalTextarea label="Recurring suspects or objects" value={draft.recurringSuspects} onChange={value => updateDraft('recurringSuspects', value)} placeholder="One object, symbol, or suspect per line" />
          <JournalTextarea label="What I think is happening" value={draft.currentTheory} onChange={value => updateDraft('currentTheory', value)} rows={5} placeholder="Your theory, without looking anything up" wide />
          <JournalTextarea label="Predictions submitted for future humiliation" value={draft.predictions} onChange={value => updateDraft('predictions', value)} rows={5} placeholder="One prediction per line" wide />
        </div>
        <button className={styles.primaryButton} type="submit" disabled={busy !== ''}>File first-watch entry</button>
      </form>

      <section className={styles.journalSection} aria-labelledby="filed-entries-title">
        <div className={styles.journalSectionHeader}><div><h4 id="filed-entries-title">Filed entries</h4><p>Point-in-time records. A later entry never rewrites an earlier watch-through boundary.</p></div><span className={styles.journalCount}>{journal?.entries.length ?? 0}</span></div>
        {journal?.entries.length ? journal.entries.map(entry => (
          <details className={styles.journalRecord} key={entry.id}>
            <summary><strong>Episodes {entry.episodeStart}–{entry.episodeEnd}</strong><span>Watched through Episode {entry.watchedThroughEpisode} · {formatDate(entry.recordedAt)}</span></summary>
            <div className={styles.journalRecordBody}>
              <p><strong>Current condition:</strong> {entry.fields.emotionalCondition}</p>
              <p><strong>Relationship monitored:</strong> {entry.fields.relationshipMonitored}</p>
              <p><strong>Trust:</strong> {entry.fields.trustedPeople.join(' · ') || 'Nothing filed'}</p>
              <p><strong>Distrust:</strong> {entry.fields.distrustedPeople.join(' · ') || 'Nothing filed'}</p>
              <p><strong>Suspects or objects:</strong> {entry.fields.recurringSuspects.join(' · ') || 'Nothing filed'}</p>
              <p><strong>What seemed to be happening:</strong> {entry.fields.currentTheory}</p>
            </div>
          </details>
        )) : <p className={styles.emptyState}>No first-watch entries yet. The experiment begins when you file the first one.</p>}
      </section>

      <section className={styles.journalSection} aria-labelledby="prediction-ledger-title">
        <div className={styles.journalSectionHeader}><div><h4 id="prediction-ledger-title">2. Prediction ledger</h4><p>Original predictions cannot be edited. Add the verdict only after the relevant episode reveals the answer.</p></div><span className={styles.journalCount}>{journal?.predictions.length ?? 0}</span></div>
        {journal?.predictions.length ? journal.predictions.map(prediction => {
          const resolution = prediction.resolution;
          const draftResolution = resolutionDrafts[prediction.id] ?? { resolutionEpisode: '', verdict: 'vindicated' as PredictionVerdict, postRevealReaction: '' };
          return (
            <article className={styles.predictionRecord} key={prediction.id}>
              <p className={styles.predictionText}>“{prediction.originalText}”</p>
              <p className={styles.recordMeta}>Filed after Episode {prediction.filedAfterEpisode} · {formatDate(prediction.filedAt)}</p>
              {resolution ? (
                <div className={styles.resolution}><strong>{verdictLabel(resolution.verdict)}</strong><span>Resolved in Episode {resolution.resolutionEpisode}</span><p>{resolution.postRevealReaction}</p></div>
              ) : (
                <form className={styles.resolutionForm} onSubmit={event => void resolvePrediction(event, prediction)}>
                  <label className={styles.journalLabel}><span>Resolution episode</span><input type="number" min={prediction.filedAfterEpisode} max="999" required value={draftResolution.resolutionEpisode} onChange={event => setResolutionDrafts(current => ({ ...current, [prediction.id]: { ...draftResolution, resolutionEpisode: event.target.value } }))} /></label>
                  <label className={styles.journalLabel}><span>Final verdict</span><select value={draftResolution.verdict} onChange={event => setResolutionDrafts(current => ({ ...current, [prediction.id]: { ...draftResolution, verdict: event.target.value as PredictionVerdict } }))}>{VERDICTS.map(verdict => <option key={verdict.value} value={verdict.value}>{verdict.label}</option>)}</select></label>
                  <JournalTextarea label="Post-reveal reaction" value={draftResolution.postRevealReaction} onChange={value => setResolutionDrafts(current => ({ ...current, [prediction.id]: { ...draftResolution, postRevealReaction: value } }))} />
                  <button className={styles.secondaryButton} type="submit" disabled={busy !== ''}>Record verdict</button>
                </form>
              )}
            </article>
          );
        }) : <p className={styles.emptyState}>Predictions filed with an entry will appear here, unchanged.</p>}
      </section>

      <section className={styles.journalSection} aria-labelledby="moderation-title">
        <div className={styles.journalSectionHeader}><div><h4 id="moderation-title">3. Veteran submission review</h4><p>Only submissions whose unlock episode has reached the first-watch boundary appear here. Their text stays in a separate pending archive until approved.</p></div><span className={styles.journalCount}>{moderation.length}</span></div>
        {moderationLoading ? <p className={styles.emptyState}>Loading eligible submissions…</p> : moderation.length ? moderation.map(submission => (
          <article className={styles.submissionRecord} key={submission.id}>
            <div className={styles.submissionMeta}><strong>{submission.status}</strong><span>{submission.relation} · Unlock Episode {submission.unlockEpisode}</span></div>
            <p>{submission.interpretation}</p>
            {submission.status === 'pending' ? (
              <div className={styles.submissionActions}>
                <button className={styles.secondaryButton} type="button" disabled={busy !== ''} onClick={() => void moderate(submission, 'approve')}>Approve</button>
                <button className={styles.secondaryButton} type="button" disabled={busy !== ''} onClick={() => void moderate(submission, 'reject')}>Reject</button>
              </div>
            ) : null}
            <div className={styles.submissionCorrection}>
              <label className={styles.journalLabel}><span>Correct unlock episode only</span><input type="number" min="1" max="999" value={correctionDrafts[submission.id] ?? ''} onChange={event => setCorrectionDrafts(current => ({ ...current, [submission.id]: event.target.value }))} /></label>
              <button className={styles.secondaryButton} type="button" disabled={busy !== '' || !correctionDrafts[submission.id]} onClick={() => void moderate(submission, 'correct-unlock')}>Save unlock correction</button>
            </div>
          </article>
        )) : <p className={styles.emptyState}>No eligible veteran submissions. Future unlocks remain hidden.</p>}
      </section>

      <section className={styles.journalSection} aria-labelledby="evidence-title">
        <div className={styles.journalSectionHeader}><div><h4 id="evidence-title">4. Sealed veteran evidence</h4><p>Keep veteran interpretations separate. They unlock only at their explicit episode boundary.</p></div><span className={styles.journalCount}>{journal?.evidence.length ?? 0}</span></div>
        <form className={styles.evidenceForm} onSubmit={submitEvidence}>
          <label className={styles.journalLabel}><span>Related entry</span><select value={evidenceEntryId} onChange={event => setEvidenceEntryId(event.target.value)}><option value="">No entry relation</option>{journal?.entries.map(entry => <option key={entry.id} value={entry.id}>Episodes {entry.episodeStart}–{entry.episodeEnd}</option>)}</select></label>
          <label className={styles.journalLabel}><span>Related prediction</span><select value={evidencePredictionId} onChange={event => setEvidencePredictionId(event.target.value)}><option value="">No prediction relation</option>{journal?.predictions.map(prediction => <option key={prediction.id} value={prediction.id}>{prediction.originalText.slice(0, 70)}</option>)}</select></label>
          <label className={styles.journalLabel}><span>Unlock after Episode</span><input type="number" min="1" max="999" required value={evidenceUnlockEpisode} onChange={event => setEvidenceUnlockEpisode(event.target.value)} /></label>
          <JournalTextarea label="Veteran interpretation" value={evidenceText} onChange={setEvidenceText} rows={4} placeholder="A spoiler-tagged interpretation to keep behind glass" wide />
          <button className={styles.secondaryButton} type="submit" disabled={busy !== '' || (!evidenceEntryId && !evidencePredictionId)}>Seal veteran evidence</button>
        </form>
        {journal?.evidence.length ? journal.evidence.map(item => (
          <details className={styles.evidenceRecord} key={item.id}>
            <summary><strong>Sealed until Episode {item.unlockEpisode}</strong><span>{item.entryId ? `Entry ${entriesById.get(item.entryId)?.episodeStart}–${entriesById.get(item.entryId)?.episodeEnd}` : 'Prediction evidence'}</span></summary>
            <p>{item.interpretation}</p>
          </details>
        )) : <p className={styles.emptyState}>No veteran evidence is loaded. Nothing is being imported or prepopulated.</p>}
      </section>

      <section className={styles.journalSection} aria-labelledby="reader-preview-title">
        <div className={styles.journalSectionHeader}><div><h4 id="reader-preview-title">5. Reader spoiler preview</h4><p>This calls the server-filtered published reader projection. Missing or malformed safe-through settings fail closed.</p></div></div>
        <form className={styles.previewForm} onSubmit={loadReaderPreview}>
          <label className={styles.journalLabel}><span>Reader is safe through Episode</span><input type="number" min="1" max="999" required value={safeThroughEpisode} onChange={event => setSafeThroughEpisode(event.target.value)} /></label>
          <button className={styles.secondaryButton} type="submit" disabled={busy !== ''}>Preview safe view</button>
        </form>
        {readerJournal && (
          <div className={styles.previewResult} role="status">
            <strong>{readerJournal.entries.length} entries visible · {readerJournal.evidence.length} evidence items unlocked</strong>
            {readerJournal.evidence.map(item => <p key={item.id}>{item.interpretation}</p>)}
          </div>
        )}
      </section>

      <section className={styles.journalSection} aria-labelledby="publish-title">
        <div className={styles.journalSectionHeader}><div><h4 id="publish-title">6. Publish an approved boundary</h4><p>Publishing creates a sanitized public snapshot through one filed boundary. Private account details, drafts, unmoderated veteran submissions, and later entries never enter it.</p></div>{publishedThroughEpisode && <span className={styles.journalCount}>Through Episode {publishedThroughEpisode}</span>}</div>
        <form className={styles.previewForm} onSubmit={publishJournal}>
          <label className={styles.journalLabel}><span>Approved records through Episode</span><input type="number" min="1" max={filedThroughEpisode || 1} required value={publishThroughEpisode} onChange={event => setPublishThroughEpisode(event.target.value)} /></label>
          <button className={styles.secondaryButton} type="submit" disabled={busy !== '' || filedThroughEpisode === 0}>Publish public snapshot</button>
        </form>
      </section>
    </section>
  );
};

function JournalTextarea({ label, value, onChange, placeholder = '', rows = 3, wide = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; rows?: number; wide?: boolean }) {
  return <label className={`${styles.journalLabel} ${wide ? styles.journalFieldWide : ''}`}><span>{label}</span><textarea required={label !== 'People I trust' && label !== 'People I absolutely do not trust' && label !== 'Recurring suspects or objects'} rows={rows} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></label>;
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function loadDraft(): Draft {
  try {
    const stored = localStorage.getItem(DRAFT_KEY);
    if (!stored) return EMPTY_DRAFT;
    const parsed = JSON.parse(stored) as Partial<Draft>;
    return { ...EMPTY_DRAFT, ...Object.fromEntries(Object.keys(EMPTY_DRAFT).map(key => [key, typeof parsed[key as keyof Draft] === 'string' ? parsed[key as keyof Draft] : ''])) } as Draft;
  } catch {
    return EMPTY_DRAFT;
  }
}

function hasDraftContent(draft: Draft): boolean {
  return Object.values(draft).some(value => value.trim());
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'timestamp unavailable' : date.toLocaleString();
}

function verdictLabel(value: PredictionVerdict): string {
  return VERDICTS.find(verdict => verdict.value === value)?.label ?? value;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}