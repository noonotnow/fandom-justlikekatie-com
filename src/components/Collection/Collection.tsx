import { useEffect, useRef, useState } from 'react';
import {
  dbGetVisibleCardsByScope,
  dbReplaceCardImage,
  normalizeCardForCollection,
  createLegendaryMisprint,
  markGridAsLegendaryMisprint,
  dbGetVisibleGrids,
  dbSaveCard,
  dbSaveGrid,
  type CardRecord,
  type GridRecord,
} from '../../utils/collectionDB';
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
import { buildExportPayload, classifyEditionTier, saveShareCard } from '../../utils/exportCanvas';
import {
  exportDownloadUrl,
  fetchExportHistory,
  retryPendingExportCleanups,
  uploadExportedCard,
  type PersistedExportEntry,
} from '../../utils/gridExportLog';
import { ArtifactZoomDialog } from '../ArtifactZoomDialog/ArtifactZoomDialog';
import { GridBuilder } from '../GridBuilder/GridBuilder';
import {
  getPublicSession,
  hasMergeDecision,
  logoutPublicAccount,
  requestMagicLink,
  schedulePublicCollectionSync,
  setDeviceMerge,
  shouldSyncCollection,
  syncPublicCollection,
  type PublicUser,
} from '../../utils/publicAccount';
import styles from './Collection.module.css';
import type { CreatorDraftResult } from '../../utils/creatorDraft';
import type { CreatorPlatform } from '../../utils/creatorDraft';
import { CreatorPostAction } from '../CreatorPostAction/CreatorPostAction';

const UNDO_WINDOW_MS = 8_000;
const MAX_UPLOADED_MEME_BYTES = 8 * 1024 * 1024;
const SUPPORTED_MEME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

interface Props {
  scope?: 'vibe-atlas' | 'middle-earth';
  initialType?: 'grids' | 'results' | 'builder';
  isAdmin?: boolean;
  isMember?: boolean;
  onUpgrade?: () => void;
  onTypeChange?: (type: 'grids' | 'results' | 'builder') => void;
  onCreateFromGrid?: (grid: GridRecord, platforms: CreatorPlatform[]) => Promise<CreatorDraftResult>;
}

type ExpandedArtifact =
  | { kind: 'grid'; record: GridRecord }
  | { kind: 'card'; record: CardRecord };

const LEGENDARY_MISPRINT_FILTER = '__legendary-misprints__';

