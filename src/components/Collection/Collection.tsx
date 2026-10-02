import { useEffect, useRef, useState } from 'react';
import { PUBLIC_ROUTE_PATHS } from '../../../shared/public-routes.js';
import {
  dbGetSyncState,
  dbGetVisibleCards,
  dbGetVisibleCardsByScope,
  collectionScopeForCard,
  dbReplaceCardImage,
  normalizeCardForCollection,
  createMisprint,
  createLegendaryMisprint,
  markGridAsLegendaryMisprint,
  dbGetVisibleGrids,
  dbSaveCard,
  dbSaveGrid,
  historicalEditionHref,
  type CardRecord,
  type GridRecord,
  type MisprintLearningScope,
  type MisprintReason,
} from '../../utils/collectionDB';
import { createCollectionDiagnostic } from '../../utils/collectionDiagnostic';
import { MISPRINT_REASONS, misprintReasonDefinition } from '../../utils/misprintReasons';
import {
  persistRemoval,
  forgetPendingRemoval,
  readPendingRemoval,
  rememberPendingRemoval,
  type PendingRemoval,
} from '../../utils/collectionRemoval';
import { starDataFromCollectionGrid } from '../../utils/collectionHistoryModel';
import {
  classifyCollectionMedia,
  recoverCollectionCard,
  recoverCollectionGrid,
  uploadCollectionImage,
} from '../../utils/collectionMedia';
import {
  buildMasterExportManifest,
  buildExportPayload,
  classifyEditionTier,
  saveShareCard,
  prepareShareCard,
  type ExportManifest,
  type ExportProvenanceAsset,
  type ExportVariant,
} from '../../utils/exportCanvas';
import {
  exportDownloadUrl,
  fetchExportHistory,
  GRID_EXPORT_PERSISTED_EVENT,
  gridExportEventFromRecord,
  logGridExport,
  notifyGridExportPersisted,
  retryPendingExportCleanups,
  uploadExportedCard,
  type GridExportPersistedEventDetail,
  type PersistedExportEntry,
} from '../../utils/gridExportLog';
import { ArtifactZoomDialog } from '../ArtifactZoomDialog/ArtifactZoomDialog';
import { GridBuilder } from '../GridBuilder/GridBuilder';
import { isVerifiedMediaReference } from '../../utils/mediaReference';
import { useLocale } from '../../i18n/LocaleProvider';
import {
  getPublicSession,
  hasMergeDecision,
  logoutPublicAccount,
  requestMagicLink,
  resolvePublicCollectionDeletion,
  schedulePublicCollectionSync,
  setDeviceMerge,
  shouldSyncCollection,
  syncPublicCollection,
  type PublicUser,
} from '../../utils/publicAccount';
import styles from './Collection.module.css';
import {
  builderActorDisplayName,
  builderSourceLabel,
  builderVibeDisplayName,
  type BuilderCard,
} from '../../utils/gridBuilder';

const UNDO_WINDOW_MS = 8_000;
const MAX_UPLOADED_MEME_BYTES = 8 * 1024 * 1024;
const SUPPORTED_MEME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

interface Props {
  scope?: 'vibe-atlas' | 'middle-earth';
  initialType?: 'grids' | 'results' | 'builder';
  hasCollectorAccess?: boolean;
  membershipResolved?: boolean;
  isMember?: boolean;
  onUpgrade?: () => void;
  onTypeChange?: (type: 'grids' | 'results' | 'builder') => void;
  builderSourceKind?: 'collection' | 'daily' | 'edition' | 'archive';
  builderSourceEditionDate?: string;
  builderSourcePool?: BuilderCard[];
}

type ExpandedArtifact =
  | { kind: 'grid'; record: GridRecord }
  | { kind: 'card'; record: CardRecord };

const MISPRINT_FILTER = '__misprints__';
type MisprintDraft = {
  reason: MisprintReason;
  unexpectedIdentity: string;
  note: string;
};

function cardRecordKey(card: CardRecord): string {
  return card.localId || card.serverId || card.imageUrl;
}

async function correctLegendaryGridEvidence(grid: GridRecord): Promise<number> {
  const response = await fetch('/.netlify/functions/actor-audits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      action: 'mark_grid_misprint',
      actorId: grid.actorId,
      vibeLabel: grid.vibe,
      gridId: grid.id,
      note: 'Legendary Misprint grid: collectible preserved; source evidence remains negative.',
      candidates: grid.images.map(image => ({
        candidateId: image.resultId,
        query: image.batchKey || grid.searchSpell,
        title: image.title,
        source: image.publisher,
        link: image.sourceUrl,
        thumbnail: image.imageUrl,
      })),
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'The curator correction could not be recorded.');
  return Number(result?.correctedCandidateCount) || 0;
}

