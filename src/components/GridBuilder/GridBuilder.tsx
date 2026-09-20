import { useEffect, useMemo, useRef, useState } from 'react';
import {
  dbGetVisibleCardsByScope,
  dbGetVisibleGrids,
  dbRemoveGrid,
  dbSaveGrid,
  type CardRecord,
  type GridRecord,
} from '../../utils/collectionDB';
import { starDataFromCollectionGrid } from '../../utils/collectionHistoryModel';
import {
  buildExportPayload,
  buildMasterExportManifest,
  classifyEditionTier,
  saveShareCard,
  type ExportManifest,
  type ExportProvenanceAsset,
} from '../../utils/exportCanvas';
import { deleteGridExports, gridExportEventFromRecord, logGridExport, uploadExportedCard } from '../../utils/gridExportLog';
import { logMembershipEvent } from '../../utils/membership';
import { collectorBenefits, type CollectorPalette } from '../../utils/collectorBenefits';
import { isVerifiedMediaReference } from '../../utils/mediaReference';
import {
  trackActorSourceNotesLoadFailed,
  trackActorSourceNotesLoadSucceeded,
  trackActorSourceNotesOpened,
} from '../../utils/analytics';
import {
  applyLens,
  actorPackIdForLens,
  buildVibeAtlasPool,
  gridRecordFromProposal,
  lensOptions,
  manualGridRationale,
  proposeGrid,
  rationaleBrief,
  rebuildRationale,
  type BuilderCard,
  type CollectionLens,
  type EditorialMode,
  type GridProposal,
} from '../../utils/gridBuilder';
import styles from './GridBuilder.module.css';

interface ActorPackSourceVibe {
  emoji?: string;
  label?: string;
  label_en?: string;
  sourceDepth?: {
    queries?: string[];
    authoringPrompt?: string;
  };
}

interface ActorPackSourceNotes {
  id: string;
  name?: string;
  name_en?: string;
  provenance: {
    attribution: string;
  };
  vibes: ActorPackSourceVibe[];
}

interface Props {
  /** Account id of the signed-in user; scopes the pool to that account's visible records. */
  accountId?: string;
  /** Called after a successful export so the parent can navigate to the Grids tab. */
  onExported?: () => void;
  /** Collector entitlement; server enforcement remains authoritative. */
  hasCollectorAccess?: boolean;
  onUpgrade?: () => void;
  onCollectionChanged?: () => Promise<void>;
  /** Explicit inventory boundary. Daily Drop cards never fall back to My Collection. */
  sourceKind?: 'collection' | 'daily';
  sourcePool?: BuilderCard[];
}

/**
 * Vibe Atlas Grid Builder — the core studio workflow. Saved collection →
 * lens → editorial contract → proposed set → slot swaps → save and export.
 */
