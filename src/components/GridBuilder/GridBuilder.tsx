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
  prepareShareCard,
  type ExportManifest,
  type ExportProvenanceAsset,
} from '../../utils/exportCanvas';
import {
  deleteGridExports,
  gridExportEventFromRecord,
  logGridExport,
  notifyGridExportPersisted,
  uploadExportedCard,
} from '../../utils/gridExportLog';
import { logMembershipEvent } from '../../utils/membership';
import { collectorBenefits, type CollectorPalette } from '../../utils/collectorBenefits';
import { isVerifiedMediaReference } from '../../utils/mediaReference';
import { useLocale } from '../../i18n/LocaleProvider';
import { localizedPublicArchiveMessage } from '../../i18n/publicArchiveMessages';
import {
  trackActorSourceNotesLoadFailed,
  trackActorSourceNotesLoadSucceeded,
  trackActorSourceNotesOpened,
  trackHistoricalGridSaved,
  createArchiveActorDiscovery,
  trackArchiveImageEditionOpened,
} from '../../utils/analytics';
import {
  applyLens,
  actorPackIdForLens,
  buildVibeAtlasPool,
  buildPublicArchivePool,
  builderActorDisplayName,
  builderSourceLabel,
  builderVibeDisplayName,
  displayRationaleBrief,
  gridRecordFromProposal,
  lensOptions,
  manualGridRationale,
  proposeGrid,
  rebuildRationale,
  type BuilderCard,
  type CollectionLens,
  type EditorialMode,
  type GridProposal,
} from '../../utils/gridBuilder';
import styles from './GridBuilder.module.css';
import { usePublicArchiveInventory } from '../../hooks/usePublicArchiveInventory';

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
  /** Explicit inventory boundary. Daily Drop and edition cards never fall back to My Collection. */
  sourceKind?: 'collection' | 'daily' | 'edition' | 'archive';
  sourceEditionDate?: string;
  sourcePool?: BuilderCard[];
}

