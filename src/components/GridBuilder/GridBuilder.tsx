import { useEffect, useMemo, useRef, useState } from 'react';
import { dbGetAllCards, dbGetAllGrids, dbGetVisibleCards, dbGetVisibleGrids, dbRemoveGrid, dbSaveGrid, type GridRecord } from '../../utils/collectionDB';
import { migrateLegacyGridHistory } from '../../utils/collectionHistory';
import { starDataFromCollectionGrid } from '../../utils/collectionHistoryModel';
import { saveShareCard, buildExportPayload, classifyEditionTier } from '../../utils/exportCanvas';
import { gridExportEventFromRecord, logGridExport, uploadExportedCard } from '../../utils/gridExportLog';
import {
  applyLens,
  buildPool,
  gridRecordFromProposal,
  lensOptions,
  proposeGrid,
  rationaleBrief,
  rebuildRationale,
  type BuilderCard,
  type CollectionLens,
  type GridProposal,
} from '../../utils/gridBuilder';
import styles from './GridBuilder.module.css';

interface Props {
  /** Account id of the signed-in user; scopes the pool to that account's visible records. */
  accountId?: string;
  /**
   * When true, load ALL local records regardless of ownerAccountId.
   * Use only in admin contexts that have always had full local access (FandomAdmin).
   * Defaults to false; Collection always scopes to the signed-in account.
   */
  allRecords?: boolean;
  /** When true, "Start Idea Packet" is shown and wired. Omit (or false) to hide it. */
  isAdmin?: boolean;
  /** Required when isAdmin is true; called to create the Idea Packet from the grid. */
  onCreateFromGrid?: (grid: GridRecord) => Promise<unknown>;
  /** Called after a successful packet creation so the parent can navigate away. */
  onPacketCreated?: () => void;
  /** Called after a successful export so the parent can navigate to the Grids tab. */
  onExported?: () => void;
}

/**
 * Collection Grid Builder — the studio. Saved collection → lens →
 * proposed 3×3 → slot swaps → export → Idea Packet with the curation
 * rationale attached as a creative brief for CREATE.
 */
