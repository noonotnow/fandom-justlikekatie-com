import { useEffect, useMemo, useState } from 'react';
import { CreatorPostAction } from '../CreatorPostAction/CreatorPostAction';
import { dbGetVisibleGrids, type GridRecord } from '../../utils/collectionDB';
import { makeCreatorPostFromGrid } from '../../utils/creatorDraft';
import { getPublicSession } from '../../utils/publicAccount';
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

const dailyDropApi = async (init?: RequestInit) => {
  const response = await fetch('/.netlify/functions/daily-drop-operations', {
    credentials: 'include',
    ...init,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'Daily Drop operations unavailable.');
  return result;
};

export const ReleaseDesk: React.FC = () => {
  const [inventory, setInventory] = useState<AnyRecord | null>(null);
  const [production, setProduction] = useState<AnyRecord | null>(null);
  const [view, setView] = useState<'inventory' | 'production'>('inventory');
  const [editions, setEditions] = useState<AnyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    Promise.all([api(), dailyDropApi()])
      .then(([auditResult, dailyDropResult]) => {
        if (!live) return;
        setInventory(auditResult.releaseInventory ?? null);
        setProduction(auditResult.productionReadiness ?? null);
        setEditions(dailyDropResult.editions ?? []);
      })
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
          : <>
          <WorkstationHandoffDesk />
          {inventory
            ? <>
              <PublicationReceipts
                editions={editions}
                onRecorded={edition => {
                  setEditions(current => current.map(item => (
                    item.editionId === edition.editionId ? edition : item
                  )));
                }}
              />
              <ReleaseInventory inventory={inventory} />
            </>
            : <div className={styles.empty}>No release inventory was returned.</div>}
        </>}
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
              onUpdated={onUpdated}
            />
          ))}
        </div>
        : <div className={styles.empty}>No approved candidates are available for production readiness.</div>}
    </section>
  );
}