function gridSourceProvenance(
  sourceKind: 'collection' | 'daily' | 'edition' | 'archive',
  sourceEditionDate?: string,
): GridRecord['sourceProvenance'] | undefined {
  if (sourceKind === 'archive') return undefined;
  if (sourceKind === 'edition') {
    return sourceEditionDate ? { kind: 'edition', editionDate: sourceEditionDate } : undefined;
  }
  return { kind: sourceKind };
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
  sourceEditionDate,
  sourcePool = [],
}) => {
  const { locale, t, path } = useLocale();
  const tr = t;
  const errorText = (error: unknown, english: string, chinese: string) => {
    if (error instanceof Error) {
      return locale === 'zh-CN' && !/\p{Script=Han}/u.test(error.message)
        ? `英文原文错误：${error.message}`
        : error.message;
    }
    return tr(english, chinese);
  };
  const isCollectionSource = sourceKind === 'collection';
  const isPublicArchiveSource = sourceKind === 'archive' || sourceKind === 'edition';
  const externalSourcePool = isCollectionSource || isPublicArchiveSource ? null : sourcePool;
  const [archiveActorId, setArchiveActorId] = useState('');
  const [archiveDiscovery] = useState(createArchiveActorDiscovery);
  useEffect(() => {
    if (sourceKind === 'edition') archiveDiscovery.selectEdition();
    else if (sourceKind !== 'archive') archiveDiscovery.select('', []);
    return () => archiveDiscovery.select('', []);
  }, [sourceKind, sourceEditionDate, archiveDiscovery]);
  const publicArchive = usePublicArchiveInventory({
    date: sourceKind === 'edition' ? sourceEditionDate : undefined,
    enabled: isPublicArchiveSource,
    actorId: sourceKind === 'archive' ? archiveActorId || undefined : undefined,
    onInventoryOutcome: archiveDiscovery.inventory,
  });
  const publicArchivePool = useMemo(
    () => isPublicArchiveSource ? buildPublicArchivePool(publicArchive.editions) : [],
    [isPublicArchiveSource, publicArchive.editions],
  );
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
  const [handoffState, setHandoffState] = useState<{
    objectUrl: string;
    file: File;
    tier: string;
    expiresAt: number;
    discoveryContext: ReturnType<ReturnType<typeof createArchiveActorDiscovery>['capture']>;
  } | null>(null);
  const [handoffExpanded, setHandoffExpanded] = useState(false);
  const [handoffDestination, setHandoffDestination] = useState<'rednote' | 'weibo' | 'instagram' | 'facebook' | null>('rednote');
  const [now, setNow] = useState(Date.now());
  const proposalRef = useRef(proposal);
  const mountedRef = useRef(true);
  proposalRef.current = proposal;

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => { if (!handoffState) return; const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, [handoffState]);
  useEffect(() => {
    if (!handoffState) return;
    const remaining = handoffState.expiresAt - Date.now();
    if (remaining <= 0) { setHandoffState(null); return; }
    const timeout = window.setTimeout(() => { setHandoffState(null); setNotice(tr('Handoff expired. Prepare the current grid again.', '交接文件已过期，请重新准备。')); }, remaining);
    return () => window.clearTimeout(timeout);
  }, [handoffState?.expiresAt, t]);
  useEffect(() => { const url = handoffState?.objectUrl; return () => { if (url) URL.revokeObjectURL(url); }; }, [handoffState?.objectUrl]);
  const isHandoffExpired = Boolean(handoffState && now >= handoffState.expiresAt);
  // Synchronous in-flight lock for exportGrid. React state setters do not
  // update the captured closure value until the next render.
  // setBusy('export') schedules a React update but does not mutate the captured
  // closure value, so a double-click in the same event-loop tick would pass the
  // `|| busy` state guard and reach saveShareCard twice.  The ref is set before
  // the first await and cleared in finally, giving a reliable synchronous barrier.
  const exportInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // Public inventory is owned by its source, not by the resolving account.
    if (!isPublicArchiveSource) setPool(null);
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
          if (!isPublicArchiveSource) {
            setPool(isCollectionSource ? buildVibeAtlasPool(cards, 'standard') : externalSourcePool || []);
          }
          setSavedCanvasCount(grids.length);
        }
      } catch (caught) {
        if (!cancelled) setLoadError(caught instanceof Error
          ? caught.message
          : isCollectionSource
            ? tr('Saved collection could not be loaded.', '无法加载已保存的收藏。')
            : isPublicArchiveSource
              ? tr('Public Archive inventory metadata could not be loaded.', '无法加载公开典藏素材信息。')
              : tr('Today’s Daily Drop inventory could not be loaded.', '无法加载今日卡组素材。'));
      }
    })();
    return () => { cancelled = true; };
  }, [accountId, externalSourcePool, isCollectionSource, isPublicArchiveSource, sourceEditionDate]);

  useEffect(() => {
    if (isPublicArchiveSource) setPool(publicArchivePool);
  }, [isPublicArchiveSource, publicArchivePool]);

  const savedOptions = useMemo(() => (pool ? lensOptions(pool, locale) : null), [pool, locale]);
  const smartOptionPool = useMemo(
    () => (pool ? applyLens(pool, { mode: lens.mode, actor: lens.actor }) : null),
    [pool, lens.actor, lens.mode],
  );
  const smartOptions = useMemo(
    () => (smartOptionPool ? lensOptions(smartOptionPool, locale) : null),
    [smartOptionPool, locale],
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
        setSourceNotesError(tr('Source notes are still syncing. You can keep building with your saved images.', '来源备注仍在同步，你可以继续使用已保存的图片构建网格。'));
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

  function trackImageEditionLink(placement: 'picker' | 'slot' | 'alternate') {
    if (sourceKind === 'archive' || sourceKind === 'edition') {
      trackArchiveImageEditionOpened(sourceKind, placement);
    }
  }

  function chooseArchiveActor(id: string) {
    if (id === archiveActorId) return;
    archiveDiscovery.select(id, publicArchive.directoryActors.map(actor => actor.id));
    setArchiveActorId(id);
    setLens({});
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
        setNotice(tr('Your grid already has nine images. Remove one before adding another.', '网格已有九张图片，请先移除一张再添加。'));
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
        ? tr(`This Event family has ${next.slots.length} of ${targetSize} needed frames. Save more from this appearance or choose Compiled.`, `此单场造型目前有 ${next.slots.length}/${targetSize} 张图片。请从同一造型多保存一些图片，或改选「风格合辑」。`)
        : tr(`Only ${next.slots.length} cards match this lens — save more material or widen the lens.`, `符合此筛选条件的图片只有 ${next.slots.length} 张，请多保存一些素材或放宽筛选条件。`)
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
    const discoveryContext = isPublicArchiveSource ? archiveDiscovery.capture() : null;
    if (!isGridSaved && !priorSavedGridId && savedCanvasCount >= benefits.canvasAllowance) {
      setNotice(hasCollectorAccess
        ? tr(`Collector includes ${benefits.canvasAllowance} active canvases. Remove one before saving another.`, `Collector 可保存 ${benefits.canvasAllowance} 个有效网格。请先移除一个，再保存其他网格。`)
        : tr('Your free canvas is already saved. You can keep editing it, or unlock three additional Collector canvases.', '免费账户已保存一个网格。你可以继续编辑，或升级 Collector 以解锁另外三个网格。'));
      return;
    }
    setBusy('save');
    try {
      const grid = gridRecordFromProposal(
        proposal.slots,
        proposal.rationale,
        new Date(),
        palette ? { paletteId: palette.id, atmosphereId: palette.id } : undefined,
        gridSourceProvenance(sourceKind, sourceEditionDate),
      );
      // If the user edited slots after a previous save, the slot hash changed
      // and this is a brand-new id.  Remove the orphaned prior record first so
      // the store never holds two versions of the same conceptual grid.
      if (priorSavedGridId && priorSavedGridId !== grid.id) {
        await dbRemoveGrid(priorSavedGridId);
        await deleteGridExports(priorSavedGridId, accountId).catch(() => {});
        setPriorSavedGridId(null);
      }
      await dbSaveGrid(grid);
      if (isPublicArchiveSource) archiveDiscovery.complete(discoveryContext, 'saved');
      if (sourceKind === 'edition' && sourceEditionDate) {
        trackHistoricalGridSaved(sourceEditionDate);
      }
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
        ? tr('Grid saved locally. Cross-device sync will retry automatically.', '网格已保存在本设备上。跨设备同步会自动重试。')
        : tr('Grid saved to your collection.', '网格已保存到收藏夹。'));
      if (pendingNavAfterSave) {
        setPendingNavAfterSave(false);
        onExported?.();
      }
    } catch (caught) {
      setNotice(errorText(caught, 'Could not save the grid.', '无法保存网格。'));
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
      setNotice(tr('Removed from your collection.', '已从收藏夹中移除。'));
    } catch (caught) {
      setNotice(errorText(caught, 'Could not remove the grid.', '无法移除网格。'));
    } finally {
      setBusy('');
    }
  }

  /**
   * Render + share the grid. Does not auto-save — after a successful export
   * the notice area nudges the user to save if they haven't yet.
   */
  async function exportGrid(action: 'rednote' | 'download_raw' | 'full' = 'full') {
    if (!proposal || !proposalComplete || busy) return;
    const discoveryContext = isPublicArchiveSource ? archiveDiscovery.capture() : null;
    // Synchronous re-entrant guard: setBusy schedules a React update but does
    // not mutate the captured closure value until the next render.  A second
    // call that arrives in the same event-loop tick (double-click) would pass
    // the `|| busy` check above, so the ref provides a reliable synchronous
    // barrier — identical to the pattern used in startPacket.
    if (exportInFlight.current) return;
    exportInFlight.current = true;
    logMembershipEvent('paid_feature_used');
    const wasGridSaved = isGridSaved;
    let prepared: { objectUrl: string; file: File; fileName: string; tier: string } | null = null;
    setBusy('export');
    setNotice(tr('Preparing share card…', '正在生成分享卡……'));
    setShowSaveNudge(false);
    try {
      const grid = gridRecordFromProposal(
        proposal.slots,
        proposal.rationale,
        new Date(),
        palette ? { paletteId: palette.id, atmosphereId: palette.id } : undefined,
        gridSourceProvenance(sourceKind, sourceEditionDate),
      );
      let exportGridRecord: GridRecord = grid;
      let exportManifest: ExportManifest | undefined;
      if (hasCollectorAccess) {
        const assets: ExportProvenanceAsset[] = grid.images.map(image => {
          if (!isVerifiedMediaReference(image.media)) {
          throw new Error(tr('Master Export needs nine materialized MEDIA assets. Save or recover every image first.', 'Master 导出需要 9 个已实体化的 MEDIA 媒体资源。请先保存或恢复每张图片。'));
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
      if (action === 'download_raw' || action === 'full') {
        let message = '';
        if (action === 'download_raw') {
          prepared = await prepareShareCard(starData, 'raw', blob => { renderedBlob = blob; });
          const anchor = document.createElement('a'); anchor.href = prepared.objectUrl; anchor.download = prepared.fileName; document.body.appendChild(anchor); anchor.click(); anchor.remove();
          setTimeout(() => URL.revokeObjectURL(prepared!.objectUrl), 4000);
          message = 'PNG 已下载 ✓';
        }
        if (action === 'full') {
          message = await saveShareCard(starData, exportVariant, (blob) => { renderedBlob = blob; });
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
              ).then((persisted) => {
                if (persisted) notifyGridExportPersisted(grid.id);
              });
            }
            logGridExport(gridExportEventFromRecord(grid, exportVariant, tier, wasGridSaved, persistedExportId));
          } catch (bookkeepingErr) {
            console.warn('Post-export logging failed (export succeeded):', bookkeepingErr);
          }
        }
        if (isPublicArchiveSource) archiveDiscovery.complete(discoveryContext, 'exported');
        setNotice(message);
        if (!wasGridSaved) {
          setShowSaveNudge(true);
          setPendingNavAfterSave(true);
        }
        if (wasGridSaved) onExported?.();
      } else {
        const preparedProposal = proposal;
        prepared = await prepareShareCard(starData, 'raw', blob => { renderedBlob = blob; });
        if (!mountedRef.current || proposalRef.current !== preparedProposal) { URL.revokeObjectURL(prepared.objectUrl); return; }
        setHandoffState({
          objectUrl: prepared.objectUrl, file: prepared.file, tier: prepared.tier,
          expiresAt: Date.now() + 120_000, discoveryContext,
        });
        setNotice(tr('Handoff prepared.', '发布交接文件已准备好。'));
      }
    } catch (caught) {
      if (prepared?.objectUrl) URL.revokeObjectURL(prepared.objectUrl);
      setNotice(errorText(caught, 'Share card could not be generated. Please try again.', '分享卡生成失败，请重试。'));
    } finally {
      exportInFlight.current = false;
      setBusy('');
    }
  }

  async function shareToDevice() {
    if (!handoffState) return;
    if (Date.now() > handoffState.expiresAt) { setHandoffState(null); setNotice(tr('Handoff expired. Please prepare again.', '交接文件已过期，请重新准备。')); return; }
    const shareData = { files: [handoffState.file], title: 'Vibe Atlas Grid' };
    const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare(shareData);
    if (!canShareFiles) { setNotice(tr('Sharing not supported on this device.', '此设备不支持分享文件。')); return; }
    try {
      await navigator.share(shareData);
      archiveDiscovery.complete(handoffState.discoveryContext, 'exported');
      setNotice(tr('Share request completed. Please verify in RedNote.', '分享请求已完成，请在小红书中确认。'));
    }
    catch (error) { setNotice(error instanceof DOMException && error.name === 'AbortError' ? tr('Share cancelled.', '已取消分享。') : tr('Native sharing failed.', '原生分享失败。')); }
  }

  const actorDirectory = sourceKind === 'archive' ? (
    <section className={styles.archiveInventory} aria-label={tr('Published actor directory', '已公开演员目录')}>
      <label>
        {tr('Browse published actor', '按已公开演员浏览')}
        <select value={archiveActorId} onChange={event => chooseArchiveActor(event.target.value)}>
          <option value="">{tr('All published actors', '所有已公开演员')}</option>
          {publicArchive.directoryActors.map(actor => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
          {archiveActorId && !publicArchive.directoryActors.some(actor => actor.id === archiveActorId) && (
            <option value={archiveActorId}>{archiveActorId}</option>
          )}
        </select>
      </label>
      <span role="status">{publicArchive.directoryLoading
        ? tr('Verifying published actors…', '正在核验已公开演员…')
        : publicArchive.directoryComplete
          ? tr(`${publicArchive.directoryActors.length} verified published actors`, `${publicArchive.directoryActors.length} 位已核验的公开演员`)
          : tr('Actor directory is incomplete; only verified actors are listed.', '演员目录尚不完整；仅列出已核验的演员。')}</span>
      {publicArchive.directoryFreshness && <span role="status">
        {tr(
          `Manifest verification: ${publicArchive.directoryFreshness.verifiedCandidates} of ${publicArchive.directoryFreshness.totalCandidates} candidates. Checked ${new Date(publicArchive.directoryFreshness.verifiedAt).toLocaleString('en-US')}; refresh due ${new Date(publicArchive.directoryFreshness.expiresAt).toLocaleString('en-US')}.`,
          `发布记录核验：${publicArchive.directoryFreshness.verifiedCandidates} / ${publicArchive.directoryFreshness.totalCandidates} 个候选。核验时间：${new Date(publicArchive.directoryFreshness.verifiedAt).toLocaleString('zh-CN')}；下次更新：${new Date(publicArchive.directoryFreshness.expiresAt).toLocaleString('zh-CN')}。`,
        )}
      </span>}
      {publicArchive.directoryNotices.map(message => <p role="status" key={message}>{localizedPublicArchiveMessage(message, locale)}</p>)}
      {publicArchive.directoryError && <p role="alert">{localizedPublicArchiveMessage(publicArchive.directoryError, locale)}</p>}
      {!publicArchive.directoryLoading && !publicArchive.directoryComplete && (
        <button type="button" onClick={publicArchive.retryDirectory}>{tr('Retry actor directory', '重试演员目录')}</button>
      )}
    </section>
  ) : null;

  if (loadError) {
    const loadErrorMessage = locale === 'zh-CN'
      ? loadError === 'Saved collection could not be loaded.'
        ? tr(loadError, '无法加载已收藏的素材。')
        : loadError === 'Today’s Daily Drop inventory could not be loaded.'
          ? tr(loadError, '无法加载今日卡组素材。')
          : !/\p{Script=Han}/u.test(loadError) ? `英文原文错误：${loadError}` : loadError
      : loadError;
    return <div className={styles.notice} role="alert">{loadErrorMessage}</div>;
  }
  if (isPublicArchiveSource && publicArchive.loading) {
    return <>{actorDirectory}<div className={styles.loading} aria-label={sourceKind === 'edition'
      ? tr('Loading public historical edition inventory', '正在加载本期公开素材')
      : tr('Loading public Archive inventory', '正在加载公开典藏素材')
    }><span /><span /><span /></div></>;
  }
  if (isPublicArchiveSource && publicArchive.error && (!pool || pool.length === 0)) {
    return <>{actorDirectory}<div className={styles.notice} role="alert">
      <strong>{tr('Public Archive inventory unavailable.', '公开典藏素材暂时不可用。')}</strong> {localizedPublicArchiveMessage(publicArchive.error, locale)}
      <button type="button" onClick={publicArchive.retryInventory}>{tr('Retry loading editions', '重试加载卡组')}</button>
    </div></>;
  }
  if (!pool || !savedOptions || !smartOptions) {
    return <div className={styles.loading} aria-label={
      isCollectionSource
        ? tr('Loading saved collection', '正在加载收藏夹')
        : sourceKind === 'edition'
          ? tr('Loading public historical edition inventory', '正在加载本期公开素材')
          : sourceKind === 'archive'
            ? tr('Loading public Archive inventory', '正在加载公开典藏素材')
            : tr('Loading Daily Drop inventory', '正在加载今日卡组素材')
    }><span /><span /><span /></div>;
  }
  if (pool.length === 0) {
    return (
      <>{actorDirectory}<div className={styles.empty}>
        <strong>{isCollectionSource
          ? tr('The shelf is empty.', '收藏架还是空的。')
          : isPublicArchiveSource
            ? sourceKind === 'edition'
              ? tr(`No public inventory is available for ${sourceEditionDate || 'this edition'}.`, `${sourceEditionDate || '本期卡组'}暂无公开素材。`)
              : archiveActorId
                ? tr('No verified editions were found for this actor on this page.', '本页未找到该演员已核验的卡组。')
                : tr('No public Archive inventory is available yet.', '暂时还没有可用的公开典藏素材。')
            : tr('Today’s inventory is not ready yet.', '今日素材尚未准备好。')}</strong>
        <span>{isCollectionSource
          ? tr('Save cards or grids first — the Grid Builder assembles editorial sets from saved material.', '先收藏单张图片或网格，再用网格构建器将这些素材编排成专题。')
          : isPublicArchiveSource
            ? sourceKind === 'edition'
              ? tr('This edition is not available in the public inventory. No Collection images were substituted.', '公开素材中暂时没有本期卡组。没有用“我的收藏”中的图片替代。')
              : archiveActorId || publicArchive.hasMore
                ? tr('No verified images are loaded for this selection. Choose another actor or load more editions. No Collection images were substituted.', '当前选择尚未加载已核验的图片。请选择其他演员或加载更多卡组。没有用“我的收藏”中的图片替代。')
                : tr('There are no publicly verified editions to build from. No Collection images were substituted.', '暂时没有已核验的公开卡组可供创作。没有用“我的收藏”中的图片替代。')
            : tr('Return to today’s drop while its approved images finish loading.', '请先返回今日卡组，等待已审核的图片完成加载。')}</span>
        {isPublicArchiveSource && publicArchive.notices.map(message => (
          <span role="status" key={message}>{localizedPublicArchiveMessage(message, locale)}</span>
        ))}
        {isPublicArchiveSource && publicArchive.error && (
          <p role="alert">{localizedPublicArchiveMessage(publicArchive.error, locale)}</p>
        )}
        {sourceKind === 'archive' && publicArchive.hasMore && (
          <button type="button" onClick={() => void publicArchive.loadMore()} disabled={publicArchive.loadingMore}>
            {publicArchive.loadingMore ? tr('Loading editions…', '正在加载卡组…') : tr('Load more editions', '加载更多卡组')}
          </button>
        )}
      </div></>
    );
  }

  return (
    <section className={styles.builder} data-palette={palette?.id || 'default'}>
      <header className={styles.header}>
        <div>
          <h3>{tr('Vibe Atlas Grid Builder', 'Vibe Atlas 网格构建器')}</h3>
          <p>{tr('Start with a smart proposal or choose and arrange every image yourself.', '从智能提案开始，也可以亲自挑选并编排每一张图片。')}</p>
        </div>
        <span>
          {builderMode === 'manual'
             ? tr(`${countLabel(manualCandidates.length, isCollectionSource ? 'saved result' : isPublicArchiveSource ? 'public Archive image' : 'Daily Drop image')} for this star`, `当前演员共 ${countLabel(manualCandidates.length, isCollectionSource ? '条已收藏图片' : isPublicArchiveSource ? '张公开典藏图片' : '张今日图片', locale)}`)
             : tr(`${countLabel(lensedCount, isCollectionSource ? 'saved result' : isPublicArchiveSource ? 'public Archive image' : 'Daily Drop image')} ${lensedCount === 1 ? 'matches' : 'match'} this lens`, `${countLabel(lensedCount, isCollectionSource ? '条已收藏图片' : isPublicArchiveSource ? '张公开典藏图片' : '张今日图片', locale)}符合当前筛选条件`)}
        </span>
      </header>

      {isPublicArchiveSource && (
        <section className={styles.archiveInventory} aria-label={tr('Public Archive inventory', '公开典藏素材')}>
          <div>
            <strong>{sourceKind === 'edition' ? tr(`Public edition · ${sourceEditionDate}`, `公开卡组 · ${sourceEditionDate}`) : tr('Public Vibe Atlas Archive', '氛围图鉴公开典藏')}</strong>
            {sourceKind === 'archive' && <span>{tr(`${publicArchive.editions.length} editions loaded · ${publicArchive.actors.length} stars in loaded editions`, `已加载 ${publicArchive.editions.length} 期卡组 · 涵盖 ${publicArchive.actors.length} 位演员`)}</span>}
          </div>
          {publicArchive.error && <p role="alert">{localizedPublicArchiveMessage(publicArchive.error, locale)}</p>}
          {publicArchive.notices.map(message => <p role="status" key={message}>{localizedPublicArchiveMessage(message, locale)}</p>)}
          {sourceKind === 'archive' && publicArchive.hasMore && (
            <button type="button" onClick={() => void publicArchive.loadMore()} disabled={publicArchive.loadingMore}>
              {publicArchive.loadingMore ? tr('Loading editions…', '正在加载卡组…') : publicArchive.error ? tr('Retry loading editions', '重试加载卡组') : tr('Load more editions', '加载更多卡组')}
            </button>
          )}
        </section>
      )}

      {actorDirectory}
      <div className={styles.benefitBar} role="note">
        {hasCollectorAccess ? (
          <>
            <strong>Fandom Collector</strong>
            <span>{tr(`${benefits.canvasAllowance} canvases · cross-device persistence enabled`, `${benefits.canvasAllowance} 个网格 · 已开启跨设备同步`)}</span>
            {benefits.palettes.length > 0 && (
              <label>
                {tr('Atmosphere', '氛围')}
                <select
                  value={palette?.id || ''}
                  onChange={event => setPalette(
                    benefits.palettes.find(item => item.id === event.target.value) || null,
                  )}
                >
                  <option value="">{tr('Original', '原始样式')}</option>
                  {benefits.palettes.map(item => <option value={item.id} key={item.id}>{locale === 'zh-CN' ? '月夜墨色（英文原名：Moonlit Ink）' : item.name}</option>)}
                </select>
              </label>
            )}
          </>
        ) : (
          <>
            <strong>{tr('Free studio', '免费工作室')}</strong>
            <span>{tr('1 canvas · local saves, rearranging, sharing, and 1080×1080 sRGB export included.', '1 个网格 · 可本地保存、重新编排、分享，并导出 1080×1080 sRGB 图片。')}</span>
          </>
        )}
      </div>

      <div className={styles.modeTabs} role="tablist" aria-label={tr('Grid building method', '网格构建方式')}>
        <button type="button" role="tab" aria-selected={builderMode === 'smart'} onClick={() => chooseBuilderMode('smart')}>
          {tr('Smart Proposal', '智能提案')}
        </button>
        <button type="button" role="tab" aria-selected={builderMode === 'manual'} onClick={() => chooseBuilderMode('manual')}>
          {tr('Build Your Own', '自选编排')}
        </button>
      </div>

      {builderMode === 'smart' && (
        <fieldset className={styles.contractChoice}>
          <legend>{tr('Editorial contract', '编排方式')}</legend>
          <button
            type="button"
            className={styles.contractCard}
            aria-pressed={editorialMode === 'event'}
            onClick={() => chooseEditorialMode('event')}
          >
            <span>{tr('Event', '单场造型 Event')}</span>
            <strong>{tr('No, look closer.', '别急，再看一眼。')}</strong>
            <small>{tr('Stay inside one detected appearance. Nine frames turn repetition into sequence.', '只选同一场造型中的图片。九张相似镜头，排在一起就有了叙事。')}</small>
          </button>
          <button
            type="button"
            className={styles.contractCard}
            aria-pressed={editorialMode === 'compiled'}
            onClick={() => chooseEditorialMode('compiled')}
          >
            <span>{tr('Compiled', '风格合辑 Compiled')}</span>
            <strong>{tr('Look at the range.', '看看变化有多丰富。')}</strong>
            <small>{tr('Build a nine-frame argument across visual families, sources, roles, looks, and moods.', '从视觉系列、来源、角色、造型和氛围中各取所长，编排出九张有观点的图片。')}</small>
          </button>
        </fieldset>
      )}

      {(notice || showSaveNudge) && (
        <div className={styles.notice} role="status">
          {locale === 'zh-CN' && notice && !/\p{Script=Han}/u.test(notice) ? `英文原文提示：${notice}` : notice}
          {showSaveNudge && (
            <span className={styles.saveNudge}>
              {' '}{tr('Grid not saved yet —', '网格尚未保存 —')}{' '}
              <button
                type="button"
                className={styles.saveNudgeBtn}
                onClick={saveGrid}
                disabled={Boolean(busy)}
              >
                💾 {tr('Save to collection?', '保存到收藏夹？')}
              </button>
            </span>
          )}
        </div>
      )}

      <div className={styles.lenses}>
        {isCollectionSource && (
          <LensRow
            label={tr('Collection', '收藏内容')}
            options={[
              {
                value: 'standard',
                label: tr('Ordinary Vibe Atlas', 'Vibe Atlas 常规收藏'),
                count: collectionCounts.standard,
              },
              {
                value: 'misprints',
                label: tr('Legendary Misprints', '传奇误印'),
                count: collectionCounts.misprints,
              },
            ]}
            active={lens.mode || 'standard'}
            onToggle={value => setMode(value as 'standard' | 'misprints')}
          />
        )}
        <LensRow label={tr('Star', '演员')} options={savedOptions.actors} active={lens.actor} onToggle={value => toggle('actor', value)} />
        {builderMode === 'smart' && <LensRow label={tr('Vibe', '氛围')} options={smartOptions.vibes} active={lens.vibe} onToggle={value => toggle('vibe', value)} />}
        {builderMode === 'smart' && familyOptions.length > 0 && (
        <LensRow label={tr('Visual family', '视觉系列')} options={familyOptions} active={lens.familyId} onToggle={value => toggle('familyId', value)} />
        )}
      </div>

      {lens.actor && (
        <section className={styles.sourceNotes} aria-label={tr(`Source notes for ${lens.actor}`, `关于${builderActorDisplayName(lens.actor, smartOptionPool?.find(card => card.actor === lens.actor)?.actorEn || lens.actor, locale)}的来源备注`)}>
          <div className={styles.sourceNotesIntro}>
            <div>
              <strong>{tr('Actor source notes', '演员素材来源备注')}</strong>
              <span>
                {hasCollectorAccess
                  ? tr('Open the editorial searches and visual directions behind this actor pack.', '查看此演员素材包背后的编辑搜索词和视觉方向。')
                  : tr('Collector adds the source searches and editorial directions behind each actor pack.', 'Collector 可查看每个演员素材包背后的搜索词和编辑视觉方向。')}
              </span>
            </div>
            <button
              type="button"
              aria-expanded={sourceNotesOpen}
              onClick={sourceNotesOpen ? () => setSourceNotesOpen(false) : openSourceNotes}
            >
              {sourceNotesOpen ? tr('Hide notes', '收起备注') : hasCollectorAccess ? tr('Open notes', '查看备注') : tr('Preview benefit', '预览会员权益')}
            </button>
          </div>

          {sourceNotesOpen && (
            <div className={styles.sourceNotesBody}>
              {!hasCollectorAccess ? (
                <>
                  <p>{tr('Explore source trails and authoring context without leaving the Builder. Protected searches and notes stay available only to active Collectors.', '无需离开构建器，即可查看来源记录与编辑背景。受保护的搜索词和备注仅向有效 Collector 开放。')}</p>
                  {onUpgrade && <button type="button" className={styles.sourceNotesUpgrade} onClick={onUpgrade}>{tr('Explore Fandom Collector', '了解 Fandom Collector')}</button>}
                </>
              ) : sourceNotesBusy ? (
                <p role="status">{tr('Loading private source notes…', '正在加载私有来源备注…')}</p>
              ) : sourceNotesError ? (
                <p role="status">{sourceNotesError}</p>
              ) : sourceNotes ? (
                <>
                  <div className={styles.sourceNotesList}>
                    {sourceNotes.vibes.map((vibe, index) => (
                      <article key={`${vibe.label_en || vibe.label || 'vibe'}-${index}`}>
                        <strong>{vibe.emoji} {builderVibeDisplayName(vibe.label || '', vibe.label_en || '', locale) || tr('Editorial direction', '编辑方向')}</strong>
                        {vibe.sourceDepth?.queries && vibe.sourceDepth.queries.length > 0 && (
                          <>
                            <small>{tr('Source searches', '来源搜索词')}</small>
                            <ul>{vibe.sourceDepth.queries.map(query => <li key={query}>{builderSourceLabel(query, locale)}</li>)}</ul>
                          </>
                        )}
                        {vibe.sourceDepth?.authoringPrompt && (
                          <>
                            <small>{tr('Authoring note', '编辑备注')}</small>
                            <p>{builderSourceLabel(vibe.sourceDepth.authoringPrompt, locale)}</p>
                          </>
                        )}
                      </article>
                    ))}
                  </div>
                  <footer>{tr('Source: ', '来源：')}{builderSourceLabel(sourceNotes.provenance.attribution, locale)}</footer>
                </>
              ) : null}
            </div>
          )}
        </section>
      )}

      {builderMode === 'smart' && <button type="button" className={styles.propose} onClick={propose} disabled={lensedCount === 0}>
        {proposal
          ? tr(`Re-propose ${proposalTargetSize}-frame ${editorialMode === 'event' ? 'Event' : 'Compiled'} set`, `重新生成 ${proposalTargetSize} 张${editorialMode === 'event' ? '单场造型' : '风格合辑'}提案`)
          : tr(`Propose ${editorialMode === 'event' ? 'Event set' : 'Compiled 3×3'}`, `生成${editorialMode === 'event' ? '单场造型' : '风格合辑 3×3'}提案`)}
      </button>}

      {builderMode === 'manual' && (
        <section className={styles.manualPicker} aria-label={tr('Choose nine saved images', isCollectionSource ? '选择九张已保存图片' : isPublicArchiveSource ? '选择九张公开典藏图片' : '选择九张今日卡组图片')}>
          <div className={styles.manualPickerHeader}>
            <strong>{lens.actor ? tr(`${proposal?.slots.length || 0} of 9 selected`, `已选择 ${proposal?.slots.length || 0}/9 张`) : tr('Choose a star to begin', '先选择一位演员')}</strong>
            <span>{isCollectionSource
              ? tr('Only saved images for the selected actor appear here. Select a placed image to duplicate it intentionally.', '这里只显示所选演员的已收藏图片。再次选择已放入网格的图片，即可有意重复使用。')
              : isPublicArchiveSource
                ? tr('Only publicly verified Archive images for the selected star appear here. Each image links to its permanent edition record.', '这里只显示所选演员已核验的公开典藏图片。每张图片均附永久期次记录链接。')
              : tr('Only images from today’s Daily Drop appear here. Select a placed image to duplicate it intentionally.', '这里只显示今日卡组中的图片。再次选择已放入网格的图片，即可有意重复使用。')}</span>
          </div>
          {lens.actor && manualCandidates.length === 0 ? (
            <div className={styles.notice}>{isPublicArchiveSource
              ? tr(`No loaded public Archive images are available for ${lens.actor}. Load another page or choose another star.`, `已加载的公开典藏中暂无${builderActorDisplayName(lens.actor, smartOptionPool?.find(card => card.actor === lens.actor)?.actorEn || lens.actor, locale)}的图片。请加载下一页，或选择其他演员。`)
              : tr(`Save at least one image for ${lens.actor} to begin a custom grid.`, `请至少收藏一张${builderActorDisplayName(lens.actor, smartOptionPool?.find(card => card.actor === lens.actor)?.actorEn || lens.actor, locale)}的图片，再开始自选编排。`)}</div>
          ) : lens.actor ? (
            <div className={styles.candidateGrid}>
              {manualCandidates.map(card => {
                const selectedIndex = proposal?.slots.findIndex(item => item.key === card.key) ?? -1;
                return (
                  <div className={styles.candidateItem} key={card.key}>
                    <button
                    type="button"
                    aria-pressed={selectedIndex >= 0}
                    aria-label={tr(`${selectedIndex >= 0 ? `Remove position ${selectedIndex + 1}` : 'Select'} ${card.title}`, `${selectedIndex >= 0 ? `移除第 ${selectedIndex + 1} 张` : '选择'}${builderSourceLabel(card.title, locale)}`)}
                    onClick={() => toggleManualCard(card)}
                  >
                    <img src={card.imageUrl} alt="" loading="lazy" />
                    {selectedIndex >= 0 && <span>{selectedIndex + 1}</span>}
                    </button>
                    {card.archiveSource && <a href={path(card.archiveSource.publicRecord.editionPath)} onClick={() => trackImageEditionLink('picker')}>{tr('Edition record ↗', '期次记录 ↗')}</a>}
                  </div>
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
              className={styles.grid}
              role="group"
              aria-label={builderMode === 'manual'
                ? tr('Custom 3×3 grid', '自选 3×3 网格')
                : tr(`Proposed ${proposal.rationale.editorialMode === 'event' ? 'Event' : 'Compiled'} ${proposalTargetSize}-frame set`, `${proposalTargetSize} 张${proposal.rationale.editorialMode === 'event' ? '单场造型' : '风格合辑'}提案`)}
            >
              {proposal.slots.map((card, index) => (
                <div className={styles.slotCell} key={`${card.key}-${index}`}>
                <button
                  type="button"
                  className={styles.slot}
                  aria-pressed={swapSlot === index}
                  title={locale === 'zh-CN' ? `英文原文：${proposal.rationale.slotReasons[index]}` : proposal.rationale.slotReasons[index]}
                  onClick={() => {
                    if (builderMode === 'manual' && swapSlot !== null) swapManualSlots(swapSlot, index);
                    else setSwapSlot(current => (current === index ? null : index));
                  }}
                >
                  <img src={card.imageUrl} alt={builderSourceLabel(card.title, locale)} loading="lazy" />
                  <span>{builderSourceLabel(proposal.rationale.slotReasons[index], locale)}</span>
                </button>
                {card.archiveSource && <a className={styles.slotEditionLink} href={path(card.archiveSource.publicRecord.editionPath)} onClick={() => trackImageEditionLink('slot')} aria-label={tr(`Open public edition record for ${card.title}`, `查看${builderSourceLabel(card.title, locale)}的公开期次记录`)}>{tr('Edition ↗', '本期记录 ↗')}</a>}
                </div>
              ))}
              {builderMode === 'manual' && Array.from({ length: Math.max(0, 9 - proposal.slots.length) }).map((_, index) => (
                <div className={styles.emptySlot} key={`empty-${index}`}>{proposal.slots.length + index + 1}</div>
              ))}
            </div>
            {builderMode === 'manual' && proposal.slots.length > 0 && (
              <div className={styles.arrangeHelp}>
                <span>{swapSlot === null ? tr('Select a filled slot to move or swap it.', '选择一个已放入图片的位置，即可移动或交换。') : tr(`Position ${swapSlot + 1} selected. Choose another slot to swap.`, `已选择第 ${swapSlot + 1} 张图片，请再选一个位置进行交换。`)}</span>
                {swapSlot !== null && (
                  <span>
                    <button type="button" onClick={() => moveManualSlot(swapSlot, -1)} disabled={swapSlot === 0}>{tr('Move earlier', '向前移动')}</button>
                    <button type="button" onClick={() => moveManualSlot(swapSlot, 1)} disabled={swapSlot === proposal.slots.length - 1}>{tr('Move later', '向后移动')}</button>
                    <button type="button" onClick={() => duplicateManualSlot(swapSlot)} disabled={proposal.slots.length >= 9}>{tr('Duplicate selected', '重复使用所选图片')}</button>
                    <button type="button" onClick={() => removeManualSlot(swapSlot)}>{tr('Remove selected', '移除所选图片')}</button>
                  </span>
                )}
              </div>
            )}
            {builderMode === 'smart' && swapSlot !== null && (
              <div className={styles.alternates}>
                <strong>{tr(`Swap slot ${swapSlot + 1} with:`, `将第 ${swapSlot + 1} 张替换为：`)}</strong>
                {proposal.alternates.length === 0 ? (
                  <span className={styles.noAlternates}>{tr('No other cards match this lens.', '没有其他图片符合当前筛选条件。')}</span>
                ) : (
                  <div className={styles.alternateStrip}>
                    {proposal.alternates.map(card => (
                      <div className={styles.alternateItem} key={card.key}>
                      <button type="button" onClick={() => swapInto(swapSlot, card)} title={builderSourceLabel(card.familyLabel, locale)}>
                        <img src={card.imageUrl} alt={builderSourceLabel(card.title, locale)} loading="lazy" />
                      </button>
                      {card.archiveSource && <a href={path(card.archiveSource.publicRecord.editionPath)} onClick={() => trackImageEditionLink('alternate')}>{tr('Edition record ↗', '期次记录 ↗')}</a>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className={styles.rationale} aria-label={tr('Curation rationale', '编排说明')}>
            <div className={styles.rationaleHeader}>
              <div>
                <span>{builderMode === 'manual' || proposal.rationale.manualSwaps.length > 0
                  ? tr('Creator-arranged', '创作者编排')
                  : tr('Automatic proposal', '自动提案')}</span>
                <h4>{tr('Creative brief', '创作简报')}</h4>
              </div>
              {proposal.rationale.editorialMode && (
                <strong>{tr(proposal.rationale.editorialMode === 'event' ? 'Event' : 'Compiled', proposal.rationale.editorialMode === 'event' ? '单场造型' : '风格合辑')} · {proposalTargetSize}</strong>
              )}
            </div>
            {lens.mode === 'misprints' && (
              <p><strong>{tr('Legendary Misprint lens', '传奇误印筛选')}</strong> · {tr('Only creator-marked mismatches are included. Saved grids and exports retain both identities and provenance.', '仅包含由创作者标记的错误匹配。已保存的网格和导出文件会保留双方身份及来源记录。')}</p>
            )}
            {proposalEvidence && builderMode === 'smart' && (
              <dl className={styles.evidence}>
                <div><dt>{tr('Primary family', '主要视觉系列')}</dt><dd>{builderSourceLabel(proposalEvidence.primaryFamily, locale)}</dd></div>
                <div><dt>{tr('Family logic', '系列编排逻辑')}</dt><dd>{proposal.rationale.editorialMode === 'event'
                  ? tr(`One bounded family across ${proposal.slots.length} frames`, `${proposal.slots.length} 张图片均来自同一视觉系列`)
                  : tr(`${proposalEvidence.familyCount} families balanced across nine frames`, `九张图片均衡呈现 ${proposalEvidence.familyCount} 个视觉系列`)}</dd></div>
                <div><dt>{tr('Source trail', '来源记录')}</dt><dd>{tr(`${proposalEvidence.sourceCount} distinct source ${proposalEvidence.sourceCount === 1 ? 'signal' : 'signals'}`, `${proposalEvidence.sourceCount} 条不同来源证据`)}</dd></div>
                {proposal.rationale.familyEvidence && (
                  <div><dt>{tr('Family evidence', '系列证据')}</dt><dd>{proposal.rationale.familyEvidence === 'persisted-event'
                    ? tr('Preserved approved Event family', '已保留获准的单场造型系列')
                    : tr('Shared saved batch provenance', '共享已保存批次的来源记录')}</dd></div>
                )}
              </dl>
            )}
            <pre>{displayRationaleBrief(proposal.rationale, locale)}</pre>
            <div className={styles.actions}>
              <button
                type="button"
                onClick={saveGrid}
                disabled={Boolean(busy) || !proposalComplete || isGridSaved}
                title={isGridSaved ? tr('Already saved to your collection', '此网格已保存到收藏夹') : tr('Save this grid to your collection', '将此网格保存到收藏夹')}
              >
                {busy === 'save' ? tr('Saving…', '正在保存…') : isGridSaved ? tr('✓ Saved', '✓ 已保存') : `💾 ${tr('Save grid', '保存网格')}`}
              </button>
              {isGridSaved && (
                <button
                  type="button"
                  onClick={removeGrid}
                  disabled={Boolean(busy)}
                  title={tr('Remove this grid from your collection', '从收藏夹中移除此网格')}
                >
                  {busy === 'remove' ? tr('Removing…', '正在移除…') : tr('Remove from collection', '从收藏夹移除')}
                </button>
              )}
              <div className={styles.handoffContainer}>
          <button type="button" onClick={() => setHandoffExpanded(value => !value)} disabled={Boolean(busy) || !proposalComplete} className={styles.handoffToggle}>{handoffExpanded ? tr('Close handoff', '关闭发布交接') : tr('Handoff Publishing Grid', '准备发布网格')}</button>
          {handoffExpanded && <div className={styles.handoffPanel}>
            <div className={styles.handoffDestinations}><button type="button" onClick={() => setHandoffDestination('rednote')} aria-pressed={handoffDestination === 'rednote'}>RedNote</button><button type="button" disabled>Weibo</button><button type="button" disabled>Instagram</button><button type="button" disabled>Facebook</button></div>
            {!handoffState ? <button type="button" onClick={() => exportGrid('rednote')} disabled={Boolean(busy)}>{busy === 'export' ? tr('Preparing…', '正在准备…') : tr('1. Prepare RedNote Handoff', '1. 准备小红书发布')}</button> : <div className={styles.handoffReady}>{isHandoffExpired ? <span className={styles.expiredText}>{tr('Handoff expired.', '交接文件已过期。')}</span> : <span className={styles.expiryText}>{tr(`Expires in ${Math.max(0, Math.floor((handoffState.expiresAt - now) / 1000))}s`, `${Math.max(0, Math.floor((handoffState.expiresAt - now) / 1000))} 秒后过期`)}</span>}<div className={styles.handoffActions}><button type="button" onClick={shareToDevice} disabled={isHandoffExpired}>{tr('2a. Share to Device', '2a. 分享到设备')}</button><a href="https://creator.rednote.com/publish/publish" target="_blank" rel="noreferrer" className={isHandoffExpired ? styles.disabledLink : ''} onClick={event => { if (isHandoffExpired) event.preventDefault(); }}>{tr('2b. Open RedNote', '2b. 打开小红书')}</a></div><p className={styles.disclaimer}>{tr('Browser sharing does not prove RedNote received or published anything.', '浏览器分享无法证明小红书已接收或发布任何内容。')}</p></div>}
            <button type="button" className={styles.downloadBtn} onClick={() => exportGrid('download_raw')} disabled={Boolean(busy)}>{tr('Download PNG', '下载 PNG')}</button>
          </div>}
        </div>
        <button type="button" onClick={() => exportGrid()} disabled={Boolean(busy) || !proposalComplete}>
                {busy === 'export' ? tr('Exporting…', '正在导出…') : tr(`📤 Export ${hasCollectorAccess ? 'master' : 'square'} PNG`, `📤 导出${hasCollectorAccess ? ' Master' : '方形'} PNG`)}
              </button>
              {!hasCollectorAccess && onUpgrade && (
                <button type="button" onClick={onUpgrade} disabled={Boolean(busy)}>
                  ✦ {tr('Unlock Collector canvases and palettes', '解锁 Collector 网格和配色')}
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
};

function countLabel(count: number, singular: string, locale: string = 'en'): string {
  return locale === 'zh-CN'
    ? `${count} ${singular}`
    : `${count} ${singular}${count === 1 ? '' : 's'}`;
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
