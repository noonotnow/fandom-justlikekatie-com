import { useState, useEffect } from 'react';
import type { ImageTier } from './types';
import FandomLaunchpad from './components/FandomLaunchpad/FandomLaunchpad';
import { MiddleEarthWorkspace } from './components/MiddleEarthWorkspace/MiddleEarthWorkspace';
import { GridItem } from './components/GridItem/GridItem';
import { GridItemSkeleton } from './components/GridItem/GridItemSkeleton';
import { InlinePreview } from './components/InlinePreview/InlinePreview';
import { Lightbox } from './components/Lightbox/Lightbox';
import { ThemeToggle } from './components/ThemeToggle/ThemeToggle';
import { ExportButton } from './components/ExportButton/ExportButton';
import { Collection } from './components/Collection/Collection';
import { FandomAdmin } from './components/FandomAdmin/FandomAdmin';
import { WholeCardTierControls, WholeCardTierBadge } from './components/WholeCardTierControls/WholeCardTierControls';
import { ArtifactZoomDialog } from './components/ArtifactZoomDialog/ArtifactZoomDialog';
import { migrateBookmarks } from './utils/migrateBookmarks';
import { migrateLegacyGridHistory } from './utils/collectionHistory';
import { applyWholeCardTierOverride, boardIdentity } from './utils/wholeCardTier';
import { useDarkMode } from './hooks/useDarkMode';
import { useStarOfDay } from './hooks/useStarOfDay';
import { useWholeCardTier } from './hooks/useWholeCardTier';
import {
  createIdeaPacket,
  fetchIdeaPackets,
  mediaFromResult,
  mutateIdeaPacket,
  packetFromMiddleEarthDraft,
  packetFromGrid,
  type IdeaPacket,
  IdeaPacketError,
  mediaFromCollectionCard,
  packetGridFromCollectionGrid,
  packetFromCollectionGrid,
} from './utils/ideaPackets';
import type { CardRecord, GridRecord } from './utils/collectionDB';
import { consumeMagicLinkFromLocation, requestMagicLink } from './utils/publicAccount';
import { useIsAdmin } from './hooks/useIsAdmin';
import {
  initialVibeAtlasView,
  resolveFandomProductRoute,
} from './utils/fandomRoutes';
import './App.css';

/** Number of columns in the grid — used to calculate preview row insertion */
const GRID_COLS = 3;

function App() {
  const route = resolveFandomProductRoute(window.location.pathname);
  if (route === 'vibe-atlas') return <VibeAtlasApp />;
  if (route === 'middle-earth') return <MiddleEarthApp />;
  return <FandomLaunchpad />;
}

function MiddleEarthApp() {
  const { isAdmin } = useIsAdmin();

  return (
    <MiddleEarthWorkspace
      isAdmin={isAdmin}
      onCreatePacket={async draft => {
        await createIdeaPacket(packetFromMiddleEarthDraft(draft));
      }}
    />
  );
}