function WorkstationHandoffDesk() {
  const [grids, setGrids] = useState<GridRecord[]>([]);
  const [selectedGridId, setSelectedGridId] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    void getPublicSession()
      .then(async user => {
        if (!user) throw new Error('Operator session unavailable. Sign in again to load saved grids.');
        return dbGetVisibleGrids(user.accountId);
      })
      .then(records => {
        if (!live) return;
        const ordered = [...records].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
        setGrids(ordered);
        setSelectedGridId(current => (
          ordered.some(grid => grid.id === current) ? current : ordered[0]?.id ?? ''
        ));
      })
      .catch(error => {
        if (live) setNotice(error instanceof Error ? error.message : 'Saved grids could not be loaded.');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const selectedGrid = grids.find(grid => grid.id === selectedGridId);

  return (
    <section className={styles.workstationDesk} aria-labelledby="workstation-handoff-title">
      <div className={styles.workstationHeader}>
        <div>
          <h4 id="workstation-handoff-title">Workstation handoff</h4>
          <p>Create or update an operator draft from a saved FANDOM grid. This private adapter is not part of the member Collection or Grid Builder.</p>
        </div>
        <strong>Operator only</strong>
      </div>

      {loading
        ? <p className={styles.workstationNotice} aria-live="polite">Loading saved grids…</p>
        : notice
          ? <p className={styles.workstationNotice} role="alert">{notice}</p>
          : grids.length === 0
            ? <p className={styles.workstationNotice}>No saved grids are available on this device. Save or sync one in FANDOM Collection before opening Release Desk.</p>
            : (
              <div className={styles.workstationControls}>
                <div className={styles.gridSelection}>
                  <label htmlFor="workstation-grid">Saved FANDOM grid</label>
                  <select
                    id="workstation-grid"
                    value={selectedGridId}
                    onChange={event => setSelectedGridId(event.target.value)}
                  >
                    {grids.map(grid => (
                      <option key={grid.id} value={grid.id}>
                        {grid.capturedDate} · {grid.actor} · {grid.vibe}
                      </option>
                    ))}
                  </select>
                  {selectedGrid && (
                    <p>
                      {selectedGrid.images.length} source result{selectedGrid.images.length === 1 ? '' : 's'}
                      {' · '}{selectedGrid.rendererVersion}
                    </p>
                  )}
                </div>
                <CreatorPostAction
                  entryPoint="operator_console"
                  disabled={!selectedGrid}
                  onSubmit={(platforms, onProgress) => {
                    if (!selectedGrid) throw new Error('Select a saved grid before continuing.');
                    return makeCreatorPostFromGrid(selectedGrid, platforms, onProgress);
                  }}
                />
              </div>
          )}
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

function PublicationReceipts({
  editions,
  onRecorded,
}: {
  editions: AnyRecord[];
  onRecorded: (edition: AnyRecord) => void;
}) {
  const [publicationDate, setPublicationDate] = useState(editions[0]?.publicationDate ?? '');
  const [channel, setChannel] = useState('rednote');
  const [publicUrl, setPublicUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (
      editions[0]?.publicationDate
      && !editions.some(edition => edition.publicationDate === publicationDate)
    ) {
      setPublicationDate(editions[0].publicationDate);
    }
  }, [editions, publicationDate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice('');
    try {
      const result = await dailyDropApi({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record_publication_receipt',
          publicationDate,
          channel,
          publicUrl,
        }),
      });
      onRecorded(result.edition);
      setPublicUrl('');
      setNotice('Publication receipt attached to the immutable edition.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Publication receipt could not be recorded.');
    } finally {
      setSaving(false);
    }
  };

  if (editions.length === 0) {
    return (
      <section className={styles.receipts}>
        <h4>Publication receipts</h4>
        <p>No immutable Daily Drop editions are available yet.</p>
      </section>
    );
  }

  return (
    <section className={styles.receipts} aria-labelledby="publication-receipts-title">
      <div className={styles.receiptsHeader}>
        <div>
          <h4 id="publication-receipts-title">Publication receipts</h4>
          <p>Attach each native social post to the exact Fandom-owned edition that produced it.</p>
        </div>
        <strong>{editions.length} recent editions</strong>
      </div>

      <div className={styles.editionLedger}>
        {editions.slice(0, 7).map(edition => (
          <article key={edition.editionId}>
            <div>
              <strong>{formatEditionDate(edition.publicationDate)}</strong>
              <span>{edition.actor?.name} · {edition.vibe?.label}</span>
            </div>
            <div className={styles.receiptChannels}>
              {['rednote', 'weibo', 'instagram'].map(receiptChannel => {
                const receipt = edition.publicationReceipts?.find(
                  (item: AnyRecord) => item.channel === receiptChannel,
                );
                return receipt
                  ? <a key={receiptChannel} href={receipt.publicUrl} target="_blank" rel="noreferrer">{receiptChannel} ↗</a>
                  : <span key={receiptChannel}>{receiptChannel}</span>;
              })}
            </div>
          </article>
        ))}
      </div>

      <form className={styles.receiptForm} onSubmit={submit}>
        <label>
          Edition
          <select value={publicationDate} onChange={event => setPublicationDate(event.target.value)}>
            {editions.map(edition => (
              <option key={edition.editionId} value={edition.publicationDate}>
                {edition.publicationDate} · {edition.actor?.shortNameEn}
              </option>
            ))}
          </select>
        </label>
        <label>
          Channel
          <select value={channel} onChange={event => setChannel(event.target.value)}>
            <option value="rednote">RedNote</option>
            <option value="weibo">Weibo</option>
            <option value="instagram">Instagram</option>
          </select>
        </label>
        <label className={styles.receiptUrl}>
          Published post URL
          <input
            type="url"
            value={publicUrl}
            onChange={event => setPublicUrl(event.target.value)}
            placeholder="https://…"
            required
          />
        </label>
        <button type="submit" disabled={saving}>
          {saving ? 'Recording…' : 'Record receipt'}
        </button>
      </form>
      {notice && <p className={styles.receiptNotice} role="status">{notice}</p>}
    </section>
  );
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