export const Collection: React.FC<Props> = ({
  scope = 'vibe-atlas',
  initialType = 'grids',
  hasCollectorAccess = false,
  membershipResolved = true,
  isMember = false,
  onUpgrade,
  onTypeChange,
  builderSourceKind = 'collection',
  builderSourceEditionDate,
  builderSourcePool = [],
}) => {
  const isMiddleEarth = scope === 'middle-earth';
  const { locale, t, path } = useLocale();
  const tr = (english: string, chinese: string) => isMiddleEarth ? english : t(english, chinese);
  const errorText = (error: unknown, english: string, chinese: string) => {
    if (error instanceof Error) {
      return !isMiddleEarth && locale === 'zh-CN' && !/\p{Script=Han}/u.test(error.message)
        ? `英文原文错误：${error.message}`
        : error.message;
    }
    return tr(english, chinese);
  };
  const actorLabel = (actor: string, actorEn: string, actorId?: string) => (
    isMiddleEarth ? actor : builderActorDisplayName(actor, actorEn, locale, actorId)
  );
  const vibeLabel = (vibe: string, vibeEn: string) => (
    isMiddleEarth ? vibe : builderVibeDisplayName(vibe, vibeEn, locale)
  );
  const sourceCopy = (value: string) => isMiddleEarth ? value : builderSourceLabel(value, locale);
  // Owned Collection sync is free. Preserve the existing operator gate on
  // non-C-drama meme records so they cannot reappear in C-drama sync.
  const canSyncCloud = !isMiddleEarth || hasCollectorAccess;
  const canSyncCloudRef = useRef(canSyncCloud);
  canSyncCloudRef.current = canSyncCloud;
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [grids, setGrids] = useState<GridRecord[]>([]);
  const [deletionConflicts, setDeletionConflicts] = useState<Record<string, 'card' | 'grid'>>({});
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<'grids' | 'results' | 'builder'>(
    isMiddleEarth ? 'results' : initialType,
  );
  const isExternalBuilder = !isMiddleEarth && activeType === 'builder' && builderSourceKind !== 'collection';
  const isEditionBuilder = isExternalBuilder && builderSourceKind === 'edition';
  const isArchiveBuilder = isExternalBuilder && builderSourceKind === 'archive';
  const [filterActor, setFilterActor] = useState<string | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [email, setEmail] = useState('');
  const [accountNotice, setAccountNotice] = useState(() => {
    const notice = sessionStorage.getItem('fandom_auth_notice') || '';
    sessionStorage.removeItem('fandom_auth_notice');
    return notice;
  });
  const [needsMergeChoice, setNeedsMergeChoice] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  const [expandedArtifact, setExpandedArtifact] = useState<ExpandedArtifact | null>(null);
  const [failedCardImages, setFailedCardImages] = useState<Record<string, boolean>>({});
  const [failedGridImages, setFailedGridImages] = useState<Record<string, boolean>>({});
  const [misprintDrafts, setMisprintDrafts] = useState<Record<string, MisprintDraft>>({});
  const [exportHistoryRevisions, setExportHistoryRevisions] = useState<Record<string, number>>({});
  const accountIdRef = useRef<string | undefined>(undefined);
  const pendingRemovalRef = useRef<PendingRemoval | null>(null);

  async function loadCollection(accountId = accountIdRef.current) {
    const [visibleCards, visibleGrids, syncState] = await Promise.all([
      dbGetVisibleCardsByScope(accountId, scope),
      dbGetVisibleGrids(accountId),
      dbGetSyncState(),
    ]);
    setDeletionConflicts(accountId ? syncState.remoteDeletionConflictsByAccount?.[accountId] || {} : {});
    const normalizedCards = visibleCards.map(card => normalizeCardForCollection(card));
    if (isMiddleEarth) {
      await Promise.all(normalizedCards
        .filter((card, index) => card !== visibleCards[index])
        .map(card => dbSaveCard(card)));
    }
    setCards(normalizedCards.sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? '')));
    setGrids(isMiddleEarth ? [] : visibleGrids.sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
  }

  useEffect(() => {
    if (!membershipResolved) return;
    const refreshSession = async () => {
      try {
        const session = await getPublicSession();
        accountIdRef.current = session?.accountId;
        setUser(session);
        let shouldSync = false;
        if (session && canSyncCloud) {
          const decided = await hasMergeDecision(session.accountId);
          setNeedsMergeChoice(!decided);
          shouldSync = canSyncCloud && decided && await shouldSyncCollection(session.accountId);
          setSyncEnabled(shouldSync);
        } else {
          setNeedsMergeChoice(false);
          setSyncEnabled(false);
        }

        await recoverPendingRemoval();
        // IndexedDB is the immediate source of truth for this browser. Render it
        // before attempting remote sync so a network/auth failure can never
        // make an existing Collection appear empty.
        await loadCollection(session?.accountId);
        setLoading(false);

        if (session && canSyncCloud && shouldSync) {
          try {
            await syncPublicCollection(session);
            await loadCollection(session.accountId);
            setAccountNotice('');
          } catch (error) {
            setAccountNotice(tr('Saved items on this browser are still shown, but account sync failed: ', '此设备上的收藏仍会显示，但账户同步失败：') + errorText(error, 'try again after reconnecting', '请检查网络后重试。'));
          }
        }

        // Retry any export cleanups that failed on earlier removals — the grid
        // records are already gone locally, so this queue is the only path left
        // to finish deleting their server-side export blobs.  Runs after session
        // resolution so only the matching account's queue entries are retried.
        if (canSyncCloud) void retryPendingExportCleanups(session?.accountId);
      } catch (error) {
        // Session lookup itself may fail while IndexedDB remains healthy. Keep
        // anonymous/device-owned saves visible and report the account problem.
        accountIdRef.current = undefined;
        setUser(null);
        setNeedsMergeChoice(false);
        setSyncEnabled(false);
        await loadCollection();
        setAccountNotice(tr('Saved items on this browser are still shown, but account status could not be checked: ', '此设备上的收藏仍会显示，但暂时无法确认账户状态：') + errorText(error, 'try again after reconnecting', '请检查网络后重试。'));
      } finally {
        setLoading(false);
      }
    };
    void refreshSession();
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel('fandom-collection') : null;
    channel?.addEventListener('message', event => {
      if (event.data?.type === 'session-changed') void refreshSession();
      else void loadCollection();
    });
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'fandom-collection-notify') return;
      if (event.newValue?.startsWith('session-changed:')) void refreshSession();
      else void loadCollection();
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      channel?.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, [membershipResolved, scope, canSyncCloud]);

  useEffect(() => {
    const handleExportPersisted = (event: Event) => {
      const gridId = (event as CustomEvent<GridExportPersistedEventDetail>).detail?.gridId;
      if (!gridId) return;
      setExportHistoryRevisions(current => ({
        ...current,
        [gridId]: (current[gridId] || 0) + 1,
      }));
    };
    window.addEventListener(GRID_EXPORT_PERSISTED_EVENT, handleExportPersisted);
    return () => window.removeEventListener(GRID_EXPORT_PERSISTED_EVENT, handleExportPersisted);
  }, []);

  async function recoverPendingRemoval() {
    const stored = readPendingRemoval();
    if (!stored) return;
    try {
      await persistRemoval(
        stored.pending,
        canSyncCloud ? stored.accountId ?? accountIdRef.current : undefined,
        canSyncCloud,
      );
      forgetPendingRemoval(stored.pending.token);
    } catch (error) {
      setAccountNotice(errorText(error, 'The item could not be removed.', '无法移除此项目。'));
    }
  }

  useEffect(() => () => {
    const pending = pendingRemovalRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timeoutId);
    const cleanupExports = canSyncCloudRef.current;
    void persistRemoval(
      pending,
      cleanupExports ? accountIdRef.current : undefined,
      cleanupExports,
    ).then(() => {
      forgetPendingRemoval(pending.token);
    }).catch(error => {
      sessionStorage.setItem('fandom_auth_notice', errorText(error, 'The item could not be removed.', '无法移除此项目。'));
    });
  }, []);

  async function finalizeRemoval(token: string) {
    const pending = pendingRemovalRef.current;
    if (!pending || pending.token !== token) return;
    pendingRemovalRef.current = null;
    setPendingRemoval(null);
    try {
      await persistRemoval(
        pending,
        canSyncCloud ? accountIdRef.current : undefined,
        canSyncCloud,
      );
      forgetPendingRemoval(pending.token);
    } catch (error) {
      if (pending.kind === 'grid') {
        setGrids(current => sortGrids([...current, pending.record]));
      } else {
        setCards(current => sortCards([...current, pending.record]));
      }
      setAccountNotice(errorText(error, 'The item could not be removed.', '无法移除此项目。'));
    }
  }

  function queueRemoval(removal: Omit<PendingRemoval, 'token' | 'timeoutId'>) {
    if (pendingRemovalRef.current) return;
    const token = crypto.randomUUID();
    const timeoutId = window.setTimeout(() => void finalizeRemoval(token), UNDO_WINDOW_MS);
    const pending = { ...removal, token, timeoutId } as PendingRemoval;
    rememberPendingRemoval(pending, accountIdRef.current);
    pendingRemovalRef.current = pending;
    setPendingRemoval(pending);
    if (pending.kind === 'grid') {
      setGrids(current => current.filter(grid => grid.id !== pending.record.id));
    } else {
      setCards(current => current.filter(card => card.imageUrl !== pending.record.imageUrl));
    }
  }

  function undoRemoval() {
    const pending = pendingRemovalRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timeoutId);
    pendingRemovalRef.current = null;
    setPendingRemoval(null);
    forgetPendingRemoval(pending.token);
    if (pending.kind === 'grid') {
      setGrids(current => sortGrids([...current, pending.record]));
    } else {
      setCards(current => sortCards([...current, pending.record]));
    }
  }

  async function resolveDeletion(kind: 'card' | 'grid', localId: string, decision: 'restore' | 'discard') {
    if (!user) return;
    setBusyKey(`deletion:${localId}`);
    let resolvedLocally = false;
    try {
      await resolvePublicCollectionDeletion(user, kind, localId, decision);
      resolvedLocally = true;
      await loadCollection(user.accountId);
      if (decision === 'restore' && canSyncCloud && await shouldSyncCollection(user.accountId)) {
        await syncPublicCollection(user);
        await loadCollection(user.accountId);
      }
      setAccountNotice(decision === 'restore'
        ? canSyncCloud && await shouldSyncCollection(user.accountId)
          ? tr('This saved copy was restored to your account.', '已将这份收藏恢复到你的账户。')
          : tr('This copy is kept on this device. Turn on Collection sync to restore it to your account.', '这份收藏已保留在此设备上。开启收藏同步后，才能将它恢复到账户。')
        : tr('The older device copy was discarded. Nothing was restored to your account.', '已丢弃另一设备上的旧副本；没有内容恢复到账户。'));
    } catch (error) {
      await loadCollection(user.accountId);
      setAccountNotice(resolvedLocally
        ? tr('This copy was kept on this device, but account sync failed: ', '这份收藏已保留在此设备上，但账户同步失败：') + errorText(error, 'try again after reconnecting', '请检查网络后重试。')
        : errorText(error, 'The deletion choice could not be completed. Please retry.', '无法保存删除选择，请重试。'));
    } finally {
      setBusyKey('');
    }
  }

  function deletionChoice(kind: 'card' | 'grid', localId?: string) {
    if (!user || !localId || deletionConflicts[localId] !== kind) return null;
    return (
      <div className={styles.deletionConflict} role="status">
        <strong>{tr('Deleted on another device', '已在另一台设备上删除')}</strong>
        <p>{tr('This older copy is still saved on this device. It has not been restored to your account. Choose whether to restore it or discard it.', '此设备仍保留着旧副本，但它尚未恢复到账户。请选择恢复这份副本，或将其丢弃。')}</p>
        <div>
          <button type="button" disabled={Boolean(busyKey) || Boolean(pendingRemoval)}
            onClick={() => void resolveDeletion(kind, localId, 'restore')}>
            {busyKey === `deletion:${localId}` ? tr('Working…', '处理中…') : tr('Keep & restore', '保留并恢复')}
          </button>
          <button type="button" disabled={Boolean(busyKey) || Boolean(pendingRemoval)}
            onClick={() => void resolveDeletion(kind, localId, 'discard')}>{tr('Discard this copy', '丢弃此副本')}</button>
        </div>
      </div>
    );
  }

  async function handleMagicLink(event: React.FormEvent) {
    event.preventDefault();
    try {
      setAccountNotice(await requestMagicLink(email));
    } catch (error) {
      setAccountNotice(errorText(error, 'Could not send the sign-in link.', '无法发送登录链接。'));
    }
  }

  async function handleMerge(merge: boolean) {
    if (!user) return;
    if (!canSyncCloud) {
      setNeedsMergeChoice(false);
      setAccountNotice(tr('Your local saves remain on this device. Cloud sync is unavailable here.', '本地收藏仍保存在此设备上，但此处无法使用云端同步。'));
      return;
    }
    try {
      await setDeviceMerge(user.accountId, merge);
      setNeedsMergeChoice(false);
      setSyncEnabled(merge);
      if (merge && canSyncCloud) await syncPublicCollection(user);
      await loadCollection(user.accountId);
      setAccountNotice(merge ? tr('This device is now synced.', '此设备现已开始同步。') : tr('This device’s local saves will stay separate.', '此设备上的本地收藏将保持独立。'));
    } catch (error) {
      setAccountNotice(errorText(error, 'This device could not be synced.', '无法同步此设备。'));
    }
  }

  async function handleLogout() {
    if (!user) return;
    try {
      await logoutPublicAccount(user);
      accountIdRef.current = undefined;
      setUser(null);
      setSyncEnabled(false);
      await loadCollection();
      setAccountNotice(tr('Signed out. Local saves still work on this device.', '已退出登录。本地收藏仍可在此设备上使用。'));
    } catch (error) {
      setAccountNotice(errorText(error, 'Could not sign out.', '无法退出登录。'));
    }
  }

  async function moveCardToScope(card: CardRecord, targetScope: 'vibe-atlas' | 'middle-earth') {
    if (card.misprint || card.legendaryMisprint || collectionScopeForCard(card) === targetScope || busyKey || pendingRemoval) return;
    setBusyKey(`move:${cardRecordKey(card)}`);
    try {
      const movedCard: CardRecord = targetScope === 'middle-earth'
        ? {
          ...card,
          collectionScope: 'middle-earth',
          actor: 'Middle-earth',
          actorEn: 'Middle-earth',
          vibe: card.title || card.vibe,
          vibeEn: 'saved as-is',
          vibeEmoji: '🧙',
          title: card.title || card.vibe,
          sourceRoute: '/memeforge/middle-earth?view=collection',
          contentKind: 'middle-earth-meme',
          searchQuery: undefined,
          gridContext: undefined,
        }
        : {
          ...card,
          collectionScope: 'vibe-atlas',
          contentKind: undefined,
          sourceRoute: card.sourceRoute?.startsWith('/memeforge/middle-earth')
            ? undefined
            : card.sourceRoute,
        };
      await dbSaveCard(movedCard);
      await loadCollection(user?.accountId);
      if (canSyncCloud) schedulePublicCollectionSync();
      setAccountNotice(targetScope === 'middle-earth'
        ? tr('Saved result moved to the Middle-earth collection.', '已将收藏移至中土世界收藏夹。')
        : tr('Saved result moved to the Vibe Atlas collection.', '已将收藏移至 Vibe Atlas 收藏夹。'));
    } catch (error) {
      setAccountNotice(errorText(error, 'The saved result could not be moved.', '无法移动这条收藏。'));
    } finally {
      setBusyKey('');
    }
  }

  async function downloadDiagnosticData() {
    setBusyKey('diagnostic-export');
    try {
      const [diagnosticCards, diagnosticGrids, syncState] = await Promise.all([
        dbGetVisibleCards(user?.accountId),
        dbGetVisibleGrids(user?.accountId),
        dbGetSyncState(),
      ]);
      const exportedAt = new Date();
      const diagnostic = createCollectionDiagnostic(
        diagnosticCards,
        diagnosticGrids,
        syncState,
        exportedAt,
        user?.accountId,
      );
      const blob = new Blob([JSON.stringify(diagnostic, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `fandom-collection-diagnostic-${exportedAt.toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setAccountNotice(
        tr(`Diagnostic data downloaded: ${diagnostic.counts.cards} saved results and ${diagnostic.counts.grids} grids. Nothing in your Collection was changed.`, `诊断数据已下载：${diagnostic.counts.cards} 条收藏结果、${diagnostic.counts.grids} 个网格。收藏内容未作更改。`),
      );
    } catch (error) {
      setAccountNotice(errorText(error, 'Collection diagnostic data could not be downloaded.', '无法下载收藏诊断数据。'));
    } finally {
      setBusyKey('');
    }
  }

  async function markLegendaryMisprint(grid: GridRecord) {
    setBusyKey(`misprint:${grid.id}`);
    try {
      await dbSaveGrid(markGridAsLegendaryMisprint(grid));
      await loadCollection(user?.accountId);
      if (canSyncCloud) schedulePublicCollectionSync();
      setFilterActor(MISPRINT_FILTER);
      try {
        const correctedCount = await correctLegendaryGridEvidence(grid);
      setAccountNotice(tr(`Legendary Misprint preserved. ${correctedCount} source result${correctedCount === 1 ? '' : 's'} will stay out of future curator evidence.`, `已保留为「传奇误印」。这 ${correctedCount} 条来源结果将不会进入今后的策展判断。`));
      } catch (correctionError) {
        setAccountNotice(tr('Legendary Misprint preserved, but curator learning was not recorded: ', '已保留为「传奇误印」，但策展修正未记录：') + errorText(correctionError, 'open Actor Preflight to correct its source evidence.', '请打开 Actor Preflight 修正来源证据。'));
      }
    } catch (error) {
      setAccountNotice(errorText(error, 'The grid could not be marked as a Legendary Misprint.', '无法将此网格标记为「传奇误印」。'));
    } finally {
      setBusyKey('');
    }
  }

  async function markCardMisprint(card: CardRecord, draft: MisprintDraft) {
    const misprintKey = `card-misprint:${cardRecordKey(card)}`;
    const actualIdentity = draft.unexpectedIdentity.trim() || undefined;
    const note = draft.note.trim() || undefined;
    setBusyKey(misprintKey);
    let correctionSaved = false;
    try {
      const response = await fetch('/.netlify/functions/actor-audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'mark_collection_misprint',
          collectionItemId: card.localId || card.serverId || card.imageUrl,
          actorId: card.actorId,
          actorName: card.actor,
          vibeKey: card.vibeKey,
          vibeLabel: card.vibe,
          reason: draft.reason,
          actualIdentity,
          note,
          candidate: {
            candidateId: card.resultId || card.imageUrl,
            query: card.searchQuery || card.gridContext?.batchKey || null,
            title: card.title || null,
            source: card.publisher || null,
            link: card.sourceUrl || null,
            thumbnail: card.imageUrl,
            imageDigest: card.media?.checksum || null,
          },
        }),
      });
      const payload = await response.json().catch(() => null) as {
        error?: string;
        misprint?: {
          receiptId: string;
          sourceRunId?: string | null;
          reason: MisprintReason;
          label: string;
          correctionScope: MisprintLearningScope;
          actualIdentity?: string | null;
          note?: string;
          markedAt: string;
          candidate?: { imageDigest?: string | null };
        };
        calibrationStatus?: 'applied' | 'recorded' | 'submitted' | 'rejected' | 'retracted';
      } | null;
      if (!response.ok || !payload?.misprint) {
        throw new Error(payload?.error || 'The curator correction could not be recorded.');
      }
      correctionSaved = true;
      await dbSaveCard({
        ...card,
        savedAt: new Date().toISOString(),
        misprint: createMisprint(card, {
          reason: payload.misprint.reason,
          label: payload.misprint.label,
          learningScope: payload.misprint.correctionScope,
          calibrationStatus: payload.calibrationStatus || 'submitted',
          unexpectedImageIdentity: payload.misprint.actualIdentity || undefined,
          note: payload.misprint.note,
          imageDigest: payload.misprint.candidate?.imageDigest || undefined,
          sourceRunId: payload.misprint.sourceRunId || undefined,
          correctionReceiptId: payload.misprint.receiptId,
        }, new Date(payload.misprint.markedAt)),
      });
      await loadCollection(user?.accountId);
      if (canSyncCloud) schedulePublicCollectionSync();
      setFilterActor(MISPRINT_FILTER);
      setMisprintDrafts(current => {
        const next = { ...current };
        delete next[misprintKey];
        return next;
      });
      setAccountNotice(payload.calibrationStatus === 'applied'
        ? tr(`${payload.misprint.label} preserved. The collectible stays visible while its correction teaches future curation.`, `已保留为「${sourceCopy(payload.misprint.label)}」。这件收藏会继续显示，同时将修正用于改进后续策展。`)
        : payload.calibrationStatus === 'recorded'
          ? tr(`${payload.misprint.label} preserved. The collectible stays visible and its diagnostic evidence was recorded.`, `已保留为「${sourceCopy(payload.misprint.label)}」。这件收藏会继续显示，诊断证据也已记录。`)
          : payload.calibrationStatus === 'rejected' || payload.calibrationStatus === 'retracted'
            ? tr(`${payload.misprint.label} preserved as a collectible. Its curator correction is no longer active.`, `已将「${sourceCopy(payload.misprint.label)}」作为收藏保留；相关策展修正目前未生效。`)
            : tr(`${payload.misprint.label} preserved. The collectible stays visible and its correction was submitted for curator review.`, `已保留为「${sourceCopy(payload.misprint.label)}」。这件收藏会继续显示，修正已提交策展审核。`));
    } catch (error) {
      setAccountNotice(correctionSaved
        ? tr('Curator correction saved, but the collectible could not be preserved: ', '策展修正已保存，但无法保留这件收藏：') + errorText(error, 'unknown storage error.', '未知存储错误。')
        : errorText(error, 'The curator correction could not be recorded, so the collectible was not changed.', '无法记录策展修正，因此收藏内容未更改。'));
    } finally {
      setBusyKey('');
    }
  }

  async function promoteCardMisprint(card: CardRecord) {
    const identity = card.misprint?.unexpectedImageIdentity?.label
      || card.legendaryMisprint?.unexpectedImageIdentity.label
      || card.misprint?.label
      || 'unexpected result';
    const misprintKey = `card-misprint:${cardRecordKey(card)}`;
    setBusyKey(misprintKey);
    try {
      await dbSaveCard({
        ...card,
        savedAt: new Date().toISOString(),
        legendaryMisprint: createLegendaryMisprint(card, identity),
      });
      await loadCollection(user?.accountId);
      if (canSyncCloud) schedulePublicCollectionSync();
      setFilterActor(MISPRINT_FILTER);
      setAccountNotice(tr('Promoted to Legendary Misprint. Its correction remains negative evidence for the curator.', '已升级为「传奇误印」。此项修正仍作为策展的反面证据保留。'));
    } catch (error) {
      setAccountNotice(errorText(error, 'The Misprint could not be promoted.', '无法升级此误印。'));
    } finally {
      setBusyKey('');
    }
  }

  async function removeLegendaryPromotion(card: CardRecord) {
    const misprintKey = `card-misprint:${cardRecordKey(card)}`;
    setBusyKey(misprintKey);
    try {
      await dbSaveCard({ ...card, savedAt: new Date().toISOString(), legendaryMisprint: undefined });
      await loadCollection(user?.accountId);
      if (canSyncCloud) schedulePublicCollectionSync();
      setAccountNotice(tr('Legendary promotion removed. The result remains a Misprint.', '已取消「传奇误印」升级，结果仍保留为误印。'));
    } catch (error) {
      setAccountNotice(errorText(error, 'The Legendary promotion could not be removed.', '无法取消「传奇误印」升级。'));
    } finally {
      setBusyKey('');
    }
  }

  async function registerCardMedia(event: React.ChangeEvent<HTMLInputElement>, card: CardRecord) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!SUPPORTED_MEME_TYPES.has(file.type)) {
      setAccountNotice(tr('Upload a PNG, JPEG, or WebP image.', '请上传 PNG、JPEG 或 WebP 格式的图片。'));
      return;
    }
    if (file.size > MAX_UPLOADED_MEME_BYTES) {
      setAccountNotice(tr('That image is larger than 8 MB. Choose a smaller image.', '图片超过 8 MB，请选择较小的图片。'));
      return;
    }
    setBusyKey(`media:${cardRecordKey(card)}`);
    try {
      const localId = card.localId || crypto.randomUUID();
      if (!card.localId) await dbSaveCard({ ...card, localId });
      const dataUrl = await readFileAsDataUrl(file);
      const media = await uploadCollectionImage(dataUrl, isMiddleEarth ? 'middle-earth' : 'vibe-atlas', localId);
      await dbReplaceCardImage(card.imageUrl, media);
      await loadCollection(user?.accountId);
      setAccountNotice(tr('The saved result is now backed by a canonical MEDIA reference.', '这条收藏现已关联规范的 MEDIA 媒体记录。'));
    } catch (error) {
      setAccountNotice(errorText(error, 'The image could not be registered in MEDIA.', '无法将图片登记到 MEDIA。'));
    } finally {
      setBusyKey('');
    }
  }

  async function recoverCardMedia(card: CardRecord) {
    const recoveryKey = `recover:${cardRecordKey(card)}`;
    setBusyKey(recoveryKey);
    try {
      const result = await recoverCollectionCard(
        card,
        [],
      );
      await loadCollection(user?.accountId);
      setFailedCardImages(current => {
        const next = { ...current };
        delete next[card.imageUrl];
        return next;
      });
      setAccountNotice(result.recovery.status === 'recovered'
        ? result.reusedExistingMedia
          ? tr('The saved result now uses its verified MEDIA asset.', '这条收藏现已使用经过验证的 MEDIA 媒体资源。')
          : tr('The saved result was recovered into permanent MEDIA storage.', '这条收藏已恢复到永久 MEDIA 存储。')
        : `${tr('This saved result remains visible, but its ', '这条收藏仍会显示，但其')}${tr(mediaClassificationLabel(result.recovery.classification), mediaClassificationLabelZh(result.recovery.classification))}${tr(' could not be recovered: ', '无法恢复：')}${result.recovery.message ? errorText(new Error(result.recovery.message), '', '') : tr('original unavailable.', '原始资源不可用。')}`);
    } catch (error) {
      setAccountNotice(errorText(error, 'The saved result could not be recovered.', '无法恢复这条收藏。'));
    } finally {
      setBusyKey('');
    }
  }

  async function recoverGridMedia(grid: GridRecord) {
    const recoveryKey = `recover-grid:${grid.id}`;
    setBusyKey(recoveryKey);
    try {
      const result = await recoverCollectionGrid(
        grid,
        [],
      );
      await loadCollection(user?.accountId);
      setFailedGridImages(current => {
        const next = { ...current };
        delete next[grid.id];
        return next;
      });
      setAccountNotice(result.recovery.status === 'recovered'
        ? result.reusedExistingMedia
          ? tr('The legacy grid now uses its verified MEDIA asset.', '此旧版网格现已使用经过验证的 MEDIA 媒体资源。')
          : tr('The legacy grid was recovered into permanent MEDIA storage.', '此旧版网格已恢复到永久 MEDIA 存储。')
        : `${tr('This grid remains visible, but its ', '此网格仍会显示，但其')}${tr(mediaClassificationLabel(result.recovery.classification), mediaClassificationLabelZh(result.recovery.classification))}${tr(' could not be recovered: ', '无法恢复：')}${result.recovery.message ? errorText(new Error(result.recovery.message), '', '') : tr('original unavailable.', '原始资源不可用。')}`);
    } catch (error) {
      setAccountNotice(errorText(error, 'The saved grid could not be recovered.', '无法恢复此网格。'));
    } finally {
      setBusyKey('');
    }
  }

  async function exportSavedGrid(grid: GridRecord, variant: Extract<ExportVariant, 'standard' | 'master'>) {
    const exportKey = `export:${variant}:${grid.id}`;
    setBusyKey(exportKey);
    try {
      let exportGrid = grid;
      let manifest: ExportManifest | undefined;
      if (variant === 'master') {
        const assets: ExportProvenanceAsset[] = grid.images.map(image => {
          if (!isVerifiedMediaReference(image.media)) {
            throw new Error(tr('Master Export needs nine materialized MEDIA assets. Recover every image first.', 'Master 导出需要 9 个已实体化的 MEDIA 媒体资源，请先恢复全部图片。'));
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
        manifest = buildMasterExportManifest(grid.id, grid.id, assets);
        exportGrid = {
          ...grid,
          images: grid.images.map(image => ({ ...image, imageUrl: image.media!.deliveryUrl })),
        };
      }
      const starData = starDataFromCollectionGrid(exportGrid);
      let renderedBlob: Blob | null = null;
      const message = await saveShareCard(starData, variant, (blob) => { renderedBlob = blob; });
      try {
        const tier = classifyEditionTier(buildExportPayload(starData).chosen);
        const persistedExportId = renderedBlob ? crypto.randomUUID() : undefined;
        if (renderedBlob && persistedExportId) {
          void uploadExportedCard(grid.id, persistedExportId, renderedBlob, variant, tier, manifest)
            .then((persisted) => {
              if (persisted) notifyGridExportPersisted(grid.id);
            });
        }
        logGridExport(gridExportEventFromRecord(grid, variant, tier, true, persistedExportId));
      } catch (bookkeepingError) {
        console.warn('Post-export logging failed (export succeeded):', bookkeepingError);
      }
      setAccountNotice(message);
    } catch (error) {
      setAccountNotice(errorText(error, 'The grid could not be exported.', '无法导出此网格。'));
    } finally {
      setBusyKey('');
    }
  }

  async function handleMiddleEarthUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!SUPPORTED_MEME_TYPES.has(file.type)) {
      setAccountNotice(tr('Upload a PNG, JPEG, or WebP image.', '请上传 PNG、JPEG 或 WebP 格式的图片。'));
      return;
    }
    if (file.size > MAX_UPLOADED_MEME_BYTES) {
      setAccountNotice(tr('That image is larger than 8 MB. Choose a smaller meme.', '图片超过 8 MB，请选择较小的表情图。'));
      return;
    }

    setBusyKey('upload-meme');
    try {
      const imageUrl = await readFileAsDataUrl(file);
      const title = file.name.replace(/\.[^/.]+$/u, '').trim() || 'Uploaded Middle-earth meme';
      await dbSaveCard({
        localId: crypto.randomUUID(),
        imageUrl,
        thumbnailUrl: imageUrl,
        resultId: `local-upload-${file.name}-${file.lastModified}-${file.size}`,
        actor: 'Middle-earth',
        actorEn: 'Middle-earth',
        vibe: title,
        vibeEn: 'Existing meme · saved as-is',
        vibeEmoji: '🧙',
        capturedDate: new Date().toISOString().slice(0, 10),
        collectionScope: 'middle-earth',
        contentKind: 'middle-earth-meme',
        title,
        publisher: 'Uploaded from your device',
        searchQuery: 'Your uploaded meme',
        sourceRoute: '/memeforge/middle-earth?view=collection',
      });
      await loadCollection(user?.accountId);

      if (canSyncCloud && user && await shouldSyncCollection(user.accountId)) {
        try {
          await syncPublicCollection(user);
          await loadCollection(user.accountId);
          setAccountNotice(tr(`“${file.name}” was uploaded, saved, and registered in MEDIA.`, `已上传并保存“${file.name}”，也已登记到 MEDIA。`));
        } catch (error) {
          setAccountNotice(tr(`“${file.name}” is saved on this device, but MEDIA sync failed: `, `“${file.name}”已保存在此设备上，但 MEDIA 同步失败：`) + errorText(error, 'try again after reconnecting', '请检查网络后重试。'));
        }
      } else {
        if (canSyncCloud) schedulePublicCollectionSync();
        setAccountNotice(tr(`“${file.name}” is saved in this Collection. Sign in and merge this device to register it in MEDIA.`, `“${file.name}”已保存在此收藏夹中。登录并合并此设备后，即可将其登记到 MEDIA。`));
      }
    } catch (error) {
      setAccountNotice(errorText(error, 'The image could not be saved.', '无法保存此图片。'));
    } finally {
      setBusyKey('');
    }
  }

  if (loading) return <div className={styles.loading} role="status">{tr('Loading collection…', '正在加载收藏夹…')}</div>;

  const allActors = Array.from(new Set([
    ...grids.filter(grid => !grid.legendaryMisprint && grid.intent !== 'legendary-misprint').map(grid => grid.actor),
    ...cards.filter(card => !card.misprint && !card.legendaryMisprint).map(card => card.actor),
  ]));
  if (grids.some(grid => grid.legendaryMisprint || grid.intent === 'legendary-misprint') || cards.some(card => card.misprint || card.legendaryMisprint)) {
    allActors.unshift(MISPRINT_FILTER);
  }
  const displayedGrids = filterActor === MISPRINT_FILTER
    ? grids.filter(grid => grid.legendaryMisprint || grid.intent === 'legendary-misprint')
    : filterActor
      ? grids.filter(grid => !grid.legendaryMisprint && grid.intent !== 'legendary-misprint' && grid.actor === filterActor)
      : grids.filter(grid => !grid.legendaryMisprint && grid.intent !== 'legendary-misprint');
  const displayedCards = filterActor === MISPRINT_FILTER
    ? cards.filter(card => card.misprint || card.legendaryMisprint)
    : filterActor
      ? cards.filter(card => !card.misprint && !card.legendaryMisprint && card.actor === filterActor)
      : cards.filter(card => !card.misprint && !card.legendaryMisprint);
  const actorDisplayLabel = (actor: string) => {
    const grid = grids.find(item => item.actor === actor);
    const card = cards.find(item => item.actor === actor);
    return actorLabel(actor, grid?.actorEn || card?.actorEn || actor, grid?.actorId || card?.actorId);
  };

  return (
    <main className={styles.collection}>
      <header className={styles.hero}>
        <div>
          <h2>{isMiddleEarth
            ? 'Middle-earth Collection'
            : isExternalBuilder
              ? isEditionBuilder ? tr('Archive Edition Grid Builder', '典藏期刊网格构建器') : isArchiveBuilder ? tr('Public Archive Grid Builder', '公开典藏网格构建器') : tr('Today’s Grid Builder', '今日网格构建器')
              : tr('Your Collection', '我的收藏夹')}</h2>
          <p>{isMiddleEarth
            ? 'Your separate MemeForge shelf for finished Middle-earth memes.'
            : isExternalBuilder
              ? isEditionBuilder
                ? tr('Rebuild or remix this immutable historical edition. Its images are not added to My Collection.', '使用这期不可更改的历史素材重新编排或改造网格。素材不会添加到「我的收藏夹」。')
                : isArchiveBuilder
                  ? tr('Browse published Star of the Day images across dates and build for free. Individual saves stay separate from your grids and Collection.', '浏览不同日期已发布的每日主角图片，免费编排网格。使用这些素材不会自动收藏单张图片，也不会加入“我的收藏”。')
                  : tr('Build only with the active Star of the Day inventory. Nothing from My Collection is added here.', '这里只能使用今日之星的当前素材构建网格。「我的收藏夹」中的内容不会加入。')
              : tr('Collect individual finds, keep finished worlds, and compose Event or Compiled editorial sets.', '收藏喜欢的单张图片、保存已完成的网格，再将素材编排成「单场造型」或「风格合辑」。')}</p>
        </div>
        {!isExternalBuilder && <div className={styles.heroActions}>
          <span>{isMiddleEarth ? `${cards.length} memes` : tr(`${grids.length} grids · ${cards.length} results`, `${grids.length} 个网格 · ${cards.length} 条单图收藏`)}</span>
          <button
            type="button"
            disabled={Boolean(busyKey)}
            onClick={() => void downloadDiagnosticData()}
          >
            {busyKey === 'diagnostic-export' ? tr('Preparing data…', '正在准备数据…') : tr('Download diagnostic data', '下载诊断数据')}
          </button>
        </div>}
      </header>

      {!isExternalBuilder && <section className={styles.account}>
        {user ? (
          <div className={styles.signedIn}>
            <p>{syncEnabled ? (isMiddleEarth ? 'Middle-earth sync enabled for' : tr('Cloud sync enabled for', '云端同步账户：')) : tr('Signed in as', '当前登录账户：')} <strong>{user.email}</strong></p>
            <button type="button" onClick={() => void handleLogout()}>{tr('Sign out', '退出登录')}</button>
          </div>
        ) : (
          <form onSubmit={handleMagicLink}>
            <label htmlFor="collection-email">{isMiddleEarth
              ? 'Sync Middle-earth memes across devices'
              : tr('Sync grids and saved results across devices', '在不同设备间同步网格和单图收藏')}</label>
            <div>
              <input
                id="collection-email"
                type="email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder={tr('you@example.com', 'you@example.com')}
              />
              <button>{tr('Email sign-in link', '发送邮箱登录链接')}</button>
            </div>
          </form>
        )}
        {needsMergeChoice && (
          <div className={styles.mergeChoice}>
            <p>{tr('Merge this browser’s grids and saved results into your account?', '要将此浏览器中的网格和单图收藏合并到你的账户吗？')}</p>
            <button onClick={() => void handleMerge(true)}>{tr('Merge and sync', '合并并同步')}</button>
            <button onClick={() => void handleMerge(false)}>{tr('Keep separate', '保持独立')}</button>
          </div>
        )}
        {accountNotice && <p className={styles.notice} role="status">{!isMiddleEarth && locale === 'zh-CN' && !/\p{Script=Han}/u.test(accountNotice) ? `英文原文提示：${accountNotice}` : accountNotice}</p>}
      </section>}

      {isExternalBuilder ? (
        <div className={styles.collectionScopeNav}>
          <strong>
            {isEditionBuilder
              ? tr(`Historical edition${builderSourceEditionDate ? ` · ${builderSourceEditionDate}` : ''}`, `历史期次${builderSourceEditionDate ? ` · ${builderSourceEditionDate}` : ''}`)
              : isArchiveBuilder ? tr('Public Archive inventory', '公开典藏素材') : tr('Active Daily Drop inventory', '今日之星当前素材')}
          </strong>
          <div className={styles.collectionScopeActions}>
            <a href={path(isArchiveBuilder ? PUBLIC_ROUTE_PATHS.vibeAtlasArchive : isEditionBuilder && builderSourceEditionDate
              ? `${PUBLIC_ROUTE_PATHS.vibeAtlas}?date=${encodeURIComponent(builderSourceEditionDate)}`
              : PUBLIC_ROUTE_PATHS.vibeAtlas)}>
              {isArchiveBuilder ? tr('Back to the public Archive', '返回公开典藏') : isEditionBuilder ? tr('Back to this edition', '返回本期') : tr('Back to today’s drop', '返回今日卡组')}
            </a>
            {isEditionBuilder && <a href={path(PUBLIC_ROUTE_PATHS.vibeAtlasArchive)}>{tr('Back to the public Archive', '返回公开典藏')}</a>}
          </div>
        </div>
      ) : isMiddleEarth ? (
        <div className={styles.collectionScopeNav}>
          <strong>Saved memes <span>{cards.length}</span></strong>
          <div className={styles.collectionScopeActions}>
            <label className={styles.collectionUpload}>
              {busyKey === 'upload-meme' ? 'Saving image…' : 'Upload and save image'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label="Upload and save a Middle-earth meme"
                disabled={Boolean(busyKey)}
                onChange={event => void handleMiddleEarthUpload(event)}
              />
            </label>
            <a href="/memeforge/middle-earth">Back to MemeForge</a>
          </div>
        </div>
      ) : (
        <nav className={styles.typeTabs} aria-label={tr('Collection artifact type', '收藏夹内容类型')}>
          <button type="button" aria-current={activeType === 'grids'} onClick={() => {
            setActiveType('grids');
            onTypeChange?.('grids');
          }}>
            {tr('Grids', '网格')} <span>{grids.length}</span>
          </button>
          <button type="button" aria-current={activeType === 'results'} onClick={() => {
            setActiveType('results');
            onTypeChange?.('results');
          }}>
            {tr('Saved results', '单图收藏')} <span>{cards.length}</span>
          </button>
          <button type="button" aria-current={activeType === 'builder'} onClick={() => {
            setActiveType('builder');
            onTypeChange?.('builder');
          }}>
            {tr('Grid Builder', '网格构建器')}
          </button>
        </nav>
      )}

      {activeType !== 'builder' && allActors.length > 1 && (
        <div className={styles.filters} aria-label={tr('Filter collection by actor', '按演员筛选收藏')}>
          <button type="button" aria-pressed={filterActor === null} onClick={() => setFilterActor(null)}>{tr('All', '全部')}</button>
          {allActors.map(actor => (
            <button
              type="button"
              key={actor}
              aria-pressed={filterActor === actor}
              onClick={() => setFilterActor(actor)}
            >
              {actor === MISPRINT_FILTER ? tr('🖨️ Misprints', '🖨️ 误印') : actorDisplayLabel(actor)}
            </button>
          ))}
        </div>
      )}

      {activeType === 'builder' ? (
        <GridBuilder
          accountId={user?.accountId}
          hasCollectorAccess={hasCollectorAccess}
          onUpgrade={onUpgrade}
          sourceKind={builderSourceKind}
          sourceEditionDate={builderSourceEditionDate}
          sourcePool={builderSourcePool}
          onCollectionChanged={async () => {
            await loadCollection();
            if (canSyncCloud && user && await shouldSyncCollection(user.accountId)) {
              await syncPublicCollection(user);
            }
          }}
          onExported={() => {
            setActiveType('grids');
            void loadCollection();
          }}
        />
      ) : activeType === 'grids' ? (
        displayedGrids.length === 0 ? (
          <EmptyState
            symbol="▦"
            title={tr('No saved grids yet', '还没有保存的网格')}
            body={tr('Save a grid — from the Grid Builder or the daily Vibe Atlas — to keep its images, search spell, styling, and provenance here.', '在网格构建器或每日 Vibe Atlas 中保存网格，即可在此保留图片、搜索词、样式和来源记录。')}
          />
        ) : (
          <section className={styles.gridArtifacts} aria-label={tr('Saved grids', '已保存的网格')}>
            {displayedGrids.map(grid => (
              <article className={styles.gridArtifact} key={grid.id}>
                <button
                  type="button"
                  className={styles.gridPreviewButton}
                  aria-label={tr(`View ${grid.actor} ${grid.vibe} grid larger`, `放大查看${actorLabel(grid.actor, grid.actorEn, grid.actorId)}的${vibeLabel(grid.vibe, grid.vibeEn)}网格`)}
                  onClick={() => setExpandedArtifact({ kind: 'grid', record: grid })}
                >
                   <GridVisual
                     grid={grid}
                     onImageError={() => setFailedGridImages(current => ({ ...current, [grid.id]: true }))}
                   />
                  <span>{tr('View larger', '放大查看')}</span>
                </button>
                <div className={styles.gridStory}>
                  <div className={styles.gridTitle}>
                    <div>
                      <h3>
                        {grid.legendaryMisprint || grid.intent === 'legendary-misprint'
                           ? tr('🔥 Legendary Misprint', '🔥 传奇误印')
                           : `${grid.vibeEmoji} ${actorLabel(grid.actor, grid.actorEn, grid.actorId)}`}
                      </h3>
                      <p>
                        {grid.legendaryMisprint || grid.intent === 'legendary-misprint'
                           ? tr(`Vibe Atlas × ${grid.legendaryMisprint?.unexpectedActor.name || grid.misprintMetadata?.unexpectedImageIdentities.join(', ') || 'unexpected identity'} · ${grid.vibe}`, `Vibe Atlas × ${sourceCopy(grid.legendaryMisprint?.unexpectedActor.name || grid.misprintMetadata?.unexpectedImageIdentities.join('、') || '意外出现的身份')} · ${vibeLabel(grid.vibe, grid.vibeEn)}`)
                           : vibeLabel(grid.vibe, grid.vibeEn)}
                      </p>
                    </div>
                    <span>{formatDate(grid.capturedDate, locale)}</span>
                  </div>
                  {grid.searchSpell && <p className={styles.spell}>⌕ {sourceCopy(grid.searchSpell)}</p>}
                  {grid.vibeSubtitle && <p className={styles.subtitle}>{sourceCopy(grid.vibeSubtitle)}</p>}
                  {historicalEditionHref(grid) && (
                    <p className={styles.editionSource}>
                      {tr('Historical Daily Drop · ', '历史每日卡组 · ')}
                      <a href={historicalEditionHref(grid)}>
                        {formatDate(grid.sourceProvenance!.editionDate!, locale)}
                      </a>
                    </p>
                  )}
                  <p className={styles.provenance}>
                    {tr(`${grid.images.length} source results · ${grid.rendererVersion}`, `${grid.images.length} 条来源结果 · ${grid.rendererVersion}`)}
                    {grid.legendaryMisprint || grid.intent === 'legendary-misprint'
                      ? tr(' · Intentional Legendary Misprint', ' · 有意保留的传奇误印')
                      : grid.edition.legendary
                        ? tr(' · Legendary', ' · 传奇')
                        : grid.edition.misprint
                          ? tr(' · Misprint', ' · 误印')
                          : ''}
                  </p>
                  {deletionChoice('grid', grid.localId)}
                  {grid.legacyCompositeUrl
                    && (failedGridImages[grid.id] || grid.mediaRecovery?.status === 'unrecoverable') && (
                    <div className={styles.mediaRecovery} role="status">
                      <strong>
                        {tr('Image status: ', '图片状态：')}{tr(mediaClassificationLabel(grid.mediaRecovery?.classification || classifyCollectionMedia(grid)), mediaClassificationLabelZh(grid.mediaRecovery?.classification || classifyCollectionMedia(grid)))}
                      </strong>
                      <span>{grid.mediaRecovery?.message ? sourceCopy(grid.mediaRecovery.message) : tr('This older image is not backed by permanent MEDIA yet.', '这张旧图片尚未保存到永久 MEDIA 存储。')}</span>
                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        onClick={() => void recoverGridMedia(grid)}
                      >
                        {busyKey === `recover-grid:${grid.id}` ? tr('Recovering…', '正在恢复…') : tr('Recover in MEDIA', '在 MEDIA 中恢复')}
                      </button>
                    </div>
                  )}
                   {(() => {
                     const remoteImages = grid.images.filter(image => image.mediaRecovery?.status === 'unrecoverable');
                     if (!remoteImages.length) return null;
                     return (
                       <div className={styles.mediaRecovery} role="status">
                          <strong>{tr('Image status: MEDIA copy incomplete', '图片状态：MEDIA 副本尚未完整')}</strong>
                         <span>
                            {tr(`${remoteImages.length} image${remoteImages.length === 1 ? '' : 's'} still depend${remoteImages.length === 1 ? 's' : ''} on remote sources:`, `${remoteImages.length} 张图片仍依赖远程来源：`)}
                            {' '}{remoteImages.map(image => image.title ? sourceCopy(image.title) : `${tr('position ', '第 ')}${image.gridPosition + 1}${tr('', ' 张')}`).join('、')}。
                         </span>
                       </div>
                     );
                   })()}
                </div>
                <div className={styles.gridActions}>
                  {isMember && <GridPublishingHandoff grid={grid} />}
                  <button
                    type="button"
                    disabled={Boolean(busyKey)}
                     onClick={() => void exportSavedGrid(grid, 'standard')}
                  >
                      {busyKey === `export:standard:${grid.id}` ? tr('Rendering…', '正在生成…') : tr('Export standard PNG', '导出标准 PNG')}
                  </button>
                   {hasCollectorAccess && (
                     <button
                       type="button"
                       disabled={Boolean(busyKey)}
                       onClick={() => void exportSavedGrid(grid, 'master')}
                     >
                        {busyKey === `export:master:${grid.id}` ? tr('Rendering…', '正在生成…') : tr('Export Master PNG', '导出 Master PNG')}
                     </button>
                   )}
                  {!grid.legendaryMisprint && (
                    <button
                      type="button"
                      disabled={Boolean(busyKey)}
                      onClick={() => void markLegendaryMisprint(grid)}
                    >
                      {busyKey === `misprint:${grid.id}` ? tr('Marking…', '正在标记…') : tr('Mark Legendary Misprint', '标记为传奇误印')}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.remove}
                    disabled={Boolean(pendingRemoval)}
                    onClick={() => queueRemoval({ kind: 'grid', record: grid })}
                  >
                    {tr('Remove', '移除')}
                  </button>
                </div>
                <GridExportHistory
                  gridId={grid.id}
                  signedIn={Boolean(user)}
                  refreshRevision={exportHistoryRevisions[grid.id] || 0}
                />
              </article>
            ))}
          </section>
        )
      ) : displayedCards.length === 0 ? (
        <EmptyState
          symbol="☆"
          title={isMiddleEarth ? 'No saved Middle-earth memes yet' : tr('No saved results yet', '还没有单图收藏')}
          body={isMiddleEarth
            ? 'Save an existing meme from MemeForge and it will appear here, separate from your Vibe Atlas collection.'
            : tr('Tap ☆ in the lightbox to collect individual images without duplicating their full grid.', '在放大查看时点按 ☆，即可单独收藏图片，而不必重复保存整张网格。')}
        />
      ) : (
        <section className={styles.savedResults} aria-label={tr('Saved results', '单图收藏')}>
          {displayedCards.map(card => {
            const recordKey = cardRecordKey(card);
            const misprintKey = `card-misprint:${recordKey}`;
            const misprintDraft = misprintDrafts[misprintKey] || {
              reason: 'wrong_actor' as const,
              unexpectedIdentity: '',
              note: '',
            };
            return (
            <article key={recordKey} className={card.contentKind === 'middle-earth-meme' ? styles.memeResult : undefined}>
              <button
                type="button"
                className={styles.resultPreviewButton}
                aria-label={card.contentKind === 'middle-earth-meme'
                  ? tr(`View ${card.title || card.vibe} meme larger`, `放大查看${sourceCopy(card.title || card.vibe)}表情图`)
                  : tr(`View ${card.actor} ${card.vibe} result larger`, `放大查看${actorLabel(card.actor, card.actorEn, card.actorId)}的${vibeLabel(card.vibe, card.vibeEn)}单图`)}
                onClick={() => setExpandedArtifact({ kind: 'card', record: card })}
              >
                 <img
                   src={card.media?.thumbnailUrl || card.thumbnailUrl}
                   alt=""
                   onError={() => setFailedCardImages(current => ({ ...current, [card.imageUrl]: true }))}
                 />
                <span>{tr('View larger', '放大查看')}</span>
              </button>
              <div>
                <strong>{card.vibeEmoji} {card.contentKind === 'middle-earth-meme' ? card.title || card.vibe : actorLabel(card.actor, card.actorEn, card.actorId)}</strong>
                <span>{card.contentKind === 'middle-earth-meme'
                  ? `Middle-earth · ${card.actor} · ${card.memeRework
                    ? 'reworked in MemeForge · original linked'
                    : card.resultId?.startsWith('generated-')
                      ? 'reaction card forged in MemeForge'
                      : 'saved as-is'}`
                  : vibeLabel(card.vibe, card.vibeEn)}</span>
                {card.memeRework && (
                  <>
                    <span>
                      Non-destructive derivative · {card.memeRework.edit.mode === 'cover-and-replace' ? 'cover & replace' : 'added overlay'}
                      {' '}· original: {card.memeRework.original.title}
                    </span>
                    <a href={`/memeforge/middle-earth?rework=${encodeURIComponent(card.localId || card.serverId || card.resultId || '')}`}>
                      Open in rework editor
                    </a>
                  </>
                )}
                {card.legendaryMisprint && (
                  <span>
                    {tr('Legendary Misprint · intended ', '传奇误印 · 预期身份：')}{sourceCopy(card.legendaryMisprint.intendedIdentity.actor)}
                    {' '}· {tr('unexpected ', '意外出现：')}{sourceCopy(card.legendaryMisprint.unexpectedImageIdentity.label)}
                  </span>
                )}
                {card.misprint && !card.legendaryMisprint && (
                  <span>
                    {tr('Misprint · ', '误印 · ')}{sourceCopy(card.misprint.label)} · {tr('intended ', '预期身份：')}{sourceCopy(card.misprint.intendedIdentity.actor)}
                    {card.misprint.unexpectedImageIdentity?.label
                      ? ` · ${tr('unexpected ', '意外出现：')}${sourceCopy(card.misprint.unexpectedImageIdentity.label)}`
                      : ''}
                  </span>
                )}
                {card.contentKind === 'middle-earth-meme' && card.sourceUrl && <a href={card.sourceUrl} target="_blank" rel="noreferrer">{card.publisher ? `Source: ${card.publisher}` : 'Open original source'}</a>}
                 <small>{formatDate(card.capturedDate, isMiddleEarth ? 'en' : locale)}</small>
                 {!card.misprint && !card.legendaryMisprint && (
                   <button
                     type="button"
                     disabled={Boolean(busyKey) || Boolean(pendingRemoval)}
                     onClick={() => void moveCardToScope(card, isMiddleEarth ? 'vibe-atlas' : 'middle-earth')}
                   >
                      {busyKey === `move:${recordKey}` ? tr('Moving…', '正在移动…') : isMiddleEarth ? 'Move to Vibe Atlas' : tr('Move to Middle-earth', '移至中土世界')}
                   </button>
                 )}
                {deletionChoice('card', card.localId)}
                {(!card.thumbnailUrl || failedCardImages[card.imageUrl] || card.mediaRecovery?.status === 'unrecoverable') && (
                  <div className={styles.mediaRecovery} role="status">
                    <strong>
                      {tr('Image status: ', '图片状态：')}{tr(mediaClassificationLabel(card.mediaRecovery?.classification || classifyCollectionMedia(card)), mediaClassificationLabelZh(card.mediaRecovery?.classification || classifyCollectionMedia(card)))}
                    </strong>
                    <span>{card.mediaRecovery?.message ? sourceCopy(card.mediaRecovery.message) : tr('This older image is not backed by permanent MEDIA yet.', '这张旧图片尚未保存到永久 MEDIA 存储。')}</span>
                    <button
                      type="button"
                      disabled={Boolean(busyKey)}
                      onClick={() => void recoverCardMedia(card)}
                    >
                      {busyKey === `recover:${recordKey}` ? tr('Recovering…', '正在恢复…') : tr('Recover in MEDIA', '在 MEDIA 中恢复')}
                    </button>
                  </div>
                )}
                <small>{isMiddleEarth
                  ? card.media ? 'MEDIA-backed' : 'Legacy URL'
                  : card.media ? tr('MEDIA-backed', '由 MEDIA 托管') : tr('Legacy URL', '旧版图片链接')}</small>
              </div>
              {!card.media && (
                <label className={styles.collectionUpload}>
                  {busyKey === `media:${recordKey}` ? tr('Registering…', '正在登记…') : tr('Register replacement in MEDIA', '将替换图片登记到 MEDIA')}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label={tr(`Register a replacement image for ${card.actor} ${card.vibe}`, `为${actorLabel(card.actor, card.actorEn, card.actorId)}的${vibeLabel(card.vibe, card.vibeEn)}登记替换图片`)}
                    disabled={Boolean(busyKey) || Boolean(pendingRemoval)}
                    onChange={event => void registerCardMedia(event, card)}
                  />
                </label>
              )}
              {!isMiddleEarth && (
                <>
                  {!card.misprint && !card.legendaryMisprint && (
                    <details className={styles.misprintControls}>
                      <summary>{tr('Mark Misprint', '标记为误印')}</summary>
                      <div>
                      <label>
                        {tr('Misprint reason', '误印原因')}
                        <select
                          value={misprintDraft.reason}
                          disabled={Boolean(busyKey) || Boolean(pendingRemoval)}
                          onChange={event => setMisprintDrafts(current => ({
                            ...current,
                            [misprintKey]: {
                              ...misprintDraft,
                              reason: event.target.value as MisprintReason,
                            },
                          }))}
                        >
                          {MISPRINT_REASONS.map(reason => (
                            <option key={reason.value} value={reason.value}>{misprintReasonLabel(reason.value, reason.label, locale)}</option>
                          ))}
                        </select>
                      </label>
                      {misprintDraft.reason === 'wrong_actor' && (
                        <label>
                          {tr('Who wandered in?', '哪位演员意外闯入了？')}
                          <input
                            value={misprintDraft.unexpectedIdentity}
                            maxLength={160}
                            placeholder={tr('Zhang Linghe', '张凌赫')}
                            disabled={Boolean(busyKey) || Boolean(pendingRemoval)}
                            onChange={event => setMisprintDrafts(current => ({
                              ...current,
                              [misprintKey]: {
                                ...misprintDraft,
                                unexpectedIdentity: event.target.value,
                              },
                            }))}
                          />
                        </label>
                      )}
                      <label>
                        {tr('Curator note', '策展备注')} <span>({tr('optional', '可选')})</span>
                        <input
                          value={misprintDraft.note}
                          maxLength={400}
                          placeholder={misprintReasonDescription(misprintDraft.reason, locale)}
                          disabled={Boolean(busyKey) || Boolean(pendingRemoval)}
                          onChange={event => setMisprintDrafts(current => ({
                            ...current,
                            [misprintKey]: { ...misprintDraft, note: event.target.value },
                          }))}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={Boolean(busyKey) || Boolean(pendingRemoval)}
                        onClick={() => void markCardMisprint(card, misprintDraft)}
                      >
                        {busyKey === misprintKey ? tr('Teaching curator…', '正在更新策展依据…') : tr('Preserve & teach curator', '保留并用于改进策展')}
                      </button>
                      </div>
                    </details>
                  )}
                  {card.misprint && !card.legendaryMisprint && (
                    <button
                      type="button"
                      disabled={Boolean(busyKey) || Boolean(pendingRemoval)}
                      onClick={() => void promoteCardMisprint(card)}
                    >
                      {busyKey === `card-misprint:${recordKey}` ? tr('Saving…', '正在保存…') : tr('Make Legendary', '升级为传奇误印')}
                    </button>
                  )}
                  {card.legendaryMisprint && (
                    <button
                      type="button"
                      disabled={Boolean(busyKey) || Boolean(pendingRemoval)}
                      onClick={() => void removeLegendaryPromotion(card)}
                    >
                      {busyKey === `card-misprint:${recordKey}` ? tr('Saving…', '正在保存…') : tr('Remove Legendary', '取消传奇误印')}
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                disabled={Boolean(pendingRemoval)}
                onClick={() => queueRemoval({ kind: 'card', record: card })}
              >
                {tr('Remove', '移除')}
              </button>
            </article>
            );
          })}
        </section>
      )}
      {pendingRemoval && (
        <div className={styles.undoToast} role="status" aria-live="polite">
          <span>{pendingRemoval.kind === 'grid' ? tr('Grid removed.', '已移除网格。') : tr('Saved result removed.', '已移除单图收藏。')}</span>
          <button type="button" onClick={undoRemoval}>{tr('Undo', '撤销')}</button>
        </div>
      )}
      {expandedArtifact?.kind === 'grid' && (
        <ArtifactZoomDialog
          title={`${expandedArtifact.record.vibeEmoji} ${actorLabel(expandedArtifact.record.actor, expandedArtifact.record.actorEn, expandedArtifact.record.actorId)}`}
          subtitle={vibeLabel(expandedArtifact.record.vibe, expandedArtifact.record.vibeEn)}
          images={expandedArtifact.record.images.map(image => ({ src: image.imageUrl, alt: sourceCopy(image.title) }))}
          singleImage={Boolean(expandedArtifact.record.legacyCompositeUrl)}
          footer={(() => {
            const grid = expandedArtifact.record;
            const editionHref = historicalEditionHref(grid);
            const archiveSourceLinks = grid.images.flatMap((image, index) => image.archiveSource
              ? [{ index, date: image.archiveSource.date, href: image.archiveSource.publicRecord.editionPath }]
              : []);
            const details = grid.legacyCompositeUrl
              ? tr('Legacy saved share card', '旧版已保存分享卡')
              : `${grid.images.length} source results · ${grid.editorial
                ? `${tr(grid.editorial.mode === 'event' ? 'Event' : 'Compiled', grid.editorial.mode === 'event' ? '单场造型' : '风格合辑')} · ${tr(grid.editorial.arrangement === 'creator-arranged' ? 'creator-arranged' : 'automatic', grid.editorial.arrangement === 'creator-arranged' ? '创作者编排' : '自动编排')} · `
                : ''}${grid.rendererVersion}${grid.legendaryMisprint || grid.intent === 'legendary-misprint'
                ? tr(` · Intentional Legendary Misprint · unexpected ${grid.legendaryMisprint?.unexpectedActor.name || grid.misprintMetadata?.unexpectedImageIdentities.join(', ') || 'identity recorded in provenance'}`, ` · 有意保留的传奇误印 · 意外身份：${grid.legendaryMisprint?.unexpectedActor.name || grid.misprintMetadata?.unexpectedImageIdentities.join('、') || '身份详见来源记录'}`)
                : ''}`;
            return (
              <>
                <span>{details}</span>
                {editionHref && <span className={styles.zoomEditionSource}>
                  {tr('Historical Daily Drop · ', '历史每日卡组 · ')}
                  <a href={editionHref}>{formatDate(grid.sourceProvenance!.editionDate!, locale)}</a>
                </span>}
                {archiveSourceLinks.length > 0 && <nav className={styles.zoomArchiveSources} aria-label={tr('Public Archive source editions', '公开典藏来源期次')}>
                  {archiveSourceLinks.map(source => <a key={`${source.date}:${source.index}`} href={path(source.href)}>{tr(`Image ${source.index + 1} · edition ${formatDate(source.date)}`, `第 ${source.index + 1} 张 · ${formatDate(source.date, locale)}期`)}</a>)}
                </nav>}
              </>
            );
          })()}
          onClose={() => setExpandedArtifact(null)}
        />
      )}
      {expandedArtifact?.kind === 'card' && (
        <ArtifactZoomDialog
          title={expandedArtifact.record.contentKind === 'middle-earth-meme'
            ? `${expandedArtifact.record.vibeEmoji} ${expandedArtifact.record.title || expandedArtifact.record.vibe}`
            : `${expandedArtifact.record.vibeEmoji} ${actorLabel(expandedArtifact.record.actor, expandedArtifact.record.actorEn, expandedArtifact.record.actorId)}`}
          subtitle={expandedArtifact.record.contentKind === 'middle-earth-meme'
            ? expandedArtifact.record.memeRework
              ? `Middle-earth · ${expandedArtifact.record.actor} · MemeForge rework · original preserved`
              : `Middle-earth · ${expandedArtifact.record.actor} · ${expandedArtifact.record.resultId?.startsWith('generated-') ? 'reaction card' : 'saved as-is'}`
            : `${vibeLabel(expandedArtifact.record.vibe, expandedArtifact.record.vibeEn)}${expandedArtifact.record.legendaryMisprint
              ? ` · ${tr('Legendary Misprint: unexpected ', '传奇误印：意外出现 ')}${sourceCopy(expandedArtifact.record.legendaryMisprint.unexpectedImageIdentity.label)}`
              : expandedArtifact.record.misprint
                ? ` · ${tr('Misprint: ', '误印：')}${sourceCopy(expandedArtifact.record.misprint.label)}`
                : ''}`}
          images={[{
            src: expandedArtifact.record.imageUrl || expandedArtifact.record.thumbnailUrl,
            alt: sourceCopy(expandedArtifact.record.title || `${expandedArtifact.record.actor} · ${expandedArtifact.record.vibe}`),
          }]}
          singleImage
          footer={expandedArtifact.record.contentKind === 'middle-earth-meme'
            ? `${expandedArtifact.record.publisher || 'Publisher unknown'} · Rights status unknown · ${expandedArtifact.record.memeRework
              ? `Derivative of “${expandedArtifact.record.memeRework.original.title}” · `
              : ''}${formatDate(expandedArtifact.record.capturedDate, 'en')}`
            : formatDate(expandedArtifact.record.capturedDate, locale)}
          onClose={() => setExpandedArtifact(null)}
        />
      )}
    </main>
  );
};

/**
 * Past persisted exports of a saved grid, with a re-download action for each.
 * History is loaded lazily on first expand — export storage is server-side
 * and account-scoped, so anonymous visitors are pointed at sign-in instead.
 */
function GridPublishingHandoff({ grid }: { grid: GridRecord }) {
  const { locale, t } = useLocale();
  const tr = t;
  const errorMessage = (error: unknown, english: string, chinese: string) => error instanceof Error
    ? locale === 'zh-CN' && !/\p{Script=Han}/u.test(error.message) ? `英文原文错误：${error.message}` : error.message
    : tr(english, chinese);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [prepared, setPrepared] = useState<{
    objectUrl: string;
    file: File;
    expiresAt: number;
  } | null>(null);

  useEffect(() => {
    if (!prepared) return;
    const remaining = prepared.expiresAt - Date.now();
    const timeout = window.setTimeout(() => setPrepared(null), Math.max(0, remaining));
    const url = prepared.objectUrl;
    return () => {
      window.clearTimeout(timeout);
      URL.revokeObjectURL(url);
    };
  }, [prepared]);

  async function prepareHandoff() {
    if (busy) return;
    setBusy(true);
    setNotice(tr('Preparing the exact saved grid…', '正在准备完全一致的已保存网格…'));
    try {
      const starData = starDataFromCollectionGrid(grid);
      let renderedBlob: Blob | null = null;
      const artifact = await prepareShareCard(starData, 'raw', blob => {
        renderedBlob = blob;
      });
      if (renderedBlob) {
        const tier = classifyEditionTier(buildExportPayload(starData).chosen);
        void uploadExportedCard(grid.id, crypto.randomUUID(), renderedBlob, 'raw', tier);
      }
      setPrepared({
        objectUrl: artifact.objectUrl,
        file: artifact.file,
        expiresAt: Date.now() + 120_000,
      });
      setNotice(tr('Handoff prepared for two minutes.', '发布交接文件已准备好，有效期为两分钟。'));
    } catch (error) {
      setNotice(errorMessage(error, 'The publishing handoff could not be prepared.', '无法准备发布交接文件。'));
    } finally {
      setBusy(false);
    }
  }

  async function sharePrepared() {
    if (!prepared || prepared.expiresAt <= Date.now()) {
      setPrepared(null);
      setNotice(tr('This handoff expired. Prepare it again.', '交接文件已过期，请重新准备。'));
      return;
    }
    const shareData: ShareData = { files: [prepared.file] };
    if (
      typeof navigator.share !== 'function'
      || typeof navigator.canShare !== 'function'
      || !navigator.canShare(shareData)
    ) {
      setNotice(tr('Native file sharing is unavailable here. Use Download PNG.', '此设备不支持原生文件分享，请使用「下载 PNG」。'));
      return;
    }
    try {
      await navigator.share(shareData);
      setNotice(tr('Share sheet closed. This does not prove publication.', '分享面板已关闭；这不代表内容已发布。'));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setNotice(tr('Sharing cancelled. Nothing was downloaded.', '已取消分享，未下载文件。'));
        return;
      }
      setNotice(tr('Native sharing failed. Use Download PNG.', '原生分享失败，请使用「下载 PNG」。'));
    }
  }

  function downloadPrepared() {
    if (!prepared || prepared.expiresAt <= Date.now()) {
      setPrepared(null);
      setNotice(tr('This handoff expired. Prepare it again.', '交接文件已过期，请重新准备。'));
      return;
    }
    const link = document.createElement('a');
    link.href = prepared.objectUrl;
    link.download = prepared.file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setNotice(tr('PNG downloaded.', 'PNG 已下载。'));
  }

  return (
    <div className={styles.publishingHandoff}>
      <button type="button" onClick={() => setExpanded(current => !current)}>
        {expanded ? tr('Close handoff', '关闭发布交接') : tr('Handoff Publishing Grid', '准备发布网格')}
      </button>
      {expanded && (
        <div className={styles.publishingHandoffPanel}>
          <strong>RedNote</strong>
          {!prepared ? (
            <button type="button" onClick={() => void prepareHandoff()} disabled={busy}>
              {busy ? tr('Preparing…', '正在准备…') : tr('Prepare RedNote handoff', '准备小红书发布')}
            </button>
          ) : (
            <div className={styles.publishingHandoffActions}>
              <button type="button" onClick={() => void sharePrepared()}>{tr('Share to device', '分享到设备')}</button>
              <button type="button" onClick={downloadPrepared}>{tr('Download PNG', '下载 PNG')}</button>
              <a href="https://creator.rednote.com/publish/publish" target="_blank" rel="noreferrer">
                {tr('Open RedNote', '打开小红书')}
              </a>
            </div>
          )}
          <span>{tr('Weibo · Instagram · Facebook — coming next', '微博 · Instagram · Facebook — 后续推出')}</span>
          <small>{tr('Opening RedNote or closing the share sheet does not prove publication.', '打开小红书或关闭分享面板，都不能证明内容已经发布。')}</small>
          {notice && <p role="status">{notice}</p>}
        </div>
      )}
    </div>
  );
}


function GridExportHistory({
  gridId,
  signedIn,
  refreshRevision,
}: {
  gridId: string;
  signedIn: boolean;
  refreshRevision: number;
}) {
  const { locale, t } = useLocale();
  const tr = t;
  const [entries, setEntries] = useState<PersistedExportEntry[] | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const historyRequestRef = useRef(0);

  async function loadHistory(force = false) {
    if (!force && (entries || loadingHistory)) return;
    const requestId = historyRequestRef.current + 1;
    historyRequestRef.current = requestId;
    setLoadingHistory(true);
    setHistoryError('');
    try {
      const nextEntries = await fetchExportHistory(gridId);
      if (historyRequestRef.current === requestId) setEntries(nextEntries);
    } catch (error) {
      if (historyRequestRef.current === requestId) {
          setHistoryError(error instanceof Error
            ? locale === 'zh-CN' && !/\p{Script=Han}/u.test(error.message) ? `英文原文错误：${error.message}` : error.message
            : tr('Export history could not be loaded.', '无法加载导出记录。'));
      }
    } finally {
      if (historyRequestRef.current === requestId) setLoadingHistory(false);
    }
  }

  useEffect(() => {
    if (!signedIn || refreshRevision === 0) return;
    void loadHistory(true);
  }, [refreshRevision, signedIn]);

  if (!signedIn) return null;

  return (
    <details
      className={styles.exportHistory}
      onToggle={event => { if ((event.target as HTMLDetailsElement).open) void loadHistory(); }}
    >
      <summary>{tr('Past exports', '过往导出')}</summary>
      {loadingHistory && <span className={styles.exportHistoryNote}>{tr('Loading export history…', '正在加载导出记录…')}</span>}
      {historyError && <span className={styles.exportHistoryNote} role="alert">{historyError}</span>}
      {entries && entries.length === 0 && (
        <span className={styles.exportHistoryNote}>
          {tr('No stored exports yet — export this grid and the rendered card will be kept here.', '还没有保存的导出文件。导出此网格后，生成的图片会保存在这里。')}
        </span>
      )}
      {entries && entries.length > 0 && (
        <ul>
          {[...entries].reverse().map(entry => (
            <li key={entry.exportId}>
              <span>
                {formatDate(entry.exportedAt.slice(0, 10), locale)}
                {' · '}{exportVariantLabel(entry.variant, locale)}
                {entry.tier && entry.tier !== 'standard' ? ` · ${locale === 'zh-CN' ? `英文原文：${entry.tier}` : entry.tier}` : ''}
              </span>
              <a href={exportDownloadUrl(gridId, entry.exportId)} download>
                {tr('Re-download', '重新下载')}
              </a>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function exportVariantLabel(variant: ExportVariant, locale: string = 'en'): string {
  if (locale === 'zh-CN' && variant === 'master') return 'Master 导出';
  if (locale === 'zh-CN' && variant === 'standard') return '标准导出';
  if (variant === 'master') return 'Master';
  if (variant === 'standard') return 'Standard';
  return variant;
}

function GridVisual({
  grid,
  onImageError,
}: {
  grid: GridRecord;
  onImageError?: () => void;
}) {
  const isLegacy = Boolean(grid.legacyCompositeUrl);
  const compositionClass = grid.images.length === 4
    ? styles.gridTwoByTwo
    : grid.images.length === 6
      ? styles.gridTwoByThree
      : grid.images.length === 12
        ? styles.gridFourByThree
        : styles.gridThreeByThree;
  return (
    <span
      className={[
        styles.gridPreview,
        compositionClass,
        isLegacy ? styles.legacyPreview : '',
      ].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
       {grid.images.slice(0, 12).map(image => (
          <img key={image.resultId} src={image.media?.deliveryUrl || image.imageUrl} alt="" onError={onImageError} />
      ))}
    </span>
  );
}

function sortGrids(grids: GridRecord[]): GridRecord[] {
  return grids.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

function sortCards(cards: CardRecord[]): CardRecord[] {
  return cards.sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''));
}

function EmptyState({ symbol, title, body }: { symbol: string; title: string; body: string }) {
  return (
    <div className={styles.empty}>
      <span>{symbol}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('The selected image could not be read.'));
    reader.onerror = () => reject(reader.error || new Error('The selected image could not be read.'));
    reader.readAsDataURL(file);
  });
}

function formatDate(value: string, locale: string = 'en'): string {
  return new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(`${value}T12:00:00`));
}

function mediaClassificationLabel(
  classification: ReturnType<typeof classifyCollectionMedia>,
): string {
  if (classification === 'legacy-composite') return 'legacy composite';
  if (classification === 'media-backed') return 'MEDIA-backed asset';
  return 'URL-only image';
}

function mediaClassificationLabelZh(
  classification: ReturnType<typeof classifyCollectionMedia>,
): string {
  if (classification === 'legacy-composite') return '旧版拼接图';
  if (classification === 'media-backed') return 'MEDIA 托管资源';
  return '仅有图片链接';
}

function misprintReasonLabel(reason: MisprintReason, english: string, locale: string): string {
  if (locale !== 'zh-CN') return english;
  const labels: Record<MisprintReason, string> = {
    wrong_actor: '别的演员跑来啦',
    wrong_vibe: '是他本人，氛围却不对',
    query_mismatch: '搜索词跑偏了',
    misleading_metadata: '元数据说法不可信',
    composite_or_collage: '九个人挤在一件风衣里',
    bad_asset: '图片出了问题',
    duplicate: '同一位演员，同一张照片',
    ranking_bug: '机器开始犯迷糊',
    other: '其他误印',
  };
  return labels[reason] || english;
}

function misprintReasonDescription(reason: MisprintReason, locale: string): string {
  const english = misprintReasonDefinition(reason).description;
  if (locale !== 'zh-CN') return english;
  const descriptions: Record<MisprintReason, string> = {
    wrong_actor: '不是这位演员。请阻止此图片出现在当前演员的素材中。',
    wrong_vibe: '演员没错，但氛围不对。只排除此演员 × 氛围组合中的这张图。',
    query_mismatch: '搜索词跑偏了。移除此结果，但保留搜索记录。',
    misleading_metadata: '元数据中的说法不可靠，请降低对这条证据的信任。',
    composite_or_collage: '拼接图或合照。请在所有地方隔离此资源。',
    bad_asset: '图片损坏、过小或无法使用。请在所有地方隔离此资源。',
    duplicate: '当前网格中的重复图片。替换它，不改变身份判断。',
    ranking_bug: '产品或排序问题。保留工程证据，不作为审美校准。',
    other: '仅在本地移除此图片，并保留说明，不影响其他内容。',
  };
  return descriptions[reason] || english;
}
