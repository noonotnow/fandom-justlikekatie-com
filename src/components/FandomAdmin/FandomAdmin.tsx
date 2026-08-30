import { useEffect, useState } from 'react';
import { Plan } from '../Plan/Plan';
import { RACCOON_COURT_RECORD } from '../../data/raccoonCourtRecord';
import {
  addCustomRuling,
  fetchCustomRulings,
  migrateLegacyRulings,
  removeCustomRuling,
} from '../../utils/courtRulings';
import styles from './FandomAdmin.module.css';

export const FandomAdmin: React.FC = () => {
  const [view, setView] = useState<'plan' | 'court'>('plan');
  return (
    <section className={styles.admin}>
      <header className={styles.header}>
        <div><h2>Operator Console</h2><p>Private publishing and policy tools.</p></div>
        <div className={styles.tabs} role="tablist" aria-label="Operator Console view">
          <button type="button" role="tab" aria-selected={view === 'plan'} onClick={() => setView('plan')}>PLAN schedule</button>
          <button type="button" role="tab" aria-selected={view === 'court'} onClick={() => setView('court')}>Court rulings</button>
        </div>
      </header>
      {view === 'plan' ? <Plan /> : <CourtRulingsEditor />}
    </section>
  );
};

function CourtRulingsEditor() {
  const [rulings, setRulings] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const shared = await fetchCustomRulings();
        if (!cancelled) setRulings(await migrateLegacyRulings(shared));
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : 'The shared court record could not be loaded.');
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);
  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true); setNotice('');
    try { setRulings(await addCustomRuling(draft.trim())); setDraft(''); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'The ruling could not be saved.'); }
    finally { setBusy(false); }
  }
  async function remove(index: number) {
    if (busy) return;
    setBusy(true); setNotice('');
    try { setRulings(await removeCustomRuling(index, rulings[index])); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'The ruling could not be removed.'); }
    finally { setBusy(false); }
  }
  if (loading) return <div className={styles.loading} aria-label="Loading court rulings"><span /><span /></div>;
  return <section className={styles.courtEditor}>
    <header className={styles.courtHeader}><div><h3>Court rulings</h3><p>Add lore entries shown in the raccoon judiciary popup.</p></div><span className={styles.courtCount}>{RACCOON_COURT_RECORD.length} built-in · {rulings.length} custom</span></header>
    <form className={styles.courtForm} onSubmit={add}><label className={styles.courtLabel}><span>New ruling</span><textarea className={styles.courtTextarea} value={draft} onChange={event => setDraft(event.target.value)} rows={3} /></label><button type="submit" disabled={busy || !draft.trim()}>{busy ? 'Saving…' : 'Add ruling'}</button></form>
    {notice && <div className={styles.notice} role="status">{notice}</div>}
    {rulings.length > 0 && <RulingList label={`Custom rulings (${rulings.length})`} rulings={rulings} onRemove={remove} busy={busy} />}
    <RulingList label={`Built-in rulings (${RACCOON_COURT_RECORD.length})`} rulings={RACCOON_COURT_RECORD} />
  </section>;
}

function RulingList({ label, rulings, onRemove, busy }: { label: string; rulings: readonly string[]; onRemove?: (index: number) => void; busy?: boolean }) {
  return <section className={styles.courtList} aria-label={label}><h4>{label}</h4><ol>{rulings.map((ruling, index) => <li key={index} className={!onRemove ? styles.courtBuiltIn : undefined}><span>{ruling}</span>{onRemove && <button type="button" disabled={busy} onClick={() => void onRemove(index)}>Remove</button>}</li>)}</ol></section>;
}