export const Collection: React.FC<Props> = ({
  scope = 'vibe-atlas',
  initialType = 'grids',
  isAdmin = false,
  isMember = false,
  onUpgrade,
  onTypeChange,
  onCreateFromGrid,
}) => {
  const isMiddleEarth = scope === 'middle-earth';
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [grids, setGrids] = useState<GridRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<'grids' | 'results' | 'builder'>(
    isMiddleEarth ? 'results' : initialType,
  );
  const [filterActor, setFilterActor] = useState<string | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [email, setEmail] = useState('');
  const [accountNotice, setAccountNotice] = useState(() => {
    const notice = sessionStorage.getItem('fandom_auth_notice') || '';
    sessionStorage.removeItem('fandom_auth_notice');
    return notice;
  });
  const [needsMergeChoice, setNeedsMergeChoice] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  const [expandedArtifact, setExpandedArtifact] = useState<ExpandedArtifact | null>(null);
  const [failedCardImages, setFailedCardImages] = useState<Record<string, boolean>>({});
  const [failedGridImages, setFailedGridImages] = useState<Record<string, boolean>>({});
  const accountIdRef = useRef<string | undefined>(undefined);
  const pendingRemovalRef = useRef<PendingRemoval | null>(null);

  async function loadCollection(accountId = accountIdRef.current) {
    const [visibleCards, visibleGrids] = await Promise.all([
      dbGetVisibleCardsByScope(accountId, scope),
      dbGetVisibleGrids(accountId),
    ]);
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
    const refreshSession = async () => {
      try {
        const session = await getPublicSession();
        accountIdRef.current = session?.accountId;
        setUser(session);
        let shouldSync = false;
        if (session) {
          const decided = await hasMergeDecision(session.accountId);
          setNeedsMergeChoice(!decided);
          shouldSync = decided && await shouldSyncCollection(session.accountId);
        } else {
          setNeedsMergeChoice(false);
        }

        await recoverPendingRemoval();
        // IndexedDB is the immediate source of truth for this browser. Render it
        // before attempting remote sync so a network/auth failure can never
        // make an existing Collection appear empty.
        await loadCollection(session?.accountId);
        setLoading(false);

        if (session && shouldSync) {
          try {
            await syncPublicCollection(session);
            await loadCollection(session.accountId);
            setAccountNotice('');
          } catch (error) {
            setAccountNotice(
              `Saved items on this browser are still shown, but account sync failed: ${messageFrom(error, 'try again after reconnecting')}`,
            );
          }
        }

        // Retry any export cleanups that failed on earlier removals — the grid
        // records are already gone locally, so this queue is the only path left
        // to finish deleting their server-side export blobs.  Runs after session
        // resolution so only the matching account's queue entries are retried.
        void retryPendingExportCleanups(session?.accountId);
      } catch (error) {
        // Session lookup itself may fail while IndexedDB remains healthy. Keep
        // anonymous/device-owned saves visible and report the account problem.
        accountIdRef.current = undefined;
        setUser(null);
        setNeedsMergeChoice(false);
        await loadCollection();
        setAccountNotice(
          `Saved items on this browser are still shown, but account status could not be checked: ${messageFrom(error, 'try again after reconnecting')}`,
        );
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
  }, [scope]);

  async function recoverPendingRemoval() {
    const stored = readPendingRemoval();
    if (!stored) return;
    try {
      await persistRemoval(stored.pending, stored.accountId ?? accountIdRef.current);
      forgetPendingRemoval(stored.pending.token);
    } catch (error) {
      setAccountNotice(messageFrom(error, 'The item could not be removed.'));
    }
  }

  useEffect(() => () => {
    const pending = pendingRemovalRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timeoutId);
    void persistRemoval(pending, accountIdRef.current).then(() => {
      forgetPendingRemoval(pending.token);
    }).catch(error => {
      sessionStorage.setItem('fandom_auth_notice', messageFrom(error, 'The item could not be removed.'));
    });
  }, []);

  async function finalizeRemoval(token: string) {
    const pending = pendingRemovalRef.current;
    if (!pending || pending.token !== token) return;
    pendingRemovalRef.current = null;
    setPendingRemoval(null);
    try {
      await persistRemoval(pending, accountIdRef.current);
      forgetPendingRemoval(pending.token);
    } catch (error) {
      if (pending.kind === 'grid') {
        setGrids(current => sortGrids([...current, pending.record]));
      } else {
        setCards(current => sortCards([...current, pending.record]));
      }
      setAccountNotice(messageFrom(error, 'The item could not be removed.'));
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

  async function handleMagicLink(event: React.FormEvent) {
    event.preventDefault();
    try {
      setAccountNotice(await requestMagicLink(email));
    } catch (error) {
      setAccountNotice(messageFrom(error, 'Could not send the sign-in link.'));
    }
  }

  async function handleMerge(merge: boolean) {
    if (!user) return;
    try {
      await setDeviceMerge(user.accountId, merge);
      setNeedsMergeChoice(false);
      if (merge) await syncPublicCollection(user);
      await loadCollection(user.accountId);
      setAccountNotice(merge ? 'This device is now synced.' : 'This device’s local saves will stay separate.');
    } catch (error) {
      setAccountNotice(messageFrom(error, 'This device could not be synced.'));
    }
  }

  async function handleLogout() {
    if (!user) return;
    try {
      await logoutPublicAccount(user);
      accountIdRef.current = undefined;
      setUser(null);
      await loadCollection();
      setAccountNotice('Signed out. Local saves still work on this device.');
    } catch (error) {
      setAccountNotice(messageFrom(error, 'Could not sign out.'));
    }
  }

  async function moveCardToScope(card: CardRecord) {
    const targetScope = isMiddleEarth ? 'vibe-atlas' : 'middle-earth';
    const moveKey = `move:${card.localId || card.imageUrl}`;
    setBusyKey(moveKey);
    try {
      await dbSaveCard({
        ...card,
        collectionScope: targetScope,
        contentKind: targetScope === 'middle-earth' ? 'middle-earth-meme' : undefined,
      });
      await loadCollection(user?.accountId);
      schedulePublicCollectionSync();
      setAccountNotice(
        targetScope === 'middle-earth'
          ? 'Saved result moved to the Middle-earth Collection.'
          : 'Saved result moved to the Vibe Atlas Collection.',
      );
    } catch (error) {
      setAccountNotice(messageFrom(error, 'The saved result could not be moved.'));
    } finally {
      setBusyKey('');
    }
  }

  async function markLegendaryMisprint(grid: GridRecord) {
    setBusyKey(`misprint:${grid.id}`);
    try {
      await dbSaveGrid(markGridAsLegendaryMisprint(grid));
      await loadCollection(user?.accountId);
      schedulePublicCollectionSync();
      setFilterActor(LEGENDARY_MISPRINT_FILTER);
      setAccountNotice('Legendary Misprint preserved. It is separated from ordinary actor filters and Builder proposals.');
    } catch (error) {
      setAccountNotice(messageFrom(error, 'The grid could not be marked as a Legendary Misprint.'));
    } finally {
      setBusyKey('');
    }
  }

  async function markCardLegendaryMisprint(card: CardRecord) {
    const unexpectedIdentity = window.prompt(
      'Who or what is unexpectedly shown in this image? This is saved as creator-entered provenance; the image is not analyzed.',
      '',
    )?.trim();
    if (!unexpectedIdentity) return;
    const misprintKey = `card-misprint:${card.localId || card.imageUrl}`;
    setBusyKey(misprintKey);
    try {
      await dbSaveCard({
        ...card,
        savedAt: new Date().toISOString(),
        legendaryMisprint: createLegendaryMisprint(card, unexpectedIdentity),
      });
      await loadCollection(user?.accountId);
      schedulePublicCollectionSync();
      setFilterActor(LEGENDARY_MISPRINT_FILTER);
      setAccountNotice('Saved as an intentional Legendary Misprint. It now appears only in the Misprints lens.');
    } catch (error) {
      setAccountNotice(messageFrom(error, 'The Legendary Misprint could not be saved.'));
    } finally {
      setBusyKey('');
    }
  }

  async function restoreOrdinaryResult(card: CardRecord) {
    const misprintKey = `card-misprint:${card.localId || card.imageUrl}`;
    setBusyKey(misprintKey);
    try {
      await dbSaveCard({ ...card, savedAt: new Date().toISOString(), legendaryMisprint: undefined });
      await loadCollection(user?.accountId);
      schedulePublicCollectionSync();
      setAccountNotice('Restored as an ordinary saved result.');
    } catch (error) {
      setAccountNotice(messageFrom(error, 'The saved result could not be restored.'));
    } finally {
      setBusyKey('');
    }
  }

  async function registerCardMedia(event: React.ChangeEvent<HTMLInputElement>, card: CardRecord) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!SUPPORTED_MEME_TYPES.has(file.type)) {
      setAccountNotice('Upload a PNG, JPEG, or WebP image.');
      return;
    }
    if (file.size > MAX_UPLOADED_MEME_BYTES) {
      setAccountNotice('That image is larger than 8 MB. Choose a smaller image.');
      return;
    }
    setBusyKey(`media:${card.localId || card.imageUrl}`);
    try {
      const localId = card.localId || crypto.randomUUID();
      if (!card.localId) await dbSaveCard({ ...card, localId });
      const dataUrl = await readFileAsDataUrl(file);
      const media = await uploadCollectionImage(dataUrl, isMiddleEarth ? 'middle-earth' : 'vibe-atlas', localId);
      await dbReplaceCardImage(card.imageUrl, media);
      await loadCollection(user?.accountId);
      setAccountNotice('The saved result is now backed by a canonical MEDIA reference.');
    } catch (error) {
      setAccountNotice(messageFrom(error, 'The image could not be registered in MEDIA.'));
    } finally {
      setBusyKey('');
    }
  }

  async function recoverCardMedia(card: CardRecord) {
    const recoveryKey = `recover:${card.localId || card.imageUrl}`;
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
          ? 'The saved result now uses its verified MEDIA asset.'
          : 'The saved result was recovered into permanent MEDIA storage.'
        : `This saved result remains visible, but its ${mediaClassificationLabel(result.recovery.classification)} could not be recovered: ${result.recovery.message || 'original unavailable.'}`);
    } catch (error) {
      setAccountNotice(messageFrom(error, 'The saved result could not be recovered.'));
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
          ? 'The legacy grid now uses its verified MEDIA asset.'
          : 'The legacy grid was recovered into permanent MEDIA storage.'
        : `This grid remains visible, but its ${mediaClassificationLabel(result.recovery.classification)} could not be recovered: ${result.recovery.message || 'original unavailable.'}`);
    } catch (error) {
      setAccountNotice(messageFrom(error, 'The saved grid could not be recovered.'));
    } finally {
      setBusyKey('');
    }
  }

  async function handleMiddleEarthUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!SUPPORTED_MEME_TYPES.has(file.type)) {
      setAccountNotice('Upload a PNG, JPEG, or WebP image.');
      return;
    }
    if (file.size > MAX_UPLOADED_MEME_BYTES) {
      setAccountNotice('That image is larger than 8 MB. Choose a smaller meme.');
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

      if (user && await shouldSyncCollection(user.accountId)) {
        try {
          await syncPublicCollection(user);
          await loadCollection(user.accountId);
          setAccountNotice(`“${file.name}” was uploaded, saved, and registered in MEDIA.`);
        } catch (error) {
          setAccountNotice(`“${file.name}” is saved on this device, but MEDIA sync failed: ${messageFrom(error, 'try again after reconnecting')}`);
        }
      } else {
        schedulePublicCollectionSync();
        setAccountNotice(`“${file.name}” is saved in this Collection. Sign in and merge this device to register it in MEDIA.`);
      }
    } catch (error) {
      setAccountNotice(messageFrom(error, 'The image could not be saved.'));
    } finally {
      setBusyKey('');
    }
  }

  if (loading) return <div className={styles.loading}>Loading collection…</div>;

  const allActors = Array.from(new Set([
    ...grids.filter(grid => !grid.legendaryMisprint && grid.intent !== 'legendary-misprint').map(grid => grid.actor),
    ...cards.filter(card => !card.legendaryMisprint).map(card => card.actor),
  ]));
  if (grids.some(grid => grid.legendaryMisprint || grid.intent === 'legendary-misprint') || cards.some(card => card.legendaryMisprint)) {
    allActors.unshift(LEGENDARY_MISPRINT_FILTER);
  }
  const displayedGrids = filterActor === LEGENDARY_MISPRINT_FILTER
    ? grids.filter(grid => grid.legendaryMisprint || grid.intent === 'legendary-misprint')
    : filterActor
      ? grids.filter(grid => !grid.legendaryMisprint && grid.intent !== 'legendary-misprint' && grid.actor === filterActor)
      : grids.filter(grid => !grid.legendaryMisprint && grid.intent !== 'legendary-misprint');
  const displayedCards = filterActor === LEGENDARY_MISPRINT_FILTER
    ? cards.filter(card => card.legendaryMisprint)
    : filterActor
      ? cards.filter(card => !card.legendaryMisprint && card.actor === filterActor)
      : cards.filter(card => !card.legendaryMisprint);

  return (
    <main className={styles.collection}>
      <header className={styles.hero}>
        <div>
          <h2>{isMiddleEarth ? 'Middle-earth Collection' : 'Your Collection'}</h2>
          <p>{isMiddleEarth
            ? 'Your separate MemeForge shelf for finished Middle-earth memes.'
            : 'Collect individual finds, keep finished worlds, and compose Event or Compiled editorial sets.'}</p>
        </div>
        <span>{isMiddleEarth ? `${cards.length} memes` : `${grids.length} grids · ${cards.length} results`}</span>
      </header>

      <section className={styles.account}>
        {user ? (
          <div className={styles.signedIn}>
            <p>{isMiddleEarth ? 'Middle-earth memes synced as' : 'Synced as'} <strong>{user.email}</strong></p>
            <button type="button" onClick={() => void handleLogout()}>Sign out</button>
          </div>
        ) : (
          <form onSubmit={handleMagicLink}>
            <label htmlFor="collection-email">{isMiddleEarth
              ? 'Sync Middle-earth memes across devices'
              : 'Sync grids and saved results across devices'}</label>
            <div>
              <input
                id="collection-email"
                type="email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
              <button>Email sign-in link</button>
            </div>
          </form>
        )}
        {needsMergeChoice && (
          <div className={styles.mergeChoice}>
            <p>Merge this browser’s grids and saved results into your account?</p>
            <button onClick={() => void handleMerge(true)}>Merge and sync</button>
            <button onClick={() => void handleMerge(false)}>Keep separate</button>
          </div>
        )}
        {accountNotice && <p className={styles.notice} role="status">{accountNotice}</p>}
      </section>

      {isMiddleEarth ? (
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
        <nav className={styles.typeTabs} aria-label="Collection artifact type">
          <button type="button" aria-current={activeType === 'grids'} onClick={() => {
            setActiveType('grids');
            onTypeChange?.('grids');
          }}>
            Grids <span>{grids.length}</span>
          </button>
          <button type="button" aria-current={activeType === 'results'} onClick={() => {
            setActiveType('results');
            onTypeChange?.('results');
          }}>
            Saved results <span>{cards.length}</span>
          </button>
          <button type="button" aria-current={activeType === 'builder'} onClick={() => {
            setActiveType('builder');
            onTypeChange?.('builder');
          }}>
            Grid Builder
          </button>
        </nav>
      )}

      {activeType !== 'builder' && allActors.length > 1 && (
        <div className={styles.filters} aria-label="Filter collection by actor">
          <button type="button" aria-pressed={filterActor === null} onClick={() => setFilterActor(null)}>All</button>
          {allActors.map(actor => (
            <button
              type="button"
              key={actor}
              aria-pressed={filterActor === actor}
              onClick={() => setFilterActor(actor)}
            >
              {actor === LEGENDARY_MISPRINT_FILTER ? '🔥 Legendary Misprints' : actor}
            </button>
          ))}
        </div>
      )}

      {activeType === 'builder' && !isMember ? (
        <section className={styles.upgradeGate}>
          <span>✦ Founding Member</span>
          <h3>Build a new world from your saved finds.</h3>
          <p>Your local saves remain here. Upgrade to use Grid Builder and make premium exports.</p>
          <button type="button" onClick={onUpgrade}>Explore membership</button>
        </section>
      ) : activeType === 'builder' ? (
        <GridBuilder
          accountId={user?.accountId}
          isAdmin={isAdmin}
          isMember={isMember}
          onUpgrade={onUpgrade}
          onCreateFromGrid={onCreateFromGrid}
          onPacketCreated={() => setActiveType('grids')}
          onExported={() => {
            setActiveType('grids');
            void loadCollection();
          }}
        />
      ) : activeType === 'grids' ? (
        displayedGrids.length === 0 ? (
          <EmptyState
            symbol="▦"
            title="No saved grids yet"
            body="Save a grid — from the Grid Builder or the daily Vibe Atlas — to keep its images, search spell, styling, and provenance here."
          />
        ) : (
          <section className={styles.gridArtifacts} aria-label="Saved grids">
            {displayedGrids.map(grid => (
              <article className={styles.gridArtifact} key={grid.id}>
                <button
                  type="button"
                  className={styles.gridPreviewButton}
                  aria-label={`View ${grid.actor} ${grid.vibe} grid larger`}
                  onClick={() => setExpandedArtifact({ kind: 'grid', record: grid })}
                >
                   <GridVisual
                     grid={grid}
                     onImageError={() => setFailedGridImages(current => ({ ...current, [grid.id]: true }))}
                   />
                  <span>View larger</span>
                </button>
                <div className={styles.gridStory}>
                  <div className={styles.gridTitle}>
                    <div>
                      <h3>
                        {grid.legendaryMisprint || grid.intent === 'legendary-misprint'
                          ? '🔥 Legendary Misprint'
                          : `${grid.vibeEmoji} ${grid.actor}`}
                      </h3>
                      <p>
                        {grid.legendaryMisprint || grid.intent === 'legendary-misprint'
                          ? `Vibe Atlas × ${grid.legendaryMisprint?.unexpectedActor.name || grid.misprintMetadata?.unexpectedImageIdentities.join(', ') || 'unexpected identity'} · ${grid.vibe}`
                          : `${grid.vibe} · ${grid.vibeEn}`}
                      </p>
                    </div>
                    <span>{formatDate(grid.capturedDate)}</span>
                  </div>
                  {grid.searchSpell && <p className={styles.spell}>⌕ {grid.searchSpell}</p>}
                  {grid.vibeSubtitle && <p className={styles.subtitle}>{grid.vibeSubtitle}</p>}
                  <p className={styles.provenance}>
                    {grid.images.length} source results · {grid.rendererVersion}
                    {grid.legendaryMisprint || grid.intent === 'legendary-misprint'
                      ? ' · Intentional Legendary Misprint'
                      : grid.edition.legendary
                        ? ' · Legendary'
                        : grid.edition.misprint
                          ? ' · Misprint'
                          : ''}
                  </p>
                  {grid.legacyCompositeUrl
                    && (failedGridImages[grid.id] || grid.mediaRecovery?.status === 'unrecoverable') && (
                    <div className={styles.mediaRecovery} role="status">
                      <strong>
                        Image status: {mediaClassificationLabel(grid.mediaRecovery?.classification || classifyCollectionMedia(grid))}
                      </strong>
                      <span>{grid.mediaRecovery?.message || 'This older image is not backed by permanent MEDIA yet.'}</span>
                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        onClick={() => void recoverGridMedia(grid)}
                      >
                        {busyKey === `recover-grid:${grid.id}` ? 'Recovering…' : 'Recover in MEDIA'}
                      </button>
                    </div>
                  )}
                   {(() => {
                     const remoteImages = grid.images.filter(image => image.mediaRecovery?.status === 'unrecoverable');
                     if (!remoteImages.length) return null;
                     return (
                       <div className={styles.mediaRecovery} role="status">
                         <strong>Image status: MEDIA copy incomplete</strong>
                         <span>
                           {remoteImages.length} image{remoteImages.length === 1 ? '' : 's'} still depend{remoteImages.length === 1 ? 's' : ''} on remote sources:
                           {' '}{remoteImages.map(image => image.title || `position ${image.gridPosition + 1}`).join(', ')}.
                         </span>
                       </div>
                     );
                   })()}
                </div>
                <div className={styles.gridActions}>
                  <button
                    type="button"
                    disabled={Boolean(busyKey)}
                    onClick={async () => {
                      setBusyKey(`export:${grid.id}`);
                      try {
                        // Persist the render for this saved grid, fire-and-forget —
                        // the upload never blocks the download/share path.
                        const starData = starDataFromCollectionGrid(grid);
                        setAccountNotice(await saveShareCard(starData, 'full', (blob) => {
                          const tier = classifyEditionTier(buildExportPayload(starData).chosen);
                          void uploadExportedCard(grid.id, crypto.randomUUID(), blob, 'full', tier);
                        }));
                      } catch (error) {
                        setAccountNotice(messageFrom(error, 'The grid could not be exported.'));
                      } finally {
                        setBusyKey('');
                      }
                    }}
                  >
                    {busyKey === `export:${grid.id}` ? 'Rendering…' : 'Export grid'}
                  </button>
                  {isAdmin && onCreateFromGrid && (
                    <CreatorPostAction
                      entryPoint="saved_grid"
                      disabled={Boolean(busyKey)}
                      onSubmit={async platforms => {
                        setBusyKey(`create:${grid.id}`);
                        try {
                          return await onCreateFromGrid(grid, platforms);
                        } finally {
                          setBusyKey('');
                        }
                      }}
                    />
                  )}
                  {!grid.legendaryMisprint && (
                    <button
                      type="button"
                      disabled={Boolean(busyKey)}
                      onClick={() => void markLegendaryMisprint(grid)}
                    >
                      {busyKey === `misprint:${grid.id}` ? 'Marking…' : 'Mark Legendary Misprint'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.remove}
                    disabled={Boolean(pendingRemoval)}
                    onClick={() => queueRemoval({ kind: 'grid', record: grid })}
                  >
                    Remove
                  </button>
                </div>
                <GridExportHistory gridId={grid.id} signedIn={Boolean(user)} />
              </article>
            ))}
          </section>
        )
      ) : displayedCards.length === 0 ? (
        <EmptyState
          symbol="☆"
          title={isMiddleEarth ? 'No saved Middle-earth memes yet' : 'No saved results yet'}
          body={isMiddleEarth
            ? 'Save an existing meme from MemeForge and it will appear here, separate from your Vibe Atlas collection.'
            : 'Tap ☆ in the lightbox to collect individual images without duplicating their full grid.'}
        />
      ) : (
        <section className={styles.savedResults} aria-label="Saved results">
          {displayedCards.map(card => (
            <article key={card.imageUrl} className={card.contentKind === 'middle-earth-meme' ? styles.memeResult : undefined}>
              <button
                type="button"
                className={styles.resultPreviewButton}
                aria-label={card.contentKind === 'middle-earth-meme' ? `View ${card.title || card.vibe} meme larger` : `View ${card.actor} ${card.vibe} result larger`}
                onClick={() => setExpandedArtifact({ kind: 'card', record: card })}
              >
                 <img
                   src={card.media?.thumbnailUrl || card.thumbnailUrl}
                   alt=""
                   onError={() => setFailedCardImages(current => ({ ...current, [card.imageUrl]: true }))}
                 />
                <span>View larger</span>
              </button>
              <div>
                <strong>{card.vibeEmoji} {card.contentKind === 'middle-earth-meme' ? card.title || card.vibe : card.actor}</strong>
                <span>{card.contentKind === 'middle-earth-meme'
                  ? `Middle-earth · ${card.actor} · ${card.memeRework
                    ? 'reworked in MemeForge · original linked'
                    : card.resultId?.startsWith('generated-')
                      ? 'reaction card forged in MemeForge'
                      : 'saved as-is'}`
                  : card.vibe}</span>
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
                    Legendary Misprint · intended {card.legendaryMisprint.intendedIdentity.actor}
                    {' '}· unexpected {card.legendaryMisprint.unexpectedImageIdentity.label}
                  </span>
                )}
                {card.contentKind === 'middle-earth-meme' && card.sourceUrl && <a href={card.sourceUrl} target="_blank" rel="noreferrer">{card.publisher ? `Source: ${card.publisher}` : 'Open original source'}</a>}
                <small>{card.capturedDate}</small>
                {(!card.thumbnailUrl || failedCardImages[card.imageUrl] || card.mediaRecovery?.status === 'unrecoverable') && (
                  <div className={styles.mediaRecovery} role="status">
                    <strong>
                      Image status: {mediaClassificationLabel(card.mediaRecovery?.classification || classifyCollectionMedia(card))}
                    </strong>
                    <span>{card.mediaRecovery?.message || 'This older image is not backed by permanent MEDIA yet.'}</span>
                    <button
                      type="button"
                      disabled={Boolean(busyKey)}
                      onClick={() => void recoverCardMedia(card)}
                    >
                      {busyKey === `recover:${card.localId || card.imageUrl}` ? 'Recovering…' : 'Recover in MEDIA'}
                    </button>
                  </div>
                )}
                <small>{card.media ? 'MEDIA-backed' : 'Legacy URL'}</small>
              </div>
              {!card.media && (
                <label className={styles.collectionUpload}>
                  {busyKey === `media:${card.localId || card.imageUrl}` ? 'Registering…' : 'Register replacement in MEDIA'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label={`Register a replacement image for ${card.actor} ${card.vibe}`}
                    disabled={Boolean(busyKey) || Boolean(pendingRemoval)}
                    onChange={event => void registerCardMedia(event, card)}
                  />
                </label>
              )}
              {!isMiddleEarth && (
                <button
                  type="button"
                  disabled={Boolean(busyKey) || Boolean(pendingRemoval)}
                  onClick={() => void (card.legendaryMisprint
                    ? restoreOrdinaryResult(card)
                    : markCardLegendaryMisprint(card))}
                >
                  {busyKey === `card-misprint:${card.localId || card.imageUrl}`
                    ? 'Saving…'
                    : card.legendaryMisprint
                      ? 'Restore ordinary result'
                      : 'Mark Legendary Misprint'}
                </button>
              )}
              <button
                type="button"
                disabled={Boolean(busyKey) || Boolean(pendingRemoval)}
                onClick={() => void moveCardToScope(card)}
              >
                {busyKey === `move:${card.localId || card.imageUrl}`
                  ? 'Moving…'
                  : isMiddleEarth
                    ? 'Move to Vibe Atlas'
                    : 'Move to Middle-earth'}
              </button>
              <button
                type="button"
                disabled={Boolean(pendingRemoval)}
                onClick={() => queueRemoval({ kind: 'card', record: card })}
              >
                Remove
              </button>
            </article>
          ))}
        </section>
      )}
      {pendingRemoval && (
        <div className={styles.undoToast} role="status" aria-live="polite">
          <span>{pendingRemoval.kind === 'grid' ? 'Grid removed.' : 'Saved result removed.'}</span>
          <button type="button" onClick={undoRemoval}>Undo</button>
        </div>
      )}
      {expandedArtifact?.kind === 'grid' && (
        <ArtifactZoomDialog
          title={`${expandedArtifact.record.vibeEmoji} ${expandedArtifact.record.actor}`}
          subtitle={`${expandedArtifact.record.vibe} · ${expandedArtifact.record.vibeEn}`}
          images={expandedArtifact.record.images.map(image => ({ src: image.imageUrl, alt: image.title }))}
          singleImage={Boolean(expandedArtifact.record.legacyCompositeUrl)}
          footer={expandedArtifact.record.legacyCompositeUrl
            ? 'Legacy saved share card'
            : `${expandedArtifact.record.images.length} source results · ${expandedArtifact.record.editorial
              ? `${expandedArtifact.record.editorial.mode === 'event' ? 'Event' : 'Compiled'} · ${expandedArtifact.record.editorial.arrangement === 'creator-arranged' ? 'creator-arranged' : 'automatic'} · `
              : ''}${expandedArtifact.record.rendererVersion}${expandedArtifact.record.legendaryMisprint || expandedArtifact.record.intent === 'legendary-misprint'
              ? ` · Intentional Legendary Misprint · unexpected ${expandedArtifact.record.legendaryMisprint?.unexpectedActor.name || expandedArtifact.record.misprintMetadata?.unexpectedImageIdentities.join(', ') || 'identity recorded in provenance'}`
              : ''}`}
          onClose={() => setExpandedArtifact(null)}
        />
      )}
      {expandedArtifact?.kind === 'card' && (
        <ArtifactZoomDialog
          title={expandedArtifact.record.contentKind === 'middle-earth-meme'
            ? `${expandedArtifact.record.vibeEmoji} ${expandedArtifact.record.title || expandedArtifact.record.vibe}`
            : `${expandedArtifact.record.vibeEmoji} ${expandedArtifact.record.actor}`}
          subtitle={expandedArtifact.record.contentKind === 'middle-earth-meme'
            ? expandedArtifact.record.memeRework
              ? `Middle-earth · ${expandedArtifact.record.actor} · MemeForge rework · original preserved`
              : `Middle-earth · ${expandedArtifact.record.actor} · ${expandedArtifact.record.resultId?.startsWith('generated-') ? 'reaction card' : 'saved as-is'}`
            : `${expandedArtifact.record.vibe} · ${expandedArtifact.record.vibeEn}${expandedArtifact.record.legendaryMisprint
              ? ` · Legendary Misprint: unexpected ${expandedArtifact.record.legendaryMisprint.unexpectedImageIdentity.label}`
              : ''}`}
          images={[{
            src: expandedArtifact.record.imageUrl || expandedArtifact.record.thumbnailUrl,
            alt: expandedArtifact.record.title || `${expandedArtifact.record.actor} · ${expandedArtifact.record.vibe}`,
          }]}
          singleImage
          footer={expandedArtifact.record.contentKind === 'middle-earth-meme'
            ? `${expandedArtifact.record.publisher || 'Publisher unknown'} · Rights status unknown · ${expandedArtifact.record.memeRework
              ? `Derivative of “${expandedArtifact.record.memeRework.original.title}” · `
              : ''}${formatDate(expandedArtifact.record.capturedDate)}`
            : formatDate(expandedArtifact.record.capturedDate)}
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
function GridExportHistory({ gridId, signedIn }: { gridId: string; signedIn: boolean }) {
  const [entries, setEntries] = useState<PersistedExportEntry[] | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);

  async function loadHistory() {
    if (entries || loadingHistory) return;
    setLoadingHistory(true);
    setHistoryError('');
    try {
      setEntries(await fetchExportHistory(gridId));
    } catch (error) {
      setHistoryError(messageFrom(error, 'Export history could not be loaded.'));
    } finally {
      setLoadingHistory(false);
    }
  }

  if (!signedIn) return null;

  return (
    <details
      className={styles.exportHistory}
      onToggle={event => { if ((event.target as HTMLDetailsElement).open) void loadHistory(); }}
    >
      <summary>Past exports</summary>
      {loadingHistory && <span className={styles.exportHistoryNote}>Loading export history…</span>}
      {historyError && <span className={styles.exportHistoryNote} role="alert">{historyError}</span>}
      {entries && entries.length === 0 && (
        <span className={styles.exportHistoryNote}>
          No stored exports yet — export this grid and the rendered card will be kept here.
        </span>
      )}
      {entries && entries.length > 0 && (
        <ul>
          {[...entries].reverse().map(entry => (
            <li key={entry.exportId}>
              <span>
                {formatDate(entry.exportedAt.slice(0, 10))}
                {' · '}{entry.variant}
                {entry.tier && entry.tier !== 'standard' ? ` · ${entry.tier}` : ''}
              </span>
              <a href={exportDownloadUrl(gridId, entry.exportId)} download>
                Re-download
              </a>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(`${value}T12:00:00`));
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function mediaClassificationLabel(
  classification: ReturnType<typeof classifyCollectionMedia>,
): string {
  if (classification === 'legacy-composite') return 'legacy composite';
  if (classification === 'media-backed') return 'MEDIA-backed asset';
  return 'URL-only image';
}