export const GridBuilder: React.FC<Props> = ({
  accountId,
  onExported,
  hasCollectorAccess = false,
  onUpgrade,
  onCollectionChanged,
  sourceKind = 'collection',
  sourcePool = [],
}) => {
  const isCollectionSource = sourceKind === 'collection';
  const dailySourcePool = isCollectionSource ? null : sourcePool;
  const benefits = collectorBenefits(hasCollectorAccess);
  const [pool, setPool] = useState<BuilderCard[] | null>(null);
  const [sourceRecords, setSourceRecords] = useState<{ cards: CardRecord[] } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [lens, setLens] = useState<CollectionLens>({});
  const [builderMode, setBuilderMode] = useState<'smart' | 'manual'>('smart');
  const [editorialMode, setEditorialMode] = useState<EditorialMode>('compiled');
  const [proposal, setProposal] = useState<GridProposal | null>(null);
  const [swapSlot, setSwapSlot] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [savedCanvasCount, setSavedCanvasCount] = useState(0);
  // Tracks whether the *current* proposal has been explicitly saved to the collection.
  // Resets to false whenever the proposal changes (re-propose, lens toggle, slot swap).
  const [isGridSaved, setIsGridSaved] = useState(false);
  // Stores the id of the saved grid so it can be removed without re-deriving it.
  const [savedGridId, setSavedGridId] = useState<string | null>(null);
  // After a successful export-without-save, prompt the user to save.
  const [showSaveNudge, setShowSaveNudge] = useState(false);
  // When true, a successful save should also trigger the onExported navigation.
  const [pendingNavAfterSave, setPendingNavAfterSave] = useState(false);
  const [palette, setPalette] = useState<CollectorPalette | null>(null);
  const [sourceNotesOpen, setSourceNotesOpen] = useState(false);
  const [sourceNotesBusy, setSourceNotesBusy] = useState(false);
  const [sourceNotesError, setSourceNotesError] = useState('');
  const [sourceNotes, setSourceNotes] = useState<ActorPackSourceNotes | null>(null);
  const sourceNotesRequest = useRef(0);
  // Tracks the id of the last grid that was saved before a slot swap changed
  // the proposal.  When the user saves after swapping, the stale record is
  // removed first so only the latest version lives in the store.
  const [priorSavedGridId, setPriorSavedGridId] = useState<string | null>(null);
  // Synchronous in-flight lock for exportGrid. React state setters do not
  // update the captured closure value until the next render.
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
        const [cards, grids] = await Promise.all([
          isCollectionSource
            ? dbGetVisibleCardsByScope(accountId, 'vibe-atlas')
            : Promise.resolve([]),
          dbGetVisibleGrids(accountId),
        ]);
        if (!cancelled) {
          setSourceRecords(isCollectionSource ? { cards } : null);
          setPool(isCollectionSource ? buildVibeAtlasPool(cards, 'standard') : dailySourcePool || []);
          setSavedCanvasCount(grids.length);
        }
      } catch (caught) {
        if (!cancelled) setLoadError(caught instanceof Error
          ? caught.message
          : isCollectionSource
            ? 'Saved collection could not be loaded.'
            : 'Today’s Daily Drop inventory could not be loaded.');
      }
    })();
    return () => { cancelled = true; };
  }, [accountId, dailySourcePool, isCollectionSource]);

  const savedOptions = useMemo(() => (pool ? lensOptions(pool) : null), [pool]);
  const smartOptionPool = useMemo(
    () => (pool ? applyLens(pool, { mode: lens.mode, actor: lens.actor }) : null),
    [pool, lens.actor, lens.mode],
  );
  const smartOptions = useMemo(
    () => (smartOptionPool ? lensOptions(smartOptionPool) : null),
    [smartOptionPool],
  );
  const eligibleEventFamilyIds = useMemo(() => new Set(
    (smartOptionPool || [])
      .filter(card => card.familyEvidence === 'batch' || card.familyEvidence === 'persisted-event')
      .map(card => card.familyId),
  ), [smartOptionPool]);
  const familyOptions = useMemo(() => {
    if (!smartOptions) return [];
    return editorialMode === 'event'
      ? smartOptions.families.filter(option => eligibleEventFamilyIds.has(option.value))
      : smartOptions.families;
  }, [editorialMode, eligibleEventFamilyIds, smartOptions]);
  const lensedCount = useMemo(
    () => (pool ? applyLens(pool, lens).length : 0),
    [pool, lens],
  );
  const collectionCounts = useMemo(() => {
    const cards = sourceRecords?.cards || [];
    const count = (mode: 'standard' | 'misprints') => {
      return buildVibeAtlasPool(cards, mode).length;
    };
    return {
      standard: count('standard'),
      misprints: count('misprints'),
    };
  }, [sourceRecords]);
  const manualCandidates = useMemo(
    () => pool && lens.actor ? applyLens(pool, { mode: lens.mode, actor: lens.actor }) : [],
    [pool, lens.actor, lens.mode],
  );
  const selectedActorPackId = useMemo(() => {
    return pool ? actorPackIdForLens(pool, lens.actor) : '';
  }, [lens.actor, pool]);
  const proposalTargetSize = proposal?.rationale.compositionSize || 9;
  const proposalComplete = Boolean(proposal && proposal.slots.length === proposalTargetSize);
  const proposalEvidence = useMemo(() => {
    if (!proposal) return null;
    const families = new Set(proposal.slots.map(card => card.familyId));
    const sources = new Set(proposal.slots.map(card => card.publisher || card.sourceUrl).filter(Boolean));
    return {
      familyCount: families.size,
      sourceCount: sources.size,
      primaryFamily: proposal.slots[0]?.familyLabel || 'Unresolved family',
    };
  }, [proposal]);

  useEffect(() => {
    sourceNotesRequest.current += 1;
    setSourceNotesOpen(false);
    setSourceNotesBusy(false);
    setSourceNotesError('');
    setSourceNotes(null);
  }, [lens.actor]);

  async function openSourceNotes() {
    setSourceNotesOpen(true);
    trackActorSourceNotesOpened(hasCollectorAccess, builderMode);
    if (!hasCollectorAccess || !selectedActorPackId || sourceNotes?.id === selectedActorPackId) return;

    const requestId = ++sourceNotesRequest.current;
    setSourceNotesBusy(true);
    setSourceNotesError('');
    try {
      const params = new URLSearchParams({ actorId: selectedActorPackId });
      const response = await fetch(`/.netlify/functions/actor-pack-depth?${params.toString()}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Source notes are temporarily unavailable.');
      }
      const pack = result?.packs?.[0];
      if (!pack?.id || !pack?.provenance?.attribution || !Array.isArray(pack?.vibes)) {
        throw new Error('Source notes are temporarily unavailable.');
      }
      if (sourceNotesRequest.current === requestId) {
        setSourceNotes(pack);
        trackActorSourceNotesLoadSucceeded(hasCollectorAccess, builderMode);
      }
    } catch {
      if (sourceNotesRequest.current === requestId) {
        setSourceNotesError('Source notes are still syncing. You can keep building with your saved images.');
        trackActorSourceNotesLoadFailed(hasCollectorAccess, builderMode);
      }
    } finally {
      if (sourceNotesRequest.current === requestId) setSourceNotesBusy(false);
    }
  }

  function setMode(mode: 'standard' | 'misprints') {
    if (!isCollectionSource || !sourceRecords) return;
    setPool(buildVibeAtlasPool(sourceRecords.cards, mode));
    setLens({ mode });
    setProposal(null);
    setSwapSlot(null);
    setIsGridSaved(false);
    setSavedGridId(null);
    setPriorSavedGridId(null);
    setShowSaveNudge(false);
  }

  function toggle(key: keyof CollectionLens, value: string) {
    setLens(current => {
      const nextValue = current[key] === value ? undefined : value;
      if (key === 'actor') return { mode: current.mode, actor: nextValue };
      if (key === 'vibe') return { ...current, vibe: nextValue, familyId: undefined };
      return { ...current, [key]: nextValue };
    });
    setProposal(null);
    setSwapSlot(null);
    setIsGridSaved(false);
    setSavedGridId(null);
    setPriorSavedGridId(null);
    setShowSaveNudge(false);
    setPendingNavAfterSave(false);
  }

  function chooseBuilderMode(mode: 'smart' | 'manual') {
    setBuilderMode(mode);
    setProposal(null);
    setSwapSlot(null);
    setIsGridSaved(false);
    setSavedGridId(null);
    setPriorSavedGridId(null);
    setShowSaveNudge(false);
    setPendingNavAfterSave(false);
    setNotice('');
  }

  function chooseEditorialMode(mode: EditorialMode) {
    setEditorialMode(mode);
    setLens(current => ({ ...current, familyId: undefined }));
    setProposal(null);
    setSwapSlot(null);
    setIsGridSaved(false);
    setSavedGridId(null);
    setPriorSavedGridId(null);
    setShowSaveNudge(false);
    setPendingNavAfterSave(false);
    setNotice('');
  }

  function toggleManualCard(card: BuilderCard) {
    setProposal(current => {
      const slots = current?.slots || [];
      const selectedIndex = slots.findIndex(item => item.key === card.key);
      const selected = selectedIndex >= 0;
      const nextSlots = selected
        ? slots.filter((_, index) => index !== selectedIndex)
        : slots.length < 9 ? [...slots, card] : slots;
      if (!selected && slots.length >= 9) {
        setNotice('Your grid already has nine images. Remove one before adding another.');
        return current;
      }
      setNotice('');
      return {
        slots: nextSlots,
        alternates: [],
        rationale: manualGridRationale(nextSlots, lens.actor || card.actor),
      };
    });
    setSwapSlot(null);
    setIsGridSaved(false);
    setSavedGridId(null);
    setShowSaveNudge(false);
  }

  function swapManualSlots(first: number, second: number) {
    if (first === second) {
      setSwapSlot(null);
      return;
    }
    setProposal(current => {
      if (!current) return current;
      const slots = [...current.slots];
      [slots[first], slots[second]] = [slots[second], slots[first]];
      return { ...current, slots, rationale: manualGridRationale(slots, lens.actor || slots[0]?.actor || 'this star') };
    });
    if (isGridSaved && savedGridId) setPriorSavedGridId(savedGridId);
    setSwapSlot(null);
    setIsGridSaved(false);
    setSavedGridId(null);
    setShowSaveNudge(false);
  }

  function moveManualSlot(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (!proposal || target < 0 || target >= proposal.slots.length) return;
    swapManualSlots(index, target);
  }

  function duplicateManualSlot(index: number) {
    setProposal(current => {
      if (!current || current.slots.length >= 9 || !current.slots[index]) return current;
      const slots = [...current.slots];
      slots.splice(index + 1, 0, current.slots[index]);
      return { ...current, slots, rationale: manualGridRationale(slots, lens.actor || current.slots[index].actor) };
    });
    setSwapSlot(null);
    setIsGridSaved(false);
    setSavedGridId(null);
    setShowSaveNudge(false);
  }

  function removeManualSlot(index: number) {
    setProposal(current => {
      if (!current || !current.slots[index]) return current;
      const slots = current.slots.filter((_, slotIndex) => slotIndex !== index);
      return { ...current, slots, rationale: manualGridRationale(slots, lens.actor || current.slots[index].actor) };
    });
    setSwapSlot(null);
    setIsGridSaved(false);
    setSavedGridId(null);
    setShowSaveNudge(false);
  }

  function propose() {
    if (!pool) return;
    const next = proposeGrid(pool, lens, editorialMode);
    setProposal(next);
    setSwapSlot(null);
    setIsGridSaved(false);
    setSavedGridId(null);
    setPriorSavedGridId(null);
    setShowSaveNudge(false);
    setPendingNavAfterSave(false);
    const targetSize = next.rationale.compositionSize || 9;
    setNotice(next.slots.length < targetSize
      ? editorialMode === 'event'
        ? `This Event family has ${next.slots.length} of ${targetSize} needed frames. Save more from this appearance or choose Compiled.`
        : `Only ${next.slots.length} cards match this lens — save more material or widen the lens.`
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
      return {
        slots,
        alternates,
        rationale: rebuildRationale(
          slots,
          lens,
          manualSwaps,
          current.rationale.editorialMode || 'compiled',
          current.rationale.compositionSize || 9,
        ),
      };
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
    if (!proposal || !proposalComplete || busy) return;
    if (!isGridSaved && !priorSavedGridId && savedCanvasCount >= benefits.canvasAllowance) {
      setNotice(hasCollectorAccess
        ? `Collector includes ${benefits.canvasAllowance} active canvases. Remove one before saving another.`
        : 'Your free canvas is already saved. You can keep editing it, or unlock three additional Collector canvases.');
      return;
    }
    setBusy('save');
    try {
      const grid = gridRecordFromProposal(proposal.slots, proposal.rationale, new Date(), palette
        ? { paletteId: palette.id, atmosphereId: palette.id }
        : undefined);
      // If the user edited slots after a previous save, the slot hash changed
      // and this is a brand-new id.  Remove the orphaned prior record first so
      // the store never holds two versions of the same conceptual grid.
      if (priorSavedGridId && priorSavedGridId !== grid.id) {
        await dbRemoveGrid(priorSavedGridId);
        await deleteGridExports(priorSavedGridId, accountId).catch(() => {});
        setPriorSavedGridId(null);
      }
      await dbSaveGrid(grid);
      let syncFailed = false;
      try {
        await onCollectionChanged?.();
      } catch {
        syncFailed = true;
      }
      if (!isGridSaved && !priorSavedGridId) setSavedCanvasCount(count => count + 1);
      setIsGridSaved(true);
      setSavedGridId(grid.id);
      setShowSaveNudge(false);
      setNotice(syncFailed
        ? 'Grid saved locally. Cross-device sync will retry automatically.'
        : 'Grid saved to your collection.');
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
      // Best-effort server cleanup, awaited for delivery reliability; failure
      // never blocks the local removal.
      await deleteGridExports(savedGridId, accountId).catch(() => {});
      await onCollectionChanged?.().catch(() => {});
      setIsGridSaved(false);
      setSavedGridId(null);
      setPriorSavedGridId(null);
      setSavedCanvasCount(count => Math.max(0, count - 1));
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
    if (!proposal || !proposalComplete || busy) return;
    // Synchronous re-entrant guard: setBusy schedules a React update but does
    // not mutate the captured closure value until the next render.  A second
    // call that arrives in the same event-loop tick (double-click) would pass
    // the `|| busy` check above, so the ref provides a reliable synchronous
    // barrier — identical to the pattern used in startPacket.
    if (exportInFlight.current) return;
    exportInFlight.current = true;
    logMembershipEvent('paid_feature_used');
    const wasGridSaved = isGridSaved;
    setBusy('export');
    setNotice('正在生成分享卡……');
    setShowSaveNudge(false);
    try {
      const grid = gridRecordFromProposal(proposal.slots, proposal.rationale, new Date(), palette
        ? { paletteId: palette.id, atmosphereId: palette.id }
        : undefined);
      let exportGridRecord: GridRecord = grid;
      let exportManifest: ExportManifest | undefined;
      if (hasCollectorAccess) {
        const assets: ExportProvenanceAsset[] = grid.images.map(image => {
          if (!isVerifiedMediaReference(image.media)) {
            throw new Error('Master Export needs nine materialized MEDIA assets. Save or recover every image first.');
          }
          return {
            assetId: image.media.assetId,
            checksum: image.media.checksum,
            deliveryUrl: image.media.deliveryUrl,
            sourceUrl: image.sourceUrl,
            attribution: { publisher: image.publisher, title: image.title },
            permitted: true,
          };
        });
        exportManifest = buildMasterExportManifest(grid.id, grid.id, assets);
        exportGridRecord = {
          ...grid,
          images: grid.images.map(image => ({ ...image, imageUrl: image.media!.deliveryUrl })),
        };
      }
      const starData = starDataFromCollectionGrid(exportGridRecord);
      // Capture the rendered PNG so it can be persisted server-side after a
      // successful export of a SAVED grid.  Fire-and-forget: the upload never
      // blocks the download/share path, and export never saves a grid.
      let renderedBlob: Blob | null = null;
      const exportVariant = hasCollectorAccess ? 'master' : 'standard';
      const message = await saveShareCard(starData, exportVariant, (blob) => { renderedBlob = blob; });
      try {
        const tier = classifyEditionTier(buildExportPayload(starData).chosen);
        let persistedExportId: string | undefined;
        if (wasGridSaved && renderedBlob) {
          persistedExportId = crypto.randomUUID();
          void uploadExportedCard(
            grid.id,
            persistedExportId,
            renderedBlob,
            exportVariant,
            tier,
            exportManifest,
          );
        }
        logGridExport(gridExportEventFromRecord(grid, exportVariant, tier, wasGridSaved, persistedExportId));
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

  if (loadError) return <div className={styles.notice} role="alert">{loadError}</div>;
  if (!pool || !savedOptions || !smartOptions) {
    return <div className={styles.loading} aria-label={isCollectionSource ? 'Loading saved collection' : 'Loading Daily Drop inventory'}><span /><span /><span /></div>;
  }
  if (pool.length === 0) {
    return (
      <div className={styles.empty}>
        <strong>{isCollectionSource ? 'The shelf is empty.' : 'Today’s inventory is not ready yet.'}</strong>
        <span>{isCollectionSource
          ? 'Save cards or grids first — the Grid Builder assembles editorial sets from saved material.'
          : 'Return to today’s drop while its approved images finish loading.'}</span>
      </div>
    );
  }

  return (
    <section className={styles.builder} data-palette={palette?.id || 'default'}>
      <header className={styles.header}>
        <div>
          <h3>Vibe Atlas Grid Builder</h3>
          <p>Start with a smart proposal or choose and arrange every image yourself.</p>
        </div>
        <span>
          {builderMode === 'manual'
            ? `${countLabel(manualCandidates.length, isCollectionSource ? 'saved result' : 'Daily Drop image')} for this star`
            : `${countLabel(lensedCount, isCollectionSource ? 'saved result' : 'Daily Drop image')} ${lensedCount === 1 ? 'matches' : 'match'} this lens`}
        </span>
      </header>

      <div className={styles.benefitBar} role="note">
        {hasCollectorAccess ? (
          <>
            <strong>Fandom Collector</strong>
            <span>{benefits.canvasAllowance} canvases · cross-device persistence enabled</span>
            {benefits.palettes.length > 0 && (
              <label>
                Atmosphere
                <select
                  value={palette?.id || ''}
                  onChange={event => setPalette(
                    benefits.palettes.find(item => item.id === event.target.value) || null,
                  )}
                >
                  <option value="">Original</option>
                  {benefits.palettes.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
                </select>
              </label>
            )}
          </>
        ) : (
          <>
            <strong>Free studio</strong>
            <span>1 canvas · local saves, rearranging, sharing, and 1080×1080 sRGB export included.</span>
          </>
        )}
      </div>

      <div className={styles.modeTabs} role="tablist" aria-label="Grid building method">
        <button type="button" role="tab" aria-selected={builderMode === 'smart'} onClick={() => chooseBuilderMode('smart')}>
          Smart Proposal
        </button>
        <button type="button" role="tab" aria-selected={builderMode === 'manual'} onClick={() => chooseBuilderMode('manual')}>
          Build Your Own
        </button>
      </div>

      {builderMode === 'smart' && (
        <fieldset className={styles.contractChoice}>
          <legend>Editorial contract</legend>
          <button
            type="button"
            className={styles.contractCard}
            aria-pressed={editorialMode === 'event'}
            onClick={() => chooseEditorialMode('event')}
          >
            <span>Event</span>
            <strong>No, look closer.</strong>
            <small>Stay inside one detected appearance. Repetition becomes sequence, and a strong family can grow to 12 frames.</small>
          </button>
          <button
            type="button"
            className={styles.contractCard}
            aria-pressed={editorialMode === 'compiled'}
            onClick={() => chooseEditorialMode('compiled')}
          >
            <span>Compiled</span>
            <strong>Look at the range.</strong>
            <small>Build a nine-frame argument across visual families, sources, roles, looks, and moods.</small>
          </button>
        </fieldset>
      )}

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
        {isCollectionSource && (
          <LensRow
            label="Collection"
            options={[
              {
                value: 'standard',
                label: 'Ordinary Vibe Atlas',
                count: collectionCounts.standard,
              },
              {
                value: 'misprints',
                label: 'Legendary Misprints',
                count: collectionCounts.misprints,
              },
            ]}
            active={lens.mode || 'standard'}
            onToggle={value => setMode(value as 'standard' | 'misprints')}
          />
        )}
        <LensRow label="Star" options={savedOptions.actors} active={lens.actor} onToggle={value => toggle('actor', value)} />
        {builderMode === 'smart' && <LensRow label="Vibe" options={smartOptions.vibes} active={lens.vibe} onToggle={value => toggle('vibe', value)} />}
        {builderMode === 'smart' && familyOptions.length > 0 && (
          <LensRow label="Visual family" options={familyOptions} active={lens.familyId} onToggle={value => toggle('familyId', value)} />
        )}
      </div>

      {lens.actor && (
        <section className={styles.sourceNotes} aria-label={`Source notes for ${lens.actor}`}>
          <div className={styles.sourceNotesIntro}>
            <div>
              <strong>Actor source notes</strong>
              <span>
                {hasCollectorAccess
                  ? 'Open the editorial searches and visual directions behind this actor pack.'
                  : 'Collector adds the source searches and editorial directions behind each actor pack.'}
              </span>
            </div>
            <button
              type="button"
              aria-expanded={sourceNotesOpen}
              onClick={sourceNotesOpen ? () => setSourceNotesOpen(false) : openSourceNotes}
            >
              {sourceNotesOpen ? 'Hide notes' : hasCollectorAccess ? 'Open notes' : 'Preview benefit'}
            </button>
          </div>

          {sourceNotesOpen && (
            <div className={styles.sourceNotesBody}>
              {!hasCollectorAccess ? (
                <>
                  <p>Explore source trails and authoring context without leaving the Builder. Protected searches and notes stay available only to active Collectors.</p>
                  {onUpgrade && <button type="button" className={styles.sourceNotesUpgrade} onClick={onUpgrade}>Explore Fandom Collector</button>}
                </>
              ) : sourceNotesBusy ? (
                <p role="status">Loading private source notes…</p>
              ) : sourceNotesError ? (
                <p role="status">{sourceNotesError}</p>
              ) : sourceNotes ? (
                <>
                  <div className={styles.sourceNotesList}>
                    {sourceNotes.vibes.map((vibe, index) => (
                      <article key={`${vibe.label_en || vibe.label || 'vibe'}-${index}`}>
                        <strong>{vibe.emoji} {vibe.label_en || vibe.label || 'Editorial direction'}</strong>
                        {vibe.sourceDepth?.queries && vibe.sourceDepth.queries.length > 0 && (
                          <>
                            <small>Source searches</small>
                            <ul>{vibe.sourceDepth.queries.map(query => <li key={query}>{query}</li>)}</ul>
                          </>
                        )}
                        {vibe.sourceDepth?.authoringPrompt && (
                          <>
                            <small>Authoring note</small>
                            <p>{vibe.sourceDepth.authoringPrompt}</p>
                          </>
                        )}
                      </article>
                    ))}
                  </div>
                  <footer>Source: {sourceNotes.provenance.attribution}</footer>
                </>
              ) : null}
            </div>
          )}
        </section>
      )}

      {builderMode === 'smart' && <button type="button" className={styles.propose} onClick={propose} disabled={lensedCount === 0}>
        {proposal
          ? `Re-propose ${proposalTargetSize}-frame ${editorialMode === 'event' ? 'Event' : 'Compiled'} set`
          : `Propose ${editorialMode === 'event' ? 'Event set' : 'Compiled 3×3'}`}
      </button>}

      {builderMode === 'manual' && (
        <section className={styles.manualPicker} aria-label="Choose nine saved images">
          <div className={styles.manualPickerHeader}>
            <strong>{lens.actor ? `${proposal?.slots.length || 0} of 9 selected` : 'Choose a star to begin'}</strong>
            <span>{isCollectionSource
              ? 'Only saved images for the selected actor appear here. Select a placed image to duplicate it intentionally.'
              : 'Only images from today’s Daily Drop appear here. Select a placed image to duplicate it intentionally.'}</span>
          </div>
          {lens.actor && manualCandidates.length === 0 ? (
            <div className={styles.notice}>Save at least one image for {lens.actor} to begin a custom grid.</div>
          ) : lens.actor ? (
            <div className={styles.candidateGrid}>
              {manualCandidates.map(card => {
                const selectedIndex = proposal?.slots.findIndex(item => item.key === card.key) ?? -1;
                return (
                  <button
                    key={card.key}
                    type="button"
                    aria-pressed={selectedIndex >= 0}
                    aria-label={`${selectedIndex >= 0 ? `Remove position ${selectedIndex + 1}` : 'Select'} ${card.title}`}
                    onClick={() => toggleManualCard(card)}
                  >
                    <img src={card.imageUrl} alt="" loading="lazy" />
                    {selectedIndex >= 0 && <span>{selectedIndex + 1}</span>}
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>
      )}

      {proposal && (
        <div className={styles.workspace}>
          <div>
            <div
              className={`${styles.grid} ${proposalTargetSize === 12 ? styles.eventGrid : ''}`}
              role="group"
              aria-label={builderMode === 'manual'
                ? 'Custom 3×3 grid'
                : `Proposed ${proposal.rationale.editorialMode === 'event' ? 'Event' : 'Compiled'} ${proposalTargetSize}-frame set`}
            >
              {proposal.slots.map((card, index) => (
                <button
                  key={`${card.key}-${index}`}
                  type="button"
                  className={styles.slot}
                  aria-pressed={swapSlot === index}
                  title={proposal.rationale.slotReasons[index]}
                  onClick={() => {
                    if (builderMode === 'manual' && swapSlot !== null) swapManualSlots(swapSlot, index);
                    else setSwapSlot(current => (current === index ? null : index));
                  }}
                >
                  <img src={card.imageUrl} alt={card.title} loading="lazy" />
                  <span>{proposal.rationale.slotReasons[index]}</span>
                </button>
              ))}
              {builderMode === 'manual' && Array.from({ length: Math.max(0, 9 - proposal.slots.length) }).map((_, index) => (
                <div className={styles.emptySlot} key={`empty-${index}`}>{proposal.slots.length + index + 1}</div>
              ))}
            </div>
            {builderMode === 'manual' && proposal.slots.length > 0 && (
              <div className={styles.arrangeHelp}>
                <span>{swapSlot === null ? 'Select a filled slot to move or swap it.' : `Position ${swapSlot + 1} selected. Choose another slot to swap.`}</span>
                {swapSlot !== null && (
                  <span>
                    <button type="button" onClick={() => moveManualSlot(swapSlot, -1)} disabled={swapSlot === 0}>Move earlier</button>
                    <button type="button" onClick={() => moveManualSlot(swapSlot, 1)} disabled={swapSlot === proposal.slots.length - 1}>Move later</button>
                    <button type="button" onClick={() => duplicateManualSlot(swapSlot)} disabled={proposal.slots.length >= 9}>Duplicate selected</button>
                    <button type="button" onClick={() => removeManualSlot(swapSlot)}>Remove selected</button>
                  </span>
                )}
              </div>
            )}
            {builderMode === 'smart' && swapSlot !== null && (
              <div className={styles.alternates}>
                <strong>Swap slot {swapSlot + 1} with:</strong>
                {proposal.alternates.length === 0 ? (
                  <span className={styles.noAlternates}>No other cards match this lens.</span>
                ) : (
                  <div className={styles.alternateStrip}>
                    {proposal.alternates.map(card => (
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
            <div className={styles.rationaleHeader}>
              <div>
                <span>{builderMode === 'manual' || proposal.rationale.manualSwaps.length > 0
                  ? 'Creator-arranged'
                  : 'Automatic proposal'}</span>
                <h4>Creative brief</h4>
              </div>
              {proposal.rationale.editorialMode && (
                <strong>{proposal.rationale.editorialMode === 'event' ? 'Event' : 'Compiled'} · {proposalTargetSize}</strong>
              )}
            </div>
            {lens.mode === 'misprints' && (
              <p><strong>Legendary Misprint lens</strong> · Only creator-marked mismatches are included. Saved grids and exports retain both identities and provenance.</p>
            )}
            {proposalEvidence && builderMode === 'smart' && (
              <dl className={styles.evidence}>
                <div><dt>Primary family</dt><dd>{proposalEvidence.primaryFamily}</dd></div>
                <div><dt>Family logic</dt><dd>{proposal.rationale.editorialMode === 'event'
                  ? `One bounded family across ${proposal.slots.length} frames`
                  : `${proposalEvidence.familyCount} families balanced across nine frames`}</dd></div>
                <div><dt>Source trail</dt><dd>{proposalEvidence.sourceCount} distinct source {proposalEvidence.sourceCount === 1 ? 'signal' : 'signals'}</dd></div>
                {proposal.rationale.familyEvidence && (
                  <div><dt>Family evidence</dt><dd>{proposal.rationale.familyEvidence === 'persisted-event'
                    ? 'Preserved approved Event family'
                    : 'Shared saved batch provenance'}</dd></div>
                )}
              </dl>
            )}
            <pre>{rationaleBrief(proposal.rationale)}</pre>
            <div className={styles.actions}>
              <button
                type="button"
                onClick={saveGrid}
                disabled={Boolean(busy) || !proposalComplete || isGridSaved}
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
              <button type="button" onClick={exportGrid} disabled={Boolean(busy) || !proposalComplete}>
                {busy === 'export' ? 'Exporting…' : `📤 Export ${hasCollectorAccess ? 'master' : 'square'} PNG`}
              </button>
              {!hasCollectorAccess && onUpgrade && (
                <button type="button" onClick={onUpgrade} disabled={Boolean(busy)}>
                  ✦ Unlock Collector canvases and palettes
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
};

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

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
