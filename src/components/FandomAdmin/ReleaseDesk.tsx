import { useEffect, useMemo, useState } from 'react';
import styles from './ReleaseDesk.module.css';

type AnyRecord = Record<string, any>;

const EMPTY_RECORDS: AnyRecord[] = [];

const api = async () => {
  const response = await fetch('/.netlify/functions/actor-audits', {
    credentials: 'include',
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'Release Desk unavailable.');
  return result;
};

const transitionProduction = async (actorId: string, vibeKey: string, stage: string, status: string, reason: string) => {
  const response = await fetch('/.netlify/functions/actor-audits', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'production_transition',
      actorId,
      vibeKey,
      stage,
      status,
      reason,
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'Production readiness could not be updated.');
  return result;
};

export const ReleaseDesk: React.FC = () => {
  const [inventory, setInventory] = useState<AnyRecord | null>(null);
  const [production, setProduction] = useState<AnyRecord | null>(null);
  const [view, setView] = useState<'inventory' | 'production'>('inventory');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const loadDesk = () => api().then(result => {
    setInventory(result.releaseInventory ?? null);
    setProduction(result.productionReadiness ?? null);
  });

  useEffect(() => {
    let live = true;
    loadDesk()
      .then(() => undefined)
      .catch(error => {
        if (live) setNotice(error instanceof Error ? error.message : 'Release inventory could not be loaded.');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className={styles.releaseDesk} aria-labelledby="release-desk-title">
      <header className={styles.deskHeader}>
        <div>
          <p className={styles.eyebrow}>Fandom Vibes / private operations</p>
          <h3 id="release-desk-title">Release Desk</h3>
          <p>See what can ship, what needs work, and what ships next without reopening the evidence decision.</p>
        </div>
        <div className={styles.deskBoundary}>
          <span>Operator boundary</span>
          <strong>Readiness, not curation</strong>
          <small>Approved boards and receipts remain owned by Actor Preflight.</small>
        </div>
      </header>

      <nav className={styles.views} aria-label="Release Desk view" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'inventory'} onClick={() => setView('inventory')}>Inventory<small>Current candidates</small></button>
        <button type="button" role="tab" aria-selected={view === 'production'} onClick={() => setView('production')}>Production<small>Readiness blockers</small></button>
      </nav>

      {notice && <div className={styles.error} role="status">{notice}</div>}
      {loading
        ? <div className={styles.empty} aria-label="Loading release inventory">Loading release inventory…</div>
        : view === 'production'
          ? production
            ? <ProductionReadiness production={production} onUpdated={setProduction} />
            : <div className={styles.empty}>No production readiness was returned.</div>
          : inventory
            ? <ReleaseInventory inventory={inventory} />
            : <div className={styles.empty}>No release inventory was returned.</div>}
    </section>
  );
};

function ProductionReadiness({
  production,
  onUpdated,
}: {
  production: AnyRecord;
  onUpdated: (value: AnyRecord) => void;
}) {
  const candidates = (production.candidates ?? EMPTY_RECORDS) as AnyRecord[];
  return (
    <section className={styles.production} aria-labelledby="release-production-title">
      <div className={styles.productionHeader}>
        <div>
          <h4 id="release-production-title">Production readiness</h4>
          <p>Approved editions stay separate from Actor Preflight. Record operational receipts here; PLAN remains the scheduling source of truth.</p>
        </div>
        <div className={styles.productionSummary}>
          <strong>{production.scheduleEligibleCount ?? 0} ready</strong>
          <span>{production.blockedCount ?? 0} blocked · {production.candidateCount ?? 0} approved candidates</span>
        </div>
      </div>
      <p className={styles.privateProductionNote}>Private production view · changing a readiness stage never changes the immutable approval, evidence, or board history.</p>
      {candidates.length
        ? <div className={styles.productionCandidates}>
          {candidates.map(candidate => (
            <ProductionCandidate
              key={`${candidate.actorId}:${candidate.vibeIdx}`}
              candidate={candidate}
              onUpdated={updated => onUpdated({
                ...production,
                candidates: candidates.map(item =>
                  item.actorId === candidate.actorId && item.vibeIdx === candidate.vibeIdx
                    ? updated
                    : item),
                scheduleEligibleCount: candidates.filter(item =>
                  item.actorId === candidate.actorId && item.vibeIdx === candidate.vibeIdx
                    ? updated.scheduleEligible
                    : item.scheduleEligible).length,
                blockedCount: candidates.filter(item =>
                  item.actorId === candidate.actorId && item.vibeIdx === candidate.vibeIdx
                    ? !updated.scheduleEligible
                    : !item.scheduleEligible).length,
              })}
            />
          ))}
        </div>
        : <div className={styles.empty}>No approved candidates are available for production readiness.</div>}
    </section>
  );
}

function ProductionCandidate({ candidate, onUpdated }: { candidate: AnyRecord; onUpdated: (value: AnyRecord) => void }) {
  const [stage, setStage] = useState('asset');
  const [status, setStatus] = useState('complete');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const blockers = (candidate.blockers ?? EMPTY_RECORDS) as AnyRecord[];
  const stages = ['asset', 'enhancement', 'render', 'copy', 'provenanceRights'];

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      const result = await transitionProduction(candidate.actorId, candidate.vibeKey, stage, status, reason);
      onUpdated(result.productionReadiness);
      setReason('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Production readiness could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={styles.productionCandidate} data-state={candidate.state}>
      <header className={styles.productionCandidateHeader}>
        <div><strong>{candidate.actorName}</strong><span>{candidate.vibeLabel}</span></div>
        <b>{candidate.scheduleEligible ? 'Schedule eligible' : `${blockers.length} blockers`}</b>
      </header>
      <p className={styles.productionReceipt}>Approved · {candidate.approval?.verdict || 'unknown verdict'} · audit run {candidate.runId || 'unavailable'}</p>
      <div className={styles.readinessGrid}>
        <ReadinessItem label="Asset" value={candidate.stages?.asset} />
        <ReadinessItem label="Enhancement" value={candidate.stages?.enhancement} />
        <ReadinessItem label="Render" value={candidate.stages?.render} />
        <ReadinessItem label="Copy" value={candidate.stages?.copy} />
        <ReadinessItem label="Provenance / rights" value={candidate.stages?.provenanceRights} />
        <ReadinessItem label="Schedule eligibility" value={{
          status: candidate.scheduleEligible ? 'complete' : 'blocked',
          reason: candidate.scheduleEligible ? 'All production receipts are complete.' : 'Complete every production stage before sending this edition to PLAN.',
        }} />
      </div>
      {!candidate.scheduleEligible && <ul className={styles.blockerList} aria-label={`${candidate.actorName} production blockers`}>
        {blockers.map((blocker: AnyRecord) => <li key={blocker.stage}><strong>{blocker.label}</strong><span>{blocker.reason}</span></li>)}
      </ul>}
      <form className={styles.productionForm} onSubmit={save}>
        <label><span>Update receipt</span><select value={stage} onChange={event => setStage(event.target.value)}>
          {stages.map(item => <option key={item} value={item}>{item === 'provenanceRights' ? 'Provenance / rights' : item[0].toUpperCase() + item.slice(1)}</option>)}
        </select></label>
        <label><span>Status</span><select value={status} onChange={event => setStatus(event.target.value)}>
          <option value="complete">Complete</option><option value="blocked">Blocked</option><option value="pending">Pending</option>
        </select></label>
        <label className={styles.productionReason}><span>Operator note {status === 'blocked' ? '(required)' : '(optional)'}</span><input value={reason} onChange={event => setReason(event.target.value)} placeholder="What changed or what is blocking this stage?" /></label>
        <button type="submit" disabled={busy || (status === 'blocked' && !reason.trim())}>{busy ? 'Saving…' : 'Record receipt'}</button>
      </form>
      {notice && <p className={styles.productionError} role="status">{notice}</p>}
      {candidate.receipt && <small className={styles.receiptMeta}>Latest receipt {candidate.receipt.receiptId} · {candidate.receipt.createdBy}</small>}
    </article>
  );
}

function ReadinessItem({ label, value }: { label: string; value?: AnyRecord }) {
  const complete = value?.status === 'complete';
  return <div className={styles.readinessItem} data-status={value?.status || 'blocked'}><span>{label}</span><strong>{complete ? 'Complete' : value?.status === 'pending' ? 'Pending' : 'Blocked'}</strong>{!complete && <small>{value?.reason}</small>}</div>;
}

function nextShanghaiNoonLabel(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  let target = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  if (Number(parts.hour) >= 12) target += 24 * 60 * 60 * 1000;
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(target));
  return `${dateLabel} · 12:00 PM Asia/Shanghai`;
}

function ReleaseInventory({ inventory }: { inventory: AnyRecord }) {
  const cutoffLabel = useMemo(() => nextShanghaiNoonLabel(), []);
  const actorPacks = (inventory.actorPacks ?? EMPTY_RECORDS) as AnyRecord[];
  const readyCount = Number(inventory.releaseReadyPairingCount ?? 0);
  const recentWindowDays = Number(inventory.recentDailyDropWindowDays ?? 30);
  const unusedCount = Number(inventory.unusedWithinRecentWindowPairingCount ?? 0);
  const depthLabel = readyCount === 0
    ? 'No current release-ready pairing'
    : readyCount === 1
      ? 'One current pairing — concentrated inventory'
      : 'Multiple current pairing options';

  return (
    <section className={styles.inventory} aria-labelledby="release-inventory-title">
      <div className={styles.inventoryHeader}>
        <div>
          <p className={styles.eyebrow}>Tomorrow’s Daily Drop</p>
          <h4 id="release-inventory-title">Inventory</h4>
          <p>{depthLabel}. Counts come from the same current, fail-closed eligibility receipts used by the scheduler.</p>
          <p className={styles.privateInventoryNote}>Private editorial context · recent use does not change scheduler selection or public payloads.</p>
        </div>
        <div className={styles.cutoff}>
          <span>Next operator cutoff</span>
          <strong>{cutoffLabel}</strong>
          <small>Public scheduling behavior is unchanged.</small>
        </div>
      </div>

      <div className={styles.inventoryMetrics}>
        <div><strong>{readyCount}</strong><span>release-ready actor × Vibe pairings</span></div>
        <div data-kind={unusedCount === readyCount ? 'fresh' : 'recent'}><strong>{unusedCount}</strong><span>unused in the last {recentWindowDays} days</span></div>
        <div data-kind="fresh"><strong>{inventory.freshCuratorPairingCount ?? 0}</strong><span>fresh-curator pairings</span></div>
        <div data-kind="rescue"><strong>{inventory.rescueBackupPairingCount ?? 0}</strong><span>pairings with rescue backup</span></div>
        <div data-kind="rescue"><strong>{inventory.rescueBackupBoardCount ?? 0}</strong><span>explicit publishable rescue boards</span></div>
      </div>

      <div className={styles.inventoryPacks}>
        {actorPacks.map(pack => (
          <article className={styles.inventoryPack} data-empty={!pack.releaseReadyPairingCount} key={pack.actorId}>
            <header>
              <div><strong>{pack.actorName}</strong><span>{pack.actorShortNameEn}</span></div>
              <b>{pack.releaseReadyPairingCount ?? 0} ready</b>
            </header>
            <p>{pack.freshCuratorPairingCount ?? 0} fresh curator · {pack.rescueBackupPairingCount ?? 0} rescue-backed pairing{pack.rescueBackupPairingCount === 1 ? '' : 's'} · {pack.rescueBackupBoardCount ?? 0} backup board{pack.rescueBackupBoardCount === 1 ? '' : 's'}</p>
            {pack.pairings?.length
              ? <>
                <div className={pack.recentlyUsed ? styles.actorRepeatWarning : styles.actorLastDrop} role={pack.recentlyUsed ? 'status' : undefined}>
                  <strong>{pack.recentlyUsed ? 'Actor repeat watch' : 'Last actor Daily Drop'}</strong>
                  <span>{pack.lastDailyDropDate ? `Last Daily Drop · ${formatEditionDate(pack.lastDailyDropDate)}${pack.recentlyUsed && pack.recentDailyDropCount > 1 ? ` · ${pack.recentDailyDropCount} recent appearances` : ''}` : 'No recorded Daily Drop'}</span>
                </div>
                <ul>
                  {pack.pairings.map((pair: AnyRecord) => (
                    <li key={pair.vibeKey}>
                      <span>{pair.vibeLabel}</span>
                      <div>
                        {pair.freshCurator && <em data-kind="fresh">Fresh curator</em>}
                        {pair.rescueBackupBoardCount > 0 && <em data-kind="rescue">{pair.rescueBackupBoardCount} rescue backup{pair.rescueBackupBoardCount === 1 ? '' : 's'}</em>}
                        {pair.recentlyUsed
                          ? <em data-kind="recent">Pair repeat · {formatEditionDate(pair.lastDailyDropDate)}{pair.recentDailyDropCount > 1 ? ` · ${pair.recentDailyDropCount} appearances` : ''}</em>
                          : <em data-kind="unused">Unused · last {recentWindowDays} days</em>}
                      </div>
                      {pair.recentlyUsed && <small className={styles.recentUseDates}>Pair appeared {pair.recentDailyDropDates.map(formatEditionDate).join(' · ')}</small>}
                    </li>
                  ))}
                </ul>
              </>
              : <small>No current release-ready pairings in this actor pack.</small>}
          </article>
        ))}
      </div>
    </section>
  );
}

function formatEditionDate(value: unknown) {
  if (!value) return 'Unknown date';
  const parsed = new Date(`${String(value)}T12:00:00+08:00`);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(parsed);
}