function VibeAtlasApp() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [dailyGridZoomOpen, setDailyGridZoomOpen] = useState(false);
  const [view, setView] = useState<'daily' | 'collection' | 'plan'>(
    () => initialVibeAtlasView(window.location.search),
  );
  const { isAdmin, loading: adminLoading, recheck: recheckAdmin } = useIsAdmin();
  const { isDark, toggle: toggleDarkMode } = useDarkMode();
  const { items: gridImages, meta, rawData, loading, error } = useStarOfDay();
  const [imageTiers, setImageTiers] = useState<Record<string, ImageTier>>({});
  const [packets, setPackets] = useState<IdeaPacket[]>([]);
  const [packetsLoading, setPacketsLoading] = useState(false);
  const [packetsError, setPacketsError] = useState('');
  const [packetsUnauthorized, setPacketsUnauthorized] = useState(false);

  // Whole-board (share-card) manual tier override — distinct from per-image
  // `imageTiers` above. Resets automatically whenever a new board (new
  // date/actor) is generated; see useWholeCardTier for reset semantics.
  const boardKey = rawData ? boardIdentity(rawData) : null;
  const { tier: wholeCardTier, setTier: setWholeCardTier } = useWholeCardTier(boardKey);
  const exportData = rawData ? applyWholeCardTierOverride(rawData, wholeCardTier) : null;

  useEffect(() => {
    void Promise.all([migrateBookmarks(), migrateLegacyGridHistory()]);
    void consumeMagicLinkFromLocation()
      .then(destination => {
        if (destination) {
          // Recheck the admin session with the freshly-issued cookie so that
          // useIsAdmin transitions to isAdmin=true before the plan view renders.
          recheckAdmin();
          setView(destination);
        }
      })
      .catch(error => {
        sessionStorage.setItem(
          'fandom_auth_notice',
          error instanceof Error ? error.message : 'The sign-in link could not be used.',
        );
        setView('collection');
      });
  }, []);

  const loadPackets = async () => {
    setPacketsLoading(true);
    setPacketsError('');
    try {
      setPackets(await fetchIdeaPackets());
      setPacketsUnauthorized(false);
    } catch (caught) {
      const is401 = caught instanceof IdeaPacketError && caught.status === 401;
      setPacketsUnauthorized(is401);
      setPacketsError(caught instanceof Error ? caught.message : 'Idea Packets could not be loaded.');
      // A 401 from a protected API means the session cookie may have expired.
      // Re-check so that if isAdmin was true, it transitions to false and shows
      // the sign-in gate rather than leaving a stale admin view on screen.
      if (is401) recheckAdmin();
    } finally {
      setPacketsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) void loadPackets();
  }, [isAdmin]);

  const replacePacket = (packet: IdeaPacket) => {
    setPackets(current => [packet, ...current.filter(candidate => candidate.id !== packet.id)]);
  };

  const handleItemClick = (itemId: string) => {
    setExpandedId((prev) => (prev === itemId ? null : itemId));
  };

  const handleViewFull = (index: number) => {
    setExpandedId(null);
    setLightboxIndex(index);
  };

  /**
   * Render grid items with inline preview rows inserted after the row
   * containing the expanded item.
   */
  const renderGridItems = () => {
    const elements: React.ReactNode[] = [];

    for (let i = 0; i < gridImages.length; i++) {
      const item = gridImages[i];

      // Grid item
      elements.push(
        <GridItem
          key={item.id}
          {...item}
          tier={imageTiers[item.id] ?? null}
          onImageClick={() => handleItemClick(item.id)}
        />,
      );

      // Insert inline preview after the end of the current row
      const isEndOfRow = (i + 1) % GRID_COLS === 0 || i === gridImages.length - 1;
      const rowStart = Math.floor(i / GRID_COLS) * GRID_COLS;
      const rowEnd = Math.min(rowStart + GRID_COLS - 1, gridImages.length - 1);
      const expandedInThisRow = gridImages
        .slice(rowStart, rowEnd + 1)
        .find((it) => it.id === expandedId);

      if (isEndOfRow && expandedInThisRow) {
        elements.push(
          <InlinePreview
            key={`preview-${expandedInThisRow.id}`}
            item={expandedInThisRow}
            isOpen={true}
            onClose={() => setExpandedId(null)}
            onViewFull={() => {
              const idx = gridImages.findIndex((g) => g.id === expandedInThisRow.id);
              handleViewFull(idx);
            }}
          />,
        );
      }
    }

    return elements;
  };

  return (
    <div className="app">
      <ThemeToggle isDark={isDark} onToggle={toggleDarkMode} />

      {/* Navigation bar */}
      <nav className="flex flex-wrap justify-center gap-6 pt-4 pb-2 border-b border-gray-200 dark:border-gray-700">
        <a className="fandom-home-link" href="/">Fandom tools</a>
        <button
          onClick={() => setView('daily')}
          className={`pb-2 text-sm tracking-wide transition-colors ${
            view === 'daily'
              ? 'border-b-2 border-gold text-gold font-semibold'
              : 'text-gray-500'
          }`}
        >
          今日之星 · Daily
        </button>
        <button
          onClick={() => setView('collection')}
          className={`pb-2 text-sm tracking-wide transition-colors ${
            view === 'collection'
              ? 'border-b-2 border-gold text-gold font-semibold'
              : 'text-gray-500'
          }`}
        >
          我的收藏 · Collection
        </button>
        {isAdmin && (
          <button
            onClick={() => setView('plan')}
            className={`pb-2 text-sm tracking-wide transition-colors ${
              view === 'plan'
                ? 'border-b-2 border-gold text-gold font-semibold'
                : 'text-gray-500'
            }`}
          >
            Fandom Admin
          </button>
        )}
        {isAdmin && (
          <a
            className="memeforge-workbench-link"
            href="/memeforge/middle-earth"
          >
            <span>Middle-earth MemeForge</span>
            <small>Separate workbench · not Vibe Atlas or CREATE</small>
          </a>
        )}
      </nav>

      {view === 'daily' ? (
        <>
      <header className="text-center py-12 px-4">
        <h1 className="text-5xl md:text-6xl font-bold text-gold mb-4">
          Vibe Atlas — 氛围图鉴
        </h1>
        <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-400 font-light tracking-wide">
          Too wrong to discard. Too iconic to ignore.
        </p>
        {meta && (
          <div className="mt-4">
            <div className="text-2xl font-semibold text-gold-text">
              {meta.vibeEmoji} {meta.actorName} · {meta.vibeLabel}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {meta.vibeLabelEn} — {meta.vibeSubtitleEn}
            </div>
            {meta.stale && (
              <div className="text-xs text-amber-500 mt-1">
                ⏳ Showing yesterday's picks while today's grid builds
              </div>
            )}
            {rawData && exportData && (
            <div className="daily-actions">
              <WholeCardTierControls tier={wholeCardTier} onTierChange={setWholeCardTier} />
              <WholeCardTierBadge tier={wholeCardTier} />
              <div className="daily-actions__primary">
                <ExportButton rawData={exportData} />
                {isAdmin && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (packetsUnauthorized) {
                        setView('plan');
                        return;
                      }
                      try {
                        const packet = await createIdeaPacket(packetFromGrid(rawData, gridImages));
                        replacePacket(packet);
                        setView('plan');
                      } catch (caught) {
                        if (caught instanceof IdeaPacketError && caught.status === 401) {
                          setPacketsUnauthorized(true);
                          recheckAdmin();
                          setView('plan');
                        } else {
                          setPacketsError(caught instanceof Error ? caught.message : 'Idea Packet could not be started.');
                        }
                      }
                    }}
                  >
                    Start Idea Packet
                  </button>
                )}
              </div>
            </div>
            )}
          </div>
        )}
      </header>

      <div className="daily-grid">
        {!loading && !error && gridImages.length > 0 && (
          <button type="button" className="daily-grid__zoom" onClick={() => setDailyGridZoomOpen(true)}>
            ⛶ View whole grid
          </button>
        )}
        <div className="grid">
          {loading
            ? Array.from({ length: 9 }).map((_, i) => <GridItemSkeleton key={i} />)
            : error
              ? <div className="col-span-3 text-center py-8 text-gray-500">{error}</div>
              : renderGridItems()
          }
        </div>
      </div>

      {dailyGridZoomOpen && meta && (
        <ArtifactZoomDialog
          title={`${meta.vibeEmoji} ${meta.actorName}`}
          subtitle={`${meta.vibeLabel} · ${meta.vibeLabelEn}`}
          images={gridImages.map(image => ({ src: image.thumbnail, alt: image.title }))}
          footer={`${gridImages.length} source ${gridImages.length === 1 ? 'result' : 'results'} · ${meta.date}`}
          onClose={() => setDailyGridZoomOpen(false)}
        />
      )}

      {lightboxIndex !== null && (
        <Lightbox
          images={gridImages}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          planData={rawData ?? undefined}
          tier={imageTiers[gridImages[lightboxIndex]?.id] ?? null}
          onTierChange={(tier) => {
            const imageId = gridImages[lightboxIndex]?.id;
            if (imageId) setImageTiers((current) => ({ ...current, [imageId]: tier }));
          }}
          cardMetadata={meta ? {
            actorName: meta.actorName,
            vibeEmoji: meta.vibeEmoji,
            vibeLabel: meta.vibeLabel,
            vibeLabelEn: meta.vibeLabelEn,
            date: meta.date,
          } : undefined}
          packets={packets}
          onAddToPacket={async (packet, image) => {
            try {
              replacePacket(await mutateIdeaPacket(packet, { type: 'add_media', media: mediaFromResult(image) }));
            } catch (caught) {
              if (caught instanceof IdeaPacketError && caught.status === 401) recheckAdmin();
              throw caught;
            }
          }}
        />
      )}
        </>
            ) : view === 'collection' ? (
        <Collection
          isAdmin={isAdmin}
          packets={packets}
          onCreateFromGrid={async (grid: GridRecord) => {
            try {
              const packet = await createIdeaPacket(packetFromCollectionGrid(grid));
              replacePacket(packet);
              return packet;
            } catch (caught) {
              if (caught instanceof IdeaPacketError && caught.status === 401) recheckAdmin();
              throw caught;
            }
          }}
          onAddGridToPacket={async (packet: IdeaPacket, grid: GridRecord) => {
            try {
              const updated = await mutateIdeaPacket(packet, {
                type: 'add_grid',
                grid: packetGridFromCollectionGrid(grid),
              });
              replacePacket(updated);
              return updated;
            } catch (caught) {
              if (caught instanceof IdeaPacketError && caught.status === 401) recheckAdmin();
              throw caught;
            }
          }}
        />
      ) : adminLoading ? (
        <div className="admin-gate-loading" aria-label="Checking admin session…" />
      ) : !isAdmin ? (
        <AdminSignIn />
      ) : (
        <FandomAdmin
          packets={packets}
          loading={packetsLoading}
          error={packetsError}
          unauthorized={packetsUnauthorized}
          onRefresh={loadPackets}
          onPacketChange={replacePacket}
          onSessionExpired={recheckAdmin}
          onCreateFromGrid={async (grid: GridRecord) => {
            try {
              const packet = await createIdeaPacket(packetFromCollectionGrid(grid));
              replacePacket(packet);
              return packet;
            } catch (caught) {
              if (caught instanceof IdeaPacketError && caught.status === 401) recheckAdmin();
              throw caught;
            }
          }}
          onAddSavedCard={async (packet: IdeaPacket, card: CardRecord) => {
            try {
              const updated = await mutateIdeaPacket(packet, { type: 'add_media', media: mediaFromCollectionCard(card) });
              replacePacket(updated);
              return updated;
            } catch (caught) {
              if (caught instanceof IdeaPacketError && caught.status === 401) recheckAdmin();
              throw caught;
            }
          }}
          onAddSavedGrid={async (packet: IdeaPacket, grid: GridRecord) => {
            try {
              const updated = await mutateIdeaPacket(packet, {
                type: 'add_grid',
                grid: packetGridFromCollectionGrid(grid),
              });
              replacePacket(updated);
              return updated;
            } catch (caught) {
              if (caught instanceof IdeaPacketError && caught.status === 401) recheckAdmin();
              throw caught;
            }
          }}
        />
      )}
    </div>
  );
}

/** Shown in the Fandom Admin view when the admin session has expired or was never set. */
function AdminSignIn() {
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const message = await requestMagicLink(email, 'plan');
      setNotice(message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send the sign-in link.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-sign-in">
      <span className="admin-sign-in__icon" aria-hidden="true">🔒</span>
      <h2>Admin sign-in required</h2>
      <p>Your admin session has expired. Enter your admin email to receive a new sign-in link.</p>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          required
          value={email}
          onChange={event => setEmail(event.target.value)}
          placeholder="admin@example.com"
          aria-label="Admin email address"
        />
        <button type="submit" disabled={busy || !email.trim()}>
          {busy ? 'Sending…' : 'Email sign-in link'}
        </button>
      </form>
      {notice && <p className="admin-sign-in__notice" role="status">{notice}</p>}
    </div>
  );
}

export default App;
