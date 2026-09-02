import { useState, useEffect, useCallback, useRef } from 'react';
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
import { useStarOfDay, type StarOfDayArchiveEntry } from './hooks/useStarOfDay';
import { useWholeCardTier } from './hooks/useWholeCardTier';
import { collectionGridFromStar } from './utils/collectionHistoryModel';
import { consumeMagicLinkFromLocation, requestMagicLink } from './utils/publicAccount';
import { getMembershipStatus } from './utils/membership';
import { Membership } from './components/Membership/Membership';
import { makeCreatorPostFromGrid } from './utils/creatorDraft';
import { CreatorPostAction } from './components/CreatorPostAction/CreatorPostAction';
import { useIsAdmin } from './hooks/useIsAdmin';
import {
  hasInvalidVibeAtlasEditionDate,
  initialCollectionType,
  initialVibeAtlasEditionDate,
  initialVibeAtlasView,
  isValidVibeAtlasEditionDate,
  isVibeAtlasArchiveLocation,
  resolveFandomProductRoute,
} from './utils/fandomRoutes';
import './App.css';
import { VeteranSubmissionForm } from './components/VeteranSubmissionForm/VeteranSubmissionForm';
import {
  trackCollectionOpened,
  trackDailyArchiveEditionSelected,
  trackDailyArchiveOpened,
  trackDailyDropCardSave,
  trackDailyDropEngaged,
  trackDailyDropShared,
  trackDailyDropViewed,
  trackGridBuilderPreviewOpened,
  trackUpgradeStarted,
} from './utils/analytics';

/** Number of columns in the grid — used to calculate preview row insertion */
const GRID_COLS = 3;
const LAST_SAVED_EDITION_KEY = 'fandom_vibe_atlas_last_saved_edition';

function formatEditionDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function syncVibeAtlasEditionUrl(date: string | null, replace = false) {
  const params = new URLSearchParams(window.location.search);
  if (date) {
    params.set('date', date);
  } else {
    params.delete('date');
  }

  const query = params.toString();
  const nextUrl = `/vibe-atlas${query ? `?${query}` : ''}`;
  if (`${window.location.pathname}${window.location.search}` === nextUrl) return;
  const update = replace ? window.history.replaceState : window.history.pushState;
  update.call(window.history, {}, '', nextUrl);
}

function App() {
  const route = resolveFandomProductRoute(window.location.pathname, window.location.search);
  if (route === 'vibe-atlas') {
    return <VibeAtlasApp archiveEntry={isVibeAtlasArchiveLocation(window.location.pathname)} />;
  }
  if (route === 'middle-earth') return <MiddleEarthApp />;
  if (route === 'veteran-journal') return <VeteranSubmissionForm />;
  return <FandomLaunchpad />;
}

function MiddleEarthApp() {
  const { isAdmin } = useIsAdmin();
  const showCollection = new URLSearchParams(window.location.search).get('view') === 'collection';

  if (showCollection) return <Collection scope="middle-earth" />;
  return <MiddleEarthWorkspace isAdmin={isAdmin} />;
}

