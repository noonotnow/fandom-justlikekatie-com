import { useEffect, useRef, useState } from 'react';
import {
  dbGetVisibleCards,
  dbGetVisibleGrids,
  dbRemoveCard,
  dbRemoveGrid,
  type CardRecord,
  type GridRecord,
} from '../../utils/collectionDB';
import { starDataFromCollectionGrid } from '../../utils/collectionHistoryModel';
import { saveShareCard } from '../../utils/exportCanvas';
import type { IdeaPacket } from '../../utils/ideaPackets';
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

interface Props {
  isAdmin?: boolean;
  packets?: IdeaPacket[];
  onCreateFromGrid?: (grid: GridRecord) => Promise<IdeaPacket>;
  onAddGridToPacket?: (packet: IdeaPacket, grid: GridRecord) => Promise<IdeaPacket>;
}

export const Collection: React.FC<Props> = ({
  isAdmin = false,
  packets = [],
  onCreateFromGrid,
  onAddGridToPacket,
}) => {
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [grids, setGrids] = useState<GridRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<'grids' | 'results'>('grids');
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
  const accountIdRef = useRef<string | undefined>(undefined);
  const collectingPackets = packets.filter(packet => packet.state === 'collecting');

  async function loadCollection(accountId = accountIdRef.current) {
    const [visibleCards, visibleGrids] = await Promise.all([
      dbGetVisibleCards(accountId),
      dbGetVisibleGrids(accountId),
    ]);
    setCards(visibleCards.sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? '')));
    setGrids(visibleGrids.sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
  }

  useEffect(() => {
    const refreshSession = async () => {
      const session = await getPublicSession();
      accountIdRef.current = session?.accountId;
      setUser(session);
      if (session) {
        const decided = await hasMergeDecision(session.accountId);
        setNeedsMergeChoice(!decided);
        if (decided && await shouldSyncCollection(session.accountId)) await syncPublicCollection(session);
      } else {
        setNeedsMergeChoice(false);
      }
      await loadCollection(session?.accountId);
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

  async function handleRemoveCard(imageUrl: string) {
    try {
      await dbRemoveCard(imageUrl);
      setCards(current => current.filter(card => card.imageUrl !== imageUrl));
      schedulePublicCollectionSync();
    } catch (error) {
      setAccountNotice(messageFrom(error, 'The saved result could not be removed.'));
    }
  }

  async function handleRemoveGrid(id: string) {
    try {
      await dbRemoveGrid(id);
      setGrids(current => current.filter(grid => grid.id !== id));
      schedulePublicCollectionSync();
    } catch (error) {
      setAccountNotice(messageFrom(error, 'The saved grid could not be removed.'));
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
          <h2>我的收藏 · My Collection</h2>
          <p>Keep complete visual worlds and individual finds ready for their next form.</p>
        </div>
        <span>{grids.length} grids · {cards.length} results</span>
      </header>

      <section className={styles.account}>
        {user ? (
          <div className={styles.signedIn}>
            <p>Synced as <strong>{user.email}</strong></p>
            <button type="button" onClick={() => void handleLogout()}>Sign out</button>
          </div>
        ) : (
          <form onSubmit={handleMagicLink}>
            <label htmlFor="collection-email">Sync grids and saved results across devices</label>
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

      <nav className={styles.typeTabs} aria-label="Collection artifact type">
        <button type="button" aria-current={activeType === 'grids'} onClick={() => setActiveType('grids')}>
          Grids <span>{grids.length}</span>
        </button>
        <button type="button" aria-current={activeType === 'results'} onClick={() => setActiveType('results')}>
          Saved results <span>{cards.length}</span>
        </button>
      </nav>

      {allActors.length > 1 && (
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

      {activeType === 'grids' ? (
        displayedGrids.length === 0 ? (
          <EmptyState
            symbol="▦"
            title="No saved grids yet"
            body="Export a Vibe Atlas grid to preserve its images, search spell, styling, and provenance here."
          />
        ) : (
          <section className={styles.gridArtifacts} aria-label="Saved grids">
            {displayedGrids.map(grid => (
              <article className={styles.gridArtifact} key={grid.id}>
                <div className={styles.gridPreview} aria-label={`${grid.actor} ${grid.vibe} grid preview`}>
                  {grid.images.slice(0, 9).map(image => (
                    <img key={image.resultId} src={image.imageUrl} alt="" />
                  ))}
                </div>
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
                        setAccountNotice(await saveShareCard(starDataFromCollectionGrid(grid), 'full'));
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
                  <button type="button" className={styles.remove} onClick={() => void handleRemoveGrid(grid.id)}>
                    Remove
                  </button>
                </div>
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
          title="No saved results yet"
          body="Tap ☆ in the lightbox to collect individual images without duplicating their full grid."
        />
      ) : (
        <section className={styles.savedResults} aria-label="Saved results">
          {displayedCards.map(card => (
            <article key={card.imageUrl}>
              <img src={card.thumbnailUrl} alt={`${card.actor} · ${card.vibe}`} />
              <div>
                <strong>{card.vibeEmoji} {card.actor}</strong>
                <span>{card.vibe}</span>
                <small>{card.capturedDate}</small>
              </div>
              <button type="button" onClick={() => void handleRemoveCard(card.imageUrl)}>Remove</button>
            </article>
          ))}
        </section>
      )}
    </main>
  );
};

function EmptyState({ symbol, title, body }: { symbol: string; title: string; body: string }) {
  return (
    <div className={styles.empty}>
      <span>{symbol}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(`${value}T12:00:00`));
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