export const GridBuilder: React.FC<Props> = ({ accountId, allRecords = false, isAdmin = false, onCreateFromGrid, onPacketCreated, onExported }) => {
  const [pool, setPool] = useState<BuilderCard[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [lens, setLens] = useState<CollectionLens>({});
  const [proposal, setProposal] = useState<GridProposal | null>(null);
  const [swapSlot, setSwapSlot] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  // Tracks whether the *current* proposal has been explicitly saved to the collection.
  // Resets to false whenever the proposal changes (re-propose, lens toggle, slot swap).
  const [isGridSaved, setIsGridSaved] = useState(false);
  // Stores the id of the saved grid so it can be removed without re-deriving it.
  const [savedGridId, setSavedGridId] = useState<string | null>(null);
  // After a successful export-without-save, prompt the user to save.
  const [showSaveNudge, setShowSaveNudge] = useState(false);
  // When true, a successful save should also trigger the onExported navigation.
  const [pendingNavAfterSave, setPendingNavAfterSave] = useState(false);
  // Tracks the id of the last grid that was saved before a slot swap changed
  // the proposal.  When the user saves after swapping, the stale record is
  // removed first so only the latest version lives in the store.
  const [priorSavedGridId, setPriorSavedGridId] = useState<string | null>(null);
  // Synchronous in-flight lock for startPacket.  React state setters do not
  // update the captured closure value until the next render, so a second call
  // that arrives before React flushes would not see busy==='packet' yet.
  // A ref is set synchronously before the first await, guaranteeing re-entrant
  // calls are blocked regardless of render timing.
  const packetInFlight = useRef(false);
  // Synchronous in-flight lock for exportGrid — same reasoning as packetInFlight.
  // setBusy('export') schedules a React update but does not mutate the captured
  // closure value, so a double-click in the same event-loop tick would pass the
  // `|| busy` state guard and reach saveShareCard twice.  The ref is set before
  // the first await and cleared in finally, giving a reliable synchronous barrier.
  const exportInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setPool(null);
    setLoadError('');
    setLens({});
    setProposal(null);
    (async () => {
      try {
        await migrateLegacyGridHistory();
        const [cards, grids] = await Promise.all([
          allRecords ? dbGetAllCards() : dbGetVisibleCards(accountId),
          allRecords ? dbGetAllGrids() : dbGetVisibleGrids(accountId),
        ]);
        if (!cancelled) setPool(buildPool(cards, grids));
      } catch (caught) {
        if (!cancelled) setLoadError(caught instanceof Error ? caught.message : 'Saved collection could not be loaded.');
      }
    })();
    return () => { cancelled = true; };
  }, [accountId, allRecords]);

  const options = useMemo(() => (pool ? lensOptions(pool) : null), [pool]);
  const lensedCount = useMemo(() => (pool ? applyLens(pool, lens).length : 0), [pool, lens]);

  function toggle(key: keyof CollectionLens, value: string) {
    setLens(current => ({ ...current, [key]: current[key] === value ? undefined : value }));
    setProposal(null);
    setSwapSlot(null);
    setIsGridSaved(false);
    setSavedGridId(null);
    setPriorSavedGridId(null);
    setShowSaveNudge(false);
    setPendingNavAfterSave(false);
  }

  function propose() {
    if (!pool) return;
    const next = proposeGrid(pool, lens);
    setProposal(next);
    setSwapSlot(null);
    setIsGridSaved(false);
    setSavedGridId(null);
    setPriorSavedGridId(null);
    setShowSaveNudge(false);
    setPendingNavAfterSave(false);
    setNotice(next.slots.length < 9
      ? `Only ${next.slots.length} cards match this lens — save more material or widen the lens.`
      : '');
  }

  function swapInto(slotIndex: number, replacement: BuilderCard) {
    setProposal(current => {
      if (!current) return current;
      const outgoing = current.slots[slotIndex];
      const slots = [...current.slots];
      slots[slotIndex] = replacement;
      const alternates = [outgoing, ...current.alternates.filter(card => card.key !== replacement.key)];
      const manualSwaps = [...new Set([...current.rationale.manualSwaps, replacement.familyLabel])];
      // Rationale must describe the grid as it now stands, not the original proposal.
      return { slots, alternates, rationale: rebuildRationale(slots, lens, manualSwaps) };
    });
    setSwapSlot(null);
    // Preserve the stale saved id so the next saveGrid call can remove the
    // orphaned record.  The slot composition changed → the new hash will differ.
    if (isGridSaved && savedGridId) setPriorSavedGridId(savedGridId);
    setIsGridSaved(false);
    setSavedGridId(null);
    setShowSaveNudge(false);
    setPendingNavAfterSave(false);
  }

  /** Persist the current grid to the local collection without rendering or sharing. */
  async function saveGrid() {
    if (!proposal || proposal.slots.length !== 9 || busy) return;
    setBusy('save');
    try {
      const grid = gridRecordFromProposal(proposal.slots, proposal.rationale);
      // If the user edited slots after a previous save, the slot hash changed
      // and this is a brand-new id.  Remove the orphaned prior record first so
      // the store never holds two versions of the same conceptual grid.
      if (priorSavedGridId && priorSavedGridId !== grid.id) {
        await dbRemoveGrid(priorSavedGridId);
        setPriorSavedGridId(null);
      }
      await dbSaveGrid(grid);
      setIsGridSaved(true);
      setSavedGridId(grid.id);
      setShowSaveNudge(false);
      setNotice('Grid saved to your collection.');
      if (pendingNavAfterSave) {
        setPendingNavAfterSave(false);
        onExported?.();
      }
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not save the grid.');
    } finally {
      setBusy('');
    }
  }

  /** Remove the currently saved grid from the collection. */
  async function removeGrid() {
    if (!savedGridId || busy) return;
    setBusy('remove');
    try {
      await dbRemoveGrid(savedGridId);
      setIsGridSaved(false);
      setSavedGridId(null);
      setPriorSavedGridId(null);
      setNotice('Removed from your collection.');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not remove the grid.');
    } finally {
      setBusy('');
    }
  }

  /**
   * Render + share the grid. Does not auto-save — after a successful export
   * the notice area nudges the user to save if they haven't yet.
   */
  async function exportGrid() {
    if (!proposal || proposal.slots.length !== 9 || busy) return;
    // Synchronous re-entrant guard: setBusy schedules a React update but does
    // not mutate the captured closure value until the next render.  A second
    // call that arrives in the same event-loop tick (double-click) would pass
    // the `|| busy` check above, so the ref provides a reliable synchronous
    // barrier — identical to the pattern used in startPacket.
    if (exportInFlight.current) return;
    exportInFlight.current = true;
    const wasGridSaved = isGridSaved;
    setBusy('export');
    setNotice('正在生成分享卡……');
    setShowSaveNudge(false);
    try {
      const grid = gridRecordFromProposal(proposal.slots, proposal.rationale);
      const starData = starDataFromCollectionGrid(grid);
      // Capture the rendered PNG so it can be persisted server-side after a
      // successful export of a SAVED grid.  Fire-and-forget: the upload never
      // blocks the download/share path, and export never saves a grid.
      let renderedBlob: Blob | null = null;
      const message = await saveShareCard(starData, 'full', (blob) => { renderedBlob = blob; });
      try {
        const tier = classifyEditionTier(buildExportPayload(starData).chosen);
        let persistedExportId: string | undefined;
        if (wasGridSaved && renderedBlob) {
          persistedExportId = crypto.randomUUID();
          void uploadExportedCard(grid.id, persistedExportId, renderedBlob, 'full', tier);
        }
        logGridExport(gridExportEventFromRecord(grid, 'full', tier, wasGridSaved, persistedExportId));
      } catch (bookkeepingErr) {
        console.warn('Post-export logging failed (export succeeded):', bookkeepingErr);
      }
      setNotice(message);
      if (!wasGridSaved) {
        setShowSaveNudge(true);
        setPendingNavAfterSave(true);
      } else {
        onExported?.();
      }
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : '分享卡生成失败，再试一次？');
    } finally {
      exportInFlight.current = false;
      setBusy('');
    }
  }

  async function startPacket() {
    if (!proposal || proposal.slots.length !== 9 || busy || !onCreateFromGrid) return;
    // Synchronous re-entrant guard: the ref is set before any await, so a second
    // call that arrives in the same event-loop tick (before React re-renders and
    // the button disables) exits here without touching dbSaveGrid or onCreateFromGrid.
    if (packetInFlight.current) return;
    packetInFlight.current = true;
    setBusy('packet');
    setNotice('');
    try {
      const grid = gridRecordFromProposal(proposal.slots, proposal.rationale);
      // If the user swapped a slot after a previous save, the slot hash changed
      // and this is a brand-new id.  Remove the orphaned prior record first so
      // the store never holds two versions of the same conceptual grid.
      if (priorSavedGridId && priorSavedGridId !== grid.id) {
        await dbRemoveGrid(priorSavedGridId);
        setPriorSavedGridId(null);
      }
      await dbSaveGrid(grid);
      setIsGridSaved(true);
      setSavedGridId(grid.id);
      await onCreateFromGrid(grid);
      setNotice('Idea Packet started with the curation brief attached.');
      onPacketCreated?.();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Idea Packet could not be started.');
    } finally {
      packetInFlight.current = false;
      setBusy('');
    }
  }

  if (loadError) return <div className={styles.notice} role="alert">{loadError}</div>;
  if (!pool || !options) {
    return <div className={styles.loading} aria-label="Loading saved collection"><span /><span /><span /></div>;
  }
  if (pool.length === 0) {
    return (
      <div className={styles.empty}>
        <strong>The shelf is empty.</strong>
        <span>Save cards or grids first — the Grid Builder assembles new 3×3s from saved material.</span>
      </div>
    );
  }

  return (
    <section className={styles.builder}>
      <header className={styles.header}>
        <div>
          <h3>Collection Grid Builder</h3>
          <p>Pick a lens, propose a 3×3, swap what feels off, export. The “why” travels to CREATE.</p>
        </div>
        <span>{lensedCount} of {pool.length} cards in lens</span>
      </header>

      {(notice || showSaveNudge) && (
        <div className={styles.notice} role="status">
          {notice}
          {showSaveNudge && (
            <span className={styles.saveNudge}>
              {' '}Grid not saved yet —{' '}
              <button
                type="button"
                className={styles.saveNudgeBtn}
                onClick={saveGrid}
                disabled={Boolean(busy)}
              >
                💾 Save to collection?
              </button>
            </span>
          )}
        </div>
      )}

      <div className={styles.lenses}>
        <LensRow label="Star" options={options.actors} active={lens.actor} onToggle={value => toggle('actor', value)} />
        <LensRow label="Vibe" options={options.vibes} active={lens.vibe} onToggle={value => toggle('vibe', value)} />
        {options.families.length > 0 && (
          <LensRow label="Visual family" options={options.families} active={lens.familyId} onToggle={value => toggle('familyId', value)} />
        )}
      </div>

      <button type="button" className={styles.propose} onClick={propose} disabled={lensedCount === 0}>
        {proposal ? 'Re-propose 3×3' : 'Propose 3×3'}
      </button>

      {proposal && (
        <div className={styles.workspace}>
          <div>
            <div className={styles.grid} role="group" aria-label="Proposed 3×3 grid">
              {proposal.slots.map((card, index) => (
                <button
                  key={card.key}
                  type="button"
                  className={styles.slot}
                  aria-pressed={swapSlot === index}
                  title={proposal.rationale.slotReasons[index]}
                  onClick={() => setSwapSlot(current => (current === index ? null : index))}
                >
                  <img src={card.imageUrl} alt={card.title} loading="lazy" />
                  <span>{proposal.rationale.slotReasons[index]}</span>
                </button>
              ))}
            </div>
            {swapSlot !== null && (
              <div className={styles.alternates}>
                <strong>Swap slot {swapSlot + 1} with:</strong>
                {proposal.alternates.length === 0 ? (
                  <span className={styles.noAlternates}>No other cards match this lens.</span>
                ) : (
                  <div className={styles.alternateStrip}>
                    {proposal.alternates.slice(0, 12).map(card => (
                      <button key={card.key} type="button" onClick={() => swapInto(swapSlot, card)} title={card.familyLabel}>
                        <img src={card.imageUrl} alt={card.title} loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className={styles.rationale} aria-label="Curation rationale">
            <h4>Creative brief</h4>
            <pre>{rationaleBrief(proposal.rationale)}</pre>
            <div className={styles.actions}>
              <button
                type="button"
                onClick={saveGrid}
                disabled={Boolean(busy) || proposal.slots.length !== 9 || isGridSaved}
                title={isGridSaved ? 'Already saved to your collection' : 'Save this grid to your collection'}
              >
                {busy === 'save' ? 'Saving…' : isGridSaved ? '✓ Saved' : '💾 Save grid'}
              </button>
              {isGridSaved && (
                <button
                  type="button"
                  onClick={removeGrid}
                  disabled={Boolean(busy)}
                  title="Remove this grid from your collection"
                >
                  {busy === 'remove' ? 'Removing…' : 'Remove from collection'}
                </button>
              )}
              <button type="button" onClick={exportGrid} disabled={Boolean(busy) || proposal.slots.length !== 9}>
                {busy === 'export' ? 'Exporting…' : '📤 Export share card'}
              </button>
              {isAdmin && onCreateFromGrid && (
                <button type="button" onClick={startPacket} disabled={Boolean(busy) || proposal.slots.length !== 9}>
                  {busy === 'packet' ? 'Starting…' : 'Start Idea Packet'}
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
};

function LensRow({ label, options, active, onToggle }: {
  label: string;
  options: Array<{ value: string; label: string; count: number }>;
  active?: string;
  onToggle: (value: string) => void;
}) {
  return (
    <div className={styles.lensRow}>
      <span className={styles.lensLabel}>{label}</span>
      <div className={styles.chips}>
        {options.slice(0, 12).map(option => (
          <button
            key={option.value}
            type="button"
            className={styles.chip}
            aria-pressed={active === option.value}
            onClick={() => onToggle(option.value)}
          >
            {option.label} <em>{option.count}</em>
          </button>
        ))}
      </div>
    </div>
  );
}
