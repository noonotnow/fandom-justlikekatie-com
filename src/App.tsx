import { useState, useEffect, useRef } from 'react';
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
} from './utils/ideaPackets';
import type { GridRecord } from './utils/collectionDB';
import { consumeMagicLinkFromLocation, requestMagicLink } from './utils/publicAccount';
import { getMembershipStatus } from './utils/membership';
import { Membership } from './components/Membership/Membership';
import { makeCreatorPostFromGrid, makeCreatorPostFromPacket } from './utils/creatorDraft';
import { useIsAdmin } from './hooks/useIsAdmin';
import {
  initialCollectionType,
  initialVibeAtlasPacketId,
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
  const showCollection = new URLSearchParams(window.location.search).get('view') === 'collection';

  if (showCollection) return <Collection scope="middle-earth" />;
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
  const [view, setView] = useState<'daily' | 'collection' | 'plan' | 'membership'>(
    () => initialVibeAtlasView(window.location.search),
  );
  const [collectionTab, setCollectionTab] = useState<'grids' | 'results' | 'builder'>(
    () => initialCollectionType(window.location.search),
  );
  const [openPacketId, setOpenPacketId] = useState<string | null>(
    () => initialVibeAtlasPacketId(window.location.search),
  );
  const [packetNotice, setPacketNotice] = useState('');
  const openPacketIdRef = useRef(openPacketId);
  const { isAdmin, loading: adminLoading, recheck: recheckAdmin } = useIsAdmin();
  const { isDark, toggle: toggleDarkMode } = useDarkMode();
  const { items: gridImages, meta, rawData, loading, error } = useStarOfDay();
  const [imageTiers, setImageTiers] = useState<Record<string, ImageTier>>({});
  const [packets, setPackets] = useState<IdeaPacket[]>([]);
  const [packetsLoading, setPacketsLoading] = useState(false);
  const [packetsError, setPacketsError] = useState('');
  const [packetsUnauthorized, setPacketsUnauthorized] = useState(false);
  const [isMember, setIsMember] = useState(false);

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

  useEffect(() => {
    void getMembershipStatus().then(status => setIsMember(status.isMember)).catch(() => setIsMember(false));
  }, [view]);

  useEffect(() => {
    const restoreUrlView = () => {
      setView(initialVibeAtlasView(window.location.search));
      setCollectionTab(initialCollectionType(window.location.search));
      const packetId = initialVibeAtlasPacketId(window.location.search);
      openPacketIdRef.current = packetId;
      setOpenPacketId(packetId);
    };
    window.addEventListener('popstate', restoreUrlView);
    return () => window.removeEventListener('popstate', restoreUrlView);
  }, []);

  const navigateAtlas = (
    destination: 'daily' | 'collection' | 'membership',
    tab: 'grids' | 'results' | 'builder' = 'grids',
  ) => {
    const search = destination === 'daily'
      ? ''
      : destination === 'membership'
        ? '?view=membership'
      : `?view=${tab === 'grids' ? 'collection' : tab}`;
    window.history.pushState({}, '', `/vibe-atlas${search}`);
    openPacketIdRef.current = null;
    setOpenPacketId(null);
    setPacketNotice('');
    setCollectionTab(tab);
    setView(destination);
  };

  const loadPackets = async () => {
    setPacketsLoading(true);
    setPacketsError('');
    try {
      const loadedPackets = await fetchIdeaPackets();
      setPackets(current => {
        const openedPacket = openPacketIdRef.current
          ? current.find(packet => packet.id === openPacketIdRef.current)
          : undefined;
        return openedPacket && !loadedPackets.some(packet => packet.id === openedPacket.id)
          ? [openedPacket, ...loadedPackets]
          : loadedPackets;
      });
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
    <div className="app fandom-atlas-page">
      <ThemeToggle isDark={isDark} onToggle={toggleDarkMode} />

      {/* Navigation bar */}
      <nav className="fandom-universe-nav" aria-label="Fandom Vibes navigation">
        <a className="fandom-universe-brand" href="/">
          <span className="fandom-universe-mark">FV</span>
          <span><strong>Fandom Vibes</strong><small>Worldbuilding launchpad</small></span>
        </a>
        <div className="fandom-universe-tools">
          <span className="fandom-universe-current">Current universe</span>
          <a className="fandom-tool-link fandom-tool-link--active" href="/vibe-atlas">
            <strong>Vibe Atlas</strong><small>C-drama atmosphere</small>
          </a>
        </div>
        <div className="fandom-atlas-nav" aria-label="Vibe Atlas workspace">
          <button
            type="button"
            aria-label="今日之星 · Daily"
            onClick={() => navigateAtlas('daily')}
            className={view === 'daily' ? 'fandom-atlas-nav__active' : ''}
          >
            <span>Daily edition</span><small>今日之星</small>
          </button>
          <button
            type="button"
            aria-label="Studio Operations · Collection and Grid Builder"
            onClick={() => navigateAtlas('collection', 'grids')}
            className={view === 'collection' ? 'fandom-atlas-nav__active' : ''}
          >
            <span>Studio Operations</span><small>Collection · Grid Builder</small>
          </button>
          <button
            type="button"
            onClick={() => navigateAtlas('membership')}
            className={view === 'membership' ? 'fandom-atlas-nav__active' : ''}
          >
            <span>Membership</span><small>Founding Member</small>
          </button>
        </div>
        <a
          className="memeforge-workbench-link"
          href="/memeforge/middle-earth"
        >
          <span>Middle-earth MemeForge</span>
          <small>Reaction studio</small>
        </a>
      </nav>

      {view === 'daily' ? (
        <>
      <header className="atlas-hero">
        <div className="atlas-hero__eyebrow"><span>Fandom Vibes / studio 01</span><i /></div>
        <div className="atlas-hero__title-row">
          <div>
            <p className="atlas-hero__universe">A C-drama worldbuilding instrument</p>
            <h1>Vibe Atlas <span>氛围图鉴</span></h1>
          </div>
          <p className="atlas-hero__thesis">Too wrong to discard.<br /><em>Too iconic to ignore.</em></p>
        </div>
        <p className="atlas-hero__intro">Compose the emotional weather of the day: a living grid of faces, textures, and tiny signals from the C-drama worlds you keep returning to.</p>
        {meta && (
          <div className="atlas-edition">
            <div className="atlas-edition__name">
              {meta.vibeEmoji} {meta.actorName} · {meta.vibeLabel}
            </div>
            <div className="atlas-edition__subline">
              {meta.vibeLabelEn} — {meta.vibeSubtitleEn}
            </div>
            {meta.stale && (
              <div className="atlas-edition__stale">
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
                        const result = await makeCreatorPostFromPacket(packetFromGrid(rawData, gridImages));
                        replacePacket(result.compatibilityPacket);
                        window.location.assign(result.receipt.createUrl);
                      } catch (caught) {
                        if (caught instanceof IdeaPacketError && caught.status === 401) {
                          setPacketsUnauthorized(true);
                          recheckAdmin();
                          setView('plan');
                        } else {
                          setPacketsError(caught instanceof Error ? caught.message : 'The Creator OS draft could not be created.');
                        }
                      }
                    }}
                  >
                    Make a post in Creator OS
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
            canManagePackets={isAdmin}
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
          key={collectionTab}
          initialType={collectionTab}
          isAdmin={isAdmin}
          isMember={isMember}
          onUpgrade={() => navigateAtlas('membership')}
          packets={packets}
          onCreateFromGrid={async (grid: GridRecord) => {
            try {
              const result = await makeCreatorPostFromGrid(grid);
              return result;
            } catch (caught) {
              if (caught instanceof IdeaPacketError && caught.status === 401) recheckAdmin();
              throw caught;
            }
          }}
        />
      ) : view === 'membership' ? (
        <Membership onStatusChange={status => setIsMember(status.isMember)} />
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
          onSessionExpired={recheckAdmin}
          initialPacketId={openPacketId}
          initialNotice={packetNotice}
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
