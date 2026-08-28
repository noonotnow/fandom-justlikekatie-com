import { useEffect, useRef, useState } from 'react';
import {
  dbGetVisibleCards,
  dbGetVisibleGrids,
  dbSaveCard,
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
import { buildExportPayload, classifyEditionTier, saveShareCard } from '../../utils/exportCanvas';
import {
  exportDownloadUrl,
  fetchExportHistory,
  retryPendingExportCleanups,
  uploadExportedCard,
  type PersistedExportEntry,
} from '../../utils/gridExportLog';
import type { IdeaPacket } from '../../utils/ideaPackets';
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

const UNDO_WINDOW_MS = 8_000;
const MAX_UPLOADED_MEME_BYTES = 8 * 1024 * 1024;
const SUPPORTED_MEME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

interface Props {
  scope?: 'vibe-atlas' | 'middle-earth';
  isAdmin?: boolean;
  packets?: IdeaPacket[];
  onCreateFromGrid?: (grid: GridRecord) => Promise<IdeaPacket>;
  onAddGridToPacket?: (packet: IdeaPacket, grid: GridRecord) => Promise<IdeaPacket>;
}

type ExpandedArtifact =
  | { kind: 'grid'; record: GridRecord }
  | { kind: 'card'; record: CardRecord };

export const Collection: React.FC<Props> = ({
  scope = 'vibe-atlas',
  isAdmin = false,
  packets = [],
  onCreateFromGrid,
  onAddGridToPacket,
}) => {
  const isMiddleEarth = scope === 'middle-earth';
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [grids, setGrids] = useState<GridRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<'grids' | 'results' | 'builder'>(
    isMiddleEarth ? 'results' : 'grids',
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
  const [packetSelections, setPacketSelections] = useState<Record<string, string>>({});
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  const [expandedArtifact, setExpandedArtifact] = useState<ExpandedArtifact | null>(null);
  const accountIdRef = useRef<string | undefined>(undefined);
  const pendingRemovalRef = useRef<PendingRemoval | null>(null);
  const collectingPackets = packets.filter(packet => packet.state === 'collecting');

  async function loadCollection(accountId = accountIdRef.current) {
    const [visibleCards, visibleGrids] = await Promise.all([
      dbGetVisibleCards(accountId),
      dbGetVisibleGrids(accountId),
    ]);
    setCards(visibleCards
      .filter(card => isMiddleEarth
        ? card.contentKind === 'middle-earth-meme'
        : card.contentKind !== 'middle-earth-meme')
      .sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? '')));
    setGrids(isMiddleEarth ? [] : visibleGrids.sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
  }

  useEffect(() => {
    const refreshSession = async () => {
      const session = await getPublicSession();
      accountIdRef.current = session?.accountId;
      setUser(session);
      if (session) {
        const decided = await hasMergeDecision(session.accountId);
        setNeedsMergeChoice(!decided);
        if (decided && await shouldSyncCollection(session.accountId)) {
          await syncPublicCollection(session);
          setAccountNotice('');
        }
      } else {
        setNeedsMergeChoice(false);
      }
      await recoverPendingRemoval();
      await loadCollection(session?.accountId);
      // Retry any export cleanups that failed on earlier removals — the grid
      // records are already gone locally, so this queue is the only path left
      // to finish deleting their server-side export blobs.  Runs after session
      // resolution so only the matching account's queue entries are retried.
      void retryPendingExportCleanups(session?.accountId);
    };
    void refreshSession().finally(() => setLoading(false));
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
  }, []);

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
    ...grids.map(grid => grid.actor),
    ...cards.map(card => card.actor),
  ]));
  const displayedGrids = filterActor ? grids.filter(grid => grid.actor === filterActor) : grids;
  const displayedCards = filterActor ? cards.filter(card => card.actor === filterActor) : cards;

  return (
    <main className={styles.collection}>
      <header className={styles.hero}>
        <div>
          <h2>{isMiddleEarth ? 'Middle-earth Collection' : '我的收藏 · My Collection'}</h2>
          <p>{isMiddleEarth
            ? 'Your separate MemeForge shelf for finished Middle-earth memes.'
            : 'Keep complete visual worlds and individual finds ready for their next form.'}</p>
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
          <button type="button" aria-current={activeType === 'grids'} onClick={() => setActiveType('grids')}>
            Grids <span>{grids.length}</span>
          </button>
          <button type="button" aria-current={activeType === 'results'} onClick={() => setActiveType('results')}>
            Saved results <span>{cards.length}</span>
          </button>
          <button type="button" aria-current={activeType === 'builder'} onClick={() => setActiveType('builder')}>
            Build a grid
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
              {actor}
            </button>
          ))}
        </div>
      )}

      {activeType === 'builder' ? (
        <GridBuilder
          accountId={user?.accountId}
          isAdmin={isAdmin}
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
                  <GridVisual grid={grid} />
                  <span>View larger</span>
                </button>
                <div className={styles.gridStory}>
                  <div className={styles.gridTitle}>
                    <div>
                      <h3>{grid.vibeEmoji} {grid.actor}</h3>
                      <p>{grid.vibe} · {grid.vibeEn}</p>
                    </div>
                    <span>{formatDate(grid.capturedDate)}</span>
                  </div>
                  {grid.searchSpell && <p className={styles.spell}>⌕ {grid.searchSpell}</p>}
                  {grid.vibeSubtitle && <p className={styles.subtitle}>{grid.vibeSubtitle}</p>}
                  <p className={styles.provenance}>
                    {grid.images.length} source results · {grid.rendererVersion}
                    {grid.edition.legendary ? ' · Legendary' : grid.edition.misprint ? ' · Misprint' : ''}
                  </p>
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
                    <button
                      type="button"
                      disabled={Boolean(busyKey)}
                      onClick={async () => {
                        setBusyKey(`create:${grid.id}`);
                        try {
                          await onCreateFromGrid(grid);
                          setAccountNotice('New Idea Packet started from this grid.');
                        } catch (error) {
                          setAccountNotice(messageFrom(error, 'The Idea Packet could not be started.'));
                        } finally {
                          setBusyKey('');
                        }
                      }}
                    >
                      {busyKey === `create:${grid.id}` ? 'Starting…' : 'Start packet'}
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
                {isAdmin && onAddGridToPacket && (
                  <div className={styles.packetAction}>
                    {collectingPackets.length === 0 ? (
                      <span>Start a packet to add this grid as an output.</span>
                    ) : (
                      <>
                        <select
                          aria-label={`Packet for ${grid.actor} ${grid.vibe} grid`}
                          value={packetSelections[grid.id] || ''}
                          onChange={event => setPacketSelections(current => ({
                            ...current,
                            [grid.id]: event.target.value,
                          }))}
                        >
                          <option value="">Choose an existing packet…</option>
                          {collectingPackets.map(packet => (
                            <option key={packet.id} value={packet.id}>
                              {packet.actor.name} · {packet.vibe.labelEn}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={Boolean(busyKey) || !packetSelections[grid.id]}
                          onClick={async () => {
                            const packet = collectingPackets.find(candidate => candidate.id === packetSelections[grid.id]);
                            if (!packet) return;
                            setBusyKey(`add:${grid.id}`);
                            try {
                              await onAddGridToPacket(packet, grid);
                              setAccountNotice('Grid added to the Idea Packet as a complete output.');
                            } catch (error) {
                              setAccountNotice(messageFrom(error, 'The grid could not be added to that packet.'));
                            } finally {
                              setBusyKey('');
                            }
                          }}
                        >
                          {busyKey === `add:${grid.id}` ? 'Adding…' : 'Add grid to packet'}
                        </button>
                      </>
                    )}
                  </div>
                )}
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
                <img src={card.thumbnailUrl} alt="" />
                <span>View larger</span>
              </button>
              <div>
                <strong>{card.vibeEmoji} {card.contentKind === 'middle-earth-meme' ? card.title || card.vibe : card.actor}</strong>
                <span>{card.contentKind === 'middle-earth-meme' ? `Middle-earth · ${card.actor} · saved as-is` : card.vibe}</span>
                {card.contentKind === 'middle-earth-meme' && card.sourceUrl && <a href={card.sourceUrl} target="_blank" rel="noreferrer">{card.publisher ? `Source: ${card.publisher}` : 'Open original source'}</a>}
                <small>{card.capturedDate}</small>
              </div>
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
            : `${expandedArtifact.record.images.length} source results · ${expandedArtifact.record.rendererVersion}`}
          onClose={() => setExpandedArtifact(null)}
        />
      )}
      {expandedArtifact?.kind === 'card' && (
        <ArtifactZoomDialog
          title={expandedArtifact.record.contentKind === 'middle-earth-meme'
            ? `${expandedArtifact.record.vibeEmoji} ${expandedArtifact.record.title || expandedArtifact.record.vibe}`
            : `${expandedArtifact.record.vibeEmoji} ${expandedArtifact.record.actor}`}
          subtitle={expandedArtifact.record.contentKind === 'middle-earth-meme'
            ? `Middle-earth · ${expandedArtifact.record.actor} · saved as-is`
            : `${expandedArtifact.record.vibe} · ${expandedArtifact.record.vibeEn}`}
          images={[{
            src: expandedArtifact.record.imageUrl || expandedArtifact.record.thumbnailUrl,
            alt: expandedArtifact.record.title || `${expandedArtifact.record.actor} · ${expandedArtifact.record.vibe}`,
          }]}
          singleImage
          footer={expandedArtifact.record.contentKind === 'middle-earth-meme'
            ? `${expandedArtifact.record.publisher || 'Publisher unknown'} · Rights status unknown · ${formatDate(expandedArtifact.record.capturedDate)}`
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

function GridVisual({ grid }: { grid: GridRecord }) {
  const isLegacy = Boolean(grid.legacyCompositeUrl);
  const compositionClass = grid.images.length === 4
    ? styles.gridTwoByTwo
    : grid.images.length === 6
      ? styles.gridTwoByThree
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
      {grid.images.slice(0, 9).map(image => (
        <img key={image.resultId} src={image.imageUrl} alt="" />
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