function VibeAtlasApp({ archiveEntry = false }: { archiveEntry?: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [dailyGridZoomOpen, setDailyGridZoomOpen] = useState(false);
  const [selectedEditionDate, setSelectedEditionDate] = useState<string | null>(
    () => initialVibeAtlasView(window.location.search) === 'daily'
      ? initialVibeAtlasEditionDate(window.location.search)
      : null,
  );
  const [archiveOpen, setArchiveOpen] = useState(
    () => archiveEntry || (initialVibeAtlasView(window.location.search) === 'daily'
      && (
        hasInvalidVibeAtlasEditionDate(window.location.search)
        || Boolean(initialVibeAtlasEditionDate(window.location.search))
      )),
  );
  const [archivePage, setArchivePage] = useState(archiveEntry);
  const [view, setView] = useState<'daily' | 'collection' | 'admin' | 'membership'>(
    () => initialVibeAtlasView(window.location.search),
  );
  const [collectionTab, setCollectionTab] = useState<'grids' | 'results' | 'builder'>(
    () => initialCollectionType(window.location.search),
  );
  const { isAdmin, loading: adminLoading, recheck: recheckAdmin } = useIsAdmin();
  const { isDark, toggle: toggleDarkMode } = useDarkMode();
  const {
    items: gridImages,
    meta,
    rawData,
    archive,
    archiveLoading,
    archiveError,
    loadArchive,
    loading,
    error,
  } = useStarOfDay(archivePage && !selectedEditionDate ? undefined : selectedEditionDate);
  const [imageTiers, setImageTiers] = useState<Record<string, ImageTier>>({});
  const [isMember, setIsMember] = useState(false);
  const [membershipResolved, setMembershipResolved] = useState(false);
  const [editionShareNotice, setEditionShareNotice] = useState('');
  const dropEngagement = useRef({
    editionDate: '',
    openedCards: new Set<string>(),
    tracked: false,
  });

  // Whole-board (share-card) manual tier override — distinct from per-image
  // `imageTiers` above. Resets automatically whenever a new board (new
  // date/actor) is generated; see useWholeCardTier for reset semantics.
  const boardKey = rawData ? boardIdentity(rawData) : null;
  const { tier: wholeCardTier, setTier: setWholeCardTier } = useWholeCardTier(boardKey);
  const exportData = rawData ? applyWholeCardTierOverride(rawData, wholeCardTier) : null;
  const refreshMembership = useCallback(async () => {
    setMembershipResolved(false);
    try {
      const status = await getMembershipStatus();
      setIsMember(status.isMember);
    } catch {
      setIsMember(false);
    } finally {
      setMembershipResolved(true);
    }
  }, []);

  useEffect(() => {
    void Promise.all([migrateBookmarks(), migrateLegacyGridHistory()]);
    void consumeMagicLinkFromLocation()
      .then(async destination => {
        if (destination) {
          await refreshMembership();
          // Recheck the admin session with the freshly-issued cookie so that
          // useIsAdmin transitions to isAdmin=true before the Admin view renders.
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
  }, [refreshMembership]);

  useEffect(() => {
    // Keep old PLAN URLs usable, but do not leave the retired product name in
    // the browser location after routing them to the Operator Console.
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') !== 'plan') return;
    params.delete('view');
    params.set('admin', 'true');
    window.history.replaceState({}, '', `/vibe-atlas?${params.toString()}`);
  }, []);

  useEffect(() => {
    void refreshMembership();
  }, [refreshMembership]);

  useEffect(() => {
    if (view !== 'daily' || !rawData?.date) return;

    const editionDate = rawData.date;
    dropEngagement.current = {
      editionDate,
      openedCards: new Set<string>(),
      tracked: false,
    };
    const archiveDate = new URLSearchParams(window.location.search).get('date');
    trackDailyDropViewed(editionDate, archiveDate === editionDate);

    const timer = window.setTimeout(() => {
      if (
        dropEngagement.current.editionDate === editionDate
        && !dropEngagement.current.tracked
      ) {
        dropEngagement.current.tracked = true;
        trackDailyDropEngaged(editionDate, 'twenty_seconds');
      }
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [rawData?.date, view]);

  useEffect(() => {
    if (view !== 'collection') return;
    const lastSavedEdition = window.localStorage.getItem(LAST_SAVED_EDITION_KEY) ?? undefined;
    trackCollectionOpened(
      lastSavedEdition && isValidVibeAtlasEditionDate(lastSavedEdition)
        ? lastSavedEdition
        : undefined,
    );
  }, [view]);

  useEffect(() => {
    if (
      membershipResolved
      && view === 'collection'
      && collectionTab === 'builder'
    ) {
      trackGridBuilderPreviewOpened(isMember);
    }
  }, [collectionTab, isMember, membershipResolved, view]);

  useEffect(() => {
    const privateView = window.location.pathname === '/auth/verify'
      || window.location.search.length > 0
      || view === 'collection'
      || view === 'admin'
      || view === 'membership';
    const title = archivePage
      ? 'Vibe Atlas Archive | Fandom Vibes'
      : view === 'daily'
        ? 'Vibe Atlas | A Daily C-Drama Card Drop'
      : view === 'membership'
        ? 'Vibe Atlas Founding Member | Fandom Vibes'
        : view === 'collection'
          ? 'Your Vibe Atlas Studio | Fandom Vibes'
          : 'Operator Console | Fandom Vibes';
    document.title = title;

    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
      ?? document.head.appendChild(document.createElement('meta'));
    robots.name = 'robots';
    robots.content = privateView ? 'noindex,follow' : 'index,follow,max-image-preview:large';

    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?? document.head.appendChild(document.createElement('link'));
    canonical.rel = 'canonical';
    canonical.href = archivePage
      ? 'https://fandom.justlikekatie.com/vibe-atlas/archive'
      : 'https://fandom.justlikekatie.com/vibe-atlas';
  }, [archivePage, view]);

  useEffect(() => {
    if (archivePage && !archive.length && !archiveLoading) void loadArchive();
  }, [archivePage, archive.length, archiveLoading, loadArchive]);

  useEffect(() => {
    setEditionShareNotice('');
  }, [selectedEditionDate]);

  const openArchivePicker = useCallback(() => {
    setArchiveOpen(true);
    if (!archive.length && !archiveLoading) void loadArchive();
  }, [archive.length, archiveLoading, loadArchive]);

  const selectEdition = (date: string | null) => {
    setExpandedId(null);
    setLightboxIndex(null);
    setDailyGridZoomOpen(false);
    setImageTiers({});
    if (date !== null && !isValidVibeAtlasEditionDate(date)) {
      syncVibeAtlasEditionUrl(null, true);
      setSelectedEditionDate(null);
      openArchivePicker();
      return;
    }
    setArchivePage(false);
    syncVibeAtlasEditionUrl(date);
    setSelectedEditionDate(date);
  };

  const copyArchivedEditionLink = async () => {
    if (!selectedEditionDate || !isValidVibeAtlasEditionDate(selectedEditionDate)) return;

    const shareUrl = new URL('/vibe-atlas', window.location.origin);
    shareUrl.searchParams.set('date', selectedEditionDate);

    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(shareUrl.toString());
      setEditionShareNotice(`Copied link for ${formatEditionDate(selectedEditionDate)}.`);
      trackDailyDropShared(selectedEditionDate, 'edition_link');
    } catch {
      setEditionShareNotice(
        'Could not copy this archived edition link. Please copy the address from your browser.',
      );
    }
  };

  const openArchivePage = () => {
    setArchivePage(true);
    setArchiveOpen(true);
    setSelectedEditionDate(null);
    setExpandedId(null);
    setLightboxIndex(null);
    setDailyGridZoomOpen(false);
    window.history.pushState({}, '', '/vibe-atlas/archive');
    if (!archive.length && !archiveLoading) void loadArchive();
  };

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
    setArchivePage(false);
    setCollectionTab(tab);
    setView(destination);
    if (destination === 'daily') selectEdition(null);
  };

  useEffect(() => {
    const restoreUrlState = () => {
      const restoredView = initialVibeAtlasView(window.location.search);
      const restoredArchivePage = isVibeAtlasArchiveLocation(window.location.pathname);
      const invalidEditionDate = hasInvalidVibeAtlasEditionDate(window.location.search);
      setArchivePage(restoredArchivePage);
      setView(restoredView);
      setCollectionTab(initialCollectionType(window.location.search));
      setExpandedId(null);
      setLightboxIndex(null);
      setDailyGridZoomOpen(false);
      setImageTiers({});
      const restoredEditionDate = restoredView === 'daily' && !restoredArchivePage
        ? initialVibeAtlasEditionDate(window.location.search)
        : null;
      setSelectedEditionDate(restoredEditionDate);
      if (restoredArchivePage || (restoredView === 'daily' && restoredEditionDate)) {
        setArchiveOpen(true);
      }
      if (restoredView === 'daily' && !restoredArchivePage && invalidEditionDate) {
        syncVibeAtlasEditionUrl(null, true);
        openArchivePicker();
      }
    };
    window.addEventListener('popstate', restoreUrlState);
    return () => window.removeEventListener('popstate', restoreUrlState);
  }, [openArchivePicker]);

  useEffect(() => {
    if (!hasInvalidVibeAtlasEditionDate(window.location.search)) return;
    syncVibeAtlasEditionUrl(null, true);
    setSelectedEditionDate(null);
    if (view === 'daily' && !archivePage) openArchivePicker();
  }, [archivePage, openArchivePicker, view]);

  useEffect(() => {
    // A valid date can still point at a cache entry that has been retired or
    // was never generated. Return the visitor to a usable picker rather than
    // leaving them on an empty/error grid.
    if (!selectedEditionDate || loading || !error) return;
    syncVibeAtlasEditionUrl(null, true);
    setSelectedEditionDate(null);
    openArchivePicker();
  }, [error, loading, openArchivePicker, selectedEditionDate]);

  const toggleArchive = () => {
    const nextOpen = !archiveOpen;
    if (nextOpen) trackDailyArchiveOpened();
    setArchiveOpen(nextOpen);
    if (nextOpen && !archive.length && !archiveLoading) void loadArchive();
  };

  const handleItemClick = (itemId: string) => {
    setExpandedId((prev) => (prev === itemId ? null : itemId));
    if (
      rawData?.date
      && dropEngagement.current.editionDate === rawData.date
      && !dropEngagement.current.tracked
    ) {
      dropEngagement.current.openedCards.add(itemId);
      if (dropEngagement.current.openedCards.size >= 3) {
        dropEngagement.current.tracked = true;
        trackDailyDropEngaged(rawData.date, 'three_cards');
      }
    }
  };

  const handleCardSaveChange = (position: number, saved: boolean) => {
    if (!rawData?.date) return;
    trackDailyDropCardSave(rawData.date, position, saved);
    if (saved) {
      window.localStorage.setItem(LAST_SAVED_EDITION_KEY, rawData.date);
    }
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
          onSaveChange={(saved) => handleCardSaveChange(i, saved)}
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
            <strong>Vibe Atlas</strong><small>Daily C-drama card drop</small>
          </a>
        </div>
        <div className="fandom-atlas-nav" aria-label="Vibe Atlas workspace">
          <button
            type="button"
            aria-label="今日之星 · Daily"
            onClick={() => navigateAtlas('daily')}
            className={view === 'daily' && !archivePage ? 'fandom-atlas-nav__active' : ''}
          >
            <span>Daily card drop</span><small>今日之星</small>
          </button>
          <button
            type="button"
            aria-label="Vibe Atlas archive"
            onClick={openArchivePage}
            className={archivePage ? 'fandom-atlas-nav__active' : ''}
          >
            <span>Archive</span><small>往期图鉴</small>
          </button>
          <button
            type="button"
            aria-label="Your Collection · Saved Grids and Grid Builder"
            onClick={() => navigateAtlas('collection', 'grids')}
            className={view === 'collection' ? 'fandom-atlas-nav__active' : ''}
          >
            <span>Your Collection</span><small>Saved Grids · Grid Builder</small>
          </button>
          <button
            type="button"
            onClick={() => navigateAtlas('membership')}
            className={view === 'membership' ? 'fandom-atlas-nav__active' : ''}
          >
            <span>Membership</span><small>Founding Member</small>
          </button>
        </div>
      </nav>

      {archivePage ? (
        <ArchivePage
          archive={archive}
          archiveLoading={archiveLoading}
          archiveError={archiveError}
        />
      ) : view === 'daily' ? (
        <>
      <header className="atlas-hero">
        <div className="atlas-hero__eyebrow"><span>Fandom Vibes / studio 01</span><i /></div>
        <div className="atlas-hero__title-row">
          <div>
            <p className="atlas-hero__universe">A daily C-drama card drop</p>
            <h1>Vibe Atlas <span>氛围图鉴</span></h1>
          </div>
          <p className="atlas-hero__thesis">One star. One vibe. Nine pieces of evidence.</p>
        </div>
        <p className="atlas-hero__intro">Every day, Vibe Atlas pairs one C-drama star with one Vibe Pack, then searches their iconic characters, looks, and moments for nine cards worth keeping. Browse today’s drop, save your favorites, and build a 3×3 from the evidence.</p>
        <section className="daily-archive" aria-label="Vibe Atlas daily edition archive">
          <button
            type="button"
            className="daily-archive__toggle"
            aria-expanded={archiveOpen}
            onClick={toggleArchive}
          >
            <span>{archiveOpen ? 'Hide past editions' : 'Browse past editions'}</span>
            <small>{archiveOpen ? '收起往期' : '往期图鉴'}</small>
            <strong aria-hidden="true">{archiveOpen ? '−' : '+'}</strong>
          </button>
          {archiveOpen && (
            <div className="daily-archive__panel">
              <div className="daily-archive__intro">
                <div>
                  <p className="daily-archive__kicker">The Vibe Atlas archive</p>
                  <h2>Every star. Every assignment.</h2>
                </div>
                <p>Revisit past stars, vibes, and evidence.</p>
              </div>
              {archiveLoading ? (
                <p className="daily-archive__status">Loading available editions…</p>
              ) : archiveError ? (
                <p className="daily-archive__status daily-archive__status--error" role="alert">{archiveError}</p>
              ) : archive.length === 0 ? (
                <p className="daily-archive__status">No archived editions are available yet.</p>
              ) : (
                <div className="daily-archive__list">
                  {archive.map((edition, index) => (
                    <ArchiveEditionButton
                      key={edition.date}
                      edition={edition}
                      isSelected={selectedEditionDate === edition.date}
                      isLatest={index === 0}
                      onSelect={() => {
                        trackDailyArchiveEditionSelected(edition.date, index === 0);
                        selectEdition(edition.date);
                      }}
                    />
                  ))}
                </div>
              )}
              <a className="daily-archive__full-link" href="/vibe-atlas/archive">Open the full archive →</a>
              {selectedEditionDate && (
                <button type="button" className="daily-archive__today" onClick={() => selectEdition(null)}>
                  ← Return to today’s drop
                </button>
              )}
            </div>
          )}
        </section>
        {meta && (
          <div className="atlas-edition">
            <div className="atlas-edition__label">
              {selectedEditionDate ? `Archived card drop · ${formatEditionDate(meta.date)}` : "Today's curated card drop"}
            </div>
            <div className="atlas-edition__name">
              <span>Today's star</span> {meta.vibeEmoji} {meta.actorName}
            </div>
            <div className="atlas-edition__name">
              <span>Today's vibe</span> {meta.vibeLabel}
            </div>
            <div className="atlas-edition__subline">
              {meta.vibeLabelEn} — {meta.vibeSubtitleEn}
            </div>
            {meta.vibeSupportingCopyEn && (
              <div className="atlas-edition__supporting-copy">{meta.vibeSupportingCopyEn}</div>
            )}
            {meta.stale && (
              <div className="atlas-edition__stale">
                ⏳ Showing yesterday's picks while today's grid builds
              </div>
            )}
            {selectedEditionDate && isValidVibeAtlasEditionDate(selectedEditionDate) && (
              <div className="daily-edition-share">
                <button type="button" onClick={copyArchivedEditionLink}>
                  Copy archived edition link
                </button>
                <p className="daily-edition-share__notice" role="status" aria-live="polite" aria-atomic="true">
                  {editionShareNotice}
                </p>
              </div>
            )}
            {rawData && exportData && (
            <div className="daily-actions">
              <WholeCardTierControls tier={wholeCardTier} onTierChange={setWholeCardTier} />
              <WholeCardTierBadge tier={wholeCardTier} />
              <div className="daily-actions__primary">
                <ExportButton
                  rawData={exportData}
                  onShareComplete={() => trackDailyDropShared(exportData.date, 'image')}
                />
                {isAdmin && (
                  <CreatorPostAction
                    entryPoint="daily"
                    onSubmit={(platforms, onProgress) => makeCreatorPostFromGrid(
                      collectionGridFromStar(rawData),
                      platforms,
                      onProgress,
                    )}
                  />
                )}
              </div>
            </div>
            )}
          </div>
        )}
      </header>

      <div className="daily-grid">
        <div className="daily-grid__header">
          <h2>Today’s evidence</h2>
          <p>Nine cards from today’s star × Vibe Pack.</p>
        </div>
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
        />
      )}
        </>
            ) : view === 'collection' ? (
        <Collection
          key={collectionTab}
          initialType={collectionTab}
          isAdmin={isAdmin}
          isMember={isMember}
          onUpgrade={() => {
            trackUpgradeStarted('grid_builder');
            navigateAtlas('membership');
          }}
          onTypeChange={setCollectionTab}
          onCreateFromGrid={makeCreatorPostFromGrid}
        />
      ) : view === 'membership' ? (
        <Membership onStatusChange={status => {
          setIsMember(status.isMember);
          setMembershipResolved(true);
        }} />
      ) : adminLoading ? (
        <div className="admin-gate-loading" aria-label="Checking admin session…" />
      ) : !isAdmin ? (
        <AdminSignIn />
      ) : (
        <FandomAdmin initialView="release-desk" />
      )}
    </div>
  );
}

function ArchiveEditionButton({
  edition,
  isSelected,
  isLatest,
  onSelect,
  href,
}: {
  edition: StarOfDayArchiveEntry;
  isSelected: boolean;
  isLatest: boolean;
  onSelect?: () => void;
  href?: string;
}) {
  const content = (
    <>
      <span className="daily-archive__date">
        {formatEditionDate(edition.date)}
        {isLatest && <small>Latest</small>}
      </span>
      <strong>{edition.vibeEmoji} {edition.actorName}</strong>
      <span>{edition.vibeLabel} · {edition.vibeLabelEn}</span>
      {isSelected && <b>Viewing</b>}
    </>
  );
  const className = `daily-archive__edition${isSelected ? ' daily-archive__edition--selected' : ''}`;
  if (href) {
    return <a className={className} href={href} onClick={onSelect}>{content}</a>;
  }
  return (
    <button type="button" className={className} aria-pressed={isSelected} onClick={onSelect}>
      {content}
    </button>
  );
}

function ArchivePage({
  archive,
  archiveLoading,
  archiveError,
}: {
  archive: StarOfDayArchiveEntry[];
  archiveLoading: boolean;
  archiveError: string | null;
}) {
  return (
    <main className="atlas-archive-page">
      <header className="atlas-hero atlas-archive-page__hero">
        <div className="atlas-hero__eyebrow"><span>Fandom Vibes / studio 01</span><i /></div>
        <div className="atlas-hero__title-row">
          <div>
            <p className="atlas-hero__universe">Published Vibe Atlas editions</p>
            <h1>Archive <span>往期图鉴</span></h1>
          </div>
          <p className="atlas-hero__thesis">Every star. Every assignment.</p>
        </div>
        <p className="atlas-hero__intro">
          A record of Daily Drop editions that were actually published. Choose a date to open its exact nine-card board; unpublished or still-building days stay out of this list.
        </p>
      </header>

      <section className="daily-archive daily-archive--page" aria-labelledby="archive-page-title">
        <div className="daily-archive__intro">
          <div>
            <p className="daily-archive__kicker">The Vibe Atlas archive</p>
            <h2 id="archive-page-title">Published editions</h2>
          </div>
          <p>Historical boards are read-only and keep their original date, star, and Vibe Pack.</p>
        </div>
        {archiveLoading ? (
          <p className="daily-archive__status">Loading published editions…</p>
        ) : archiveError ? (
          <p className="daily-archive__status daily-archive__status--error" role="alert">{archiveError}</p>
        ) : archive.length === 0 ? (
          <p className="daily-archive__status">No published editions are available yet.</p>
        ) : (
          <div className="daily-archive__list">
            {archive.map((edition, index) => (
              <ArchiveEditionButton
                key={edition.date}
                edition={edition}
                isSelected={false}
                isLatest={index === 0}
                href={`/vibe-atlas?date=${encodeURIComponent(edition.date)}`}
                onSelect={() => trackDailyArchiveEditionSelected(edition.date, index === 0)}
              />
            ))}
          </div>
        )}
        <a className="daily-archive__today" href="/vibe-atlas">← Return to today’s drop</a>
      </section>
    </main>
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
      const message = await requestMagicLink(email, 'admin');
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
