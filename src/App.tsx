import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { consumeMagicLinkFromLocation, requestMagicLink } from './utils/publicAccount';
import {
  createMembershipCheckout,
  getMembershipStatus,
  hasCollectorCapability,
  refreshMembershipAfterBilling,
  type MembershipCapability,
  type MembershipStatus,
} from './utils/membership';
import { Membership } from './components/Membership/Membership';
import { useIsAdmin } from './hooks/useIsAdmin';
import {
  hasInvalidVibeAtlasEditionDate,
  initialCollectionType,
  initialGridBuilderSource,
  type GridBuilderSource,
  initialVibeAtlasEditionDate,
  initialVibeAtlasView,
  isValidVibeAtlasEditionDate,
  isVibeAtlasArchiveLocation,
  resolveFandomProductRoute,
} from './utils/fandomRoutes';
import { buildDailyDropPool } from './utils/gridBuilder';
import './App.css';
import { VeteranSubmissionForm } from './components/VeteranSubmissionForm/VeteranSubmissionForm';
import {
  trackCollectionOpened,
  trackDailyArchiveEditionSelected,
  trackArchiveAccess,
  trackArchiveGatedPreviewView,
  trackArchivePageView,
  trackArchiveRecordImpression,
  trackArchiveRecordOpened,
  trackArchiveRebuildLaunched,
  trackDailyDropCardSave,
  trackDailyDropEngaged,
  trackDailyDropShared,
  trackDailyDropViewed,
  trackGridBuilderPreviewOpened,
  trackUpgradeStarted,
} from './utils/analytics';
import type {
  ArchiveRebuildPlacement,
  ArchiveRecordLocation,
  ArchiveRecordType,
} from './utils/analytics';
import { PUBLIC_ROUTE_PATHS, publicRouteUrl } from '../shared/public-routes.js';

/** Number of columns in the grid — used to calculate preview row insertion */
const GRID_COLS = 3;
const LAST_SAVED_EDITION_KEY = 'fandom_vibe_atlas_last_saved_edition';

function VisibleArchiveRecordPlacement({
  as: Element,
  location,
  recordTypes,
  presentationKey,
  className,
  ariaLabel,
  href,
  onClick,
  children,
}: {
  as: 'a' | 'nav' | 'span';
  location: ArchiveRecordLocation;
  recordTypes: readonly ArchiveRecordType[];
  presentationKey: string;
  className?: string;
  ariaLabel?: string;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const elementRef = useRef<HTMLElement | null>(null);
  const impressedPresentationRef = useRef<string | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || impressedPresentationRef.current === presentationKey) return;

    const recordImpression = () => {
      if (impressedPresentationRef.current === presentationKey) return;
      impressedPresentationRef.current = presentationKey;
      trackArchiveRecordImpression(recordTypes, location);
    };
    if (typeof IntersectionObserver === 'undefined') {
      recordImpression();
      return;
    }

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        recordImpression();
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [location, presentationKey, recordTypes]);

  return (
    <Element
      ref={elementRef as never}
      className={className}
      aria-label={ariaLabel}
      href={href}
      onClick={onClick}
    >
      {children}
    </Element>
  );
}

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
  const nextUrl = `${PUBLIC_ROUTE_PATHS.vibeAtlas}${query ? `?${query}` : ''}`;
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
      || initialGridBuilderSource(window.location.search) === 'edition'
      ? initialVibeAtlasEditionDate(window.location.search)
      : null,
  );
  const [archivePage, setArchivePage] = useState(archiveEntry);
  const [view, setView] = useState<'daily' | 'collection' | 'admin' | 'membership'>(
    () => initialVibeAtlasView(window.location.search),
  );
  const [collectionTab, setCollectionTab] = useState<'grids' | 'results' | 'builder'>(
    () => initialCollectionType(window.location.search),
  );
  const [builderSource, setBuilderSource] = useState<GridBuilderSource>(
    () => initialGridBuilderSource(window.location.search),
  );
  const activeEditionDate = builderSource === 'edition'
    ? selectedEditionDate ?? initialVibeAtlasEditionDate(window.location.search)
    : selectedEditionDate;
  const { isAdmin, loading: adminLoading, recheck: recheckAdmin } = useIsAdmin();
  const { isDark, toggle: toggleDarkMode } = useDarkMode();
  const {
    items: gridImages,
    meta,
    rawData,
    archive,
    archiveLoading,
    archiveError,
    archiveHasMore,
    archiveTotal,
    loadArchive,
    loadMoreArchive,
    loading,
    error,
    gate,
  } = useStarOfDay(archivePage && !activeEditionDate ? undefined : activeEditionDate);
  const dailyBuilderPool = useMemo(
    () => rawData ? buildDailyDropPool(rawData) : [],
    [rawData],
  );
  const [imageTiers, setImageTiers] = useState<Record<string, ImageTier>>({});
  const [membershipCapabilities, setMembershipCapabilities] = useState<MembershipCapability[]>([]);
  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus | null>(null);
  const [membershipResolved, setMembershipResolved] = useState(false);
  const [editionShareNotice, setEditionShareNotice] = useState('');
  const [archiveGateEmail, setArchiveGateEmail] = useState('');
  const [archiveGateBusy, setArchiveGateBusy] = useState('');
  const [archiveGateNotice, setArchiveGateNotice] = useState('');
  const dropEngagement = useRef({
    editionDate: '',
    openedCards: new Set<string>(),
    tracked: false,
  });
  const lastArchiveReviewPagePath = useRef<string | null>(null);

  useEffect(() => {
    const pagePath = archivePage
      ? PUBLIC_ROUTE_PATHS.vibeAtlasArchive
      : view === 'daily'
        ? PUBLIC_ROUTE_PATHS.vibeAtlas
        : null;
    if (!pagePath) {
      lastArchiveReviewPagePath.current = null;
      return;
    }
    if (lastArchiveReviewPagePath.current === pagePath) return;
    lastArchiveReviewPagePath.current = pagePath;
    trackArchivePageView(pagePath);
  }, [archivePage, view]);

  // Whole-board (share-card) manual tier override — distinct from per-image
  // `imageTiers` above. Resets automatically whenever a new board (new
  // date/actor) is generated; see useWholeCardTier for reset semantics.
  const boardKey = rawData ? boardIdentity(rawData) : null;
  const { tier: wholeCardTier, setTier: setWholeCardTier } = useWholeCardTier(boardKey);
  const exportData = rawData ? applyWholeCardTierOverride(rawData, wholeCardTier) : null;
  const refreshMembership = useCallback(async () => {
    setMembershipResolved(false);
    try {
      const returnedFromBilling = new URLSearchParams(window.location.search).get('membership') === 'success';
      const status = returnedFromBilling
        ? await refreshMembershipAfterBilling()
        : await getMembershipStatus();
      setMembershipStatus(status);
      setMembershipCapabilities(status.capabilities ?? []);
    } catch {
      setMembershipStatus(null);
      setMembershipCapabilities([]);
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
          const archiveReturnDate = destination.startsWith('archive:')
            ? destination.slice('archive:'.length)
            : null;
          if (
            archiveReturnDate
            && isValidVibeAtlasEditionDate(archiveReturnDate)
          ) {
            syncVibeAtlasEditionUrl(archiveReturnDate, true);
            setSelectedEditionDate(archiveReturnDate);
            setView('daily');
            trackArchiveAccess('restored', archiveReturnDate, 'sign_in');
          } else {
            if (
              destination === 'admin'
              || destination === 'membership'
              || destination === 'collection'
            ) {
              setView(destination);
            }
          }
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
    window.history.replaceState({}, '', `${PUBLIC_ROUTE_PATHS.vibeAtlas}?${params.toString()}`);
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
    if (!gate || !selectedEditionDate) return;
    trackArchiveGatedPreviewView();
    trackArchiveAccess('preview_view', selectedEditionDate, gate.reason);
    if (gate.reason !== 'sign_in') {
      trackArchiveAccess('denied', selectedEditionDate, gate.reason);
    }
  }, [gate, selectedEditionDate]);

  useEffect(() => {
    if (!rawData?.date || !selectedEditionDate) return;
    trackArchiveAccess(
      new URLSearchParams(window.location.search).get('membership') === 'success'
        ? 'restored'
        : 'full_use',
      rawData.date,
    );
  }, [rawData?.date, selectedEditionDate]);

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
      trackGridBuilderPreviewOpened(hasCollectorCapability({ capabilities: membershipCapabilities }));
    }
  }, [collectionTab, membershipCapabilities, membershipResolved, view]);

  useEffect(() => {
    const privateView = window.location.pathname === '/auth/verify'
      || window.location.search.length > 0
      || view === 'collection'
      || view === 'admin'
      || view === 'membership';
    const title = archivePage
      ? 'Vibe Atlas Archive | Fandom Vibes'
      : view === 'daily'
        ? 'Vibe Atlas | Daily C-Drama Collectible Cards | Fandom Vibes'
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
    canonical.href = publicRouteUrl(
      archivePage ? PUBLIC_ROUTE_PATHS.vibeAtlasArchive : PUBLIC_ROUTE_PATHS.vibeAtlas,
    );
  }, [archivePage, view]);

  useEffect(() => {
    if (archivePage && !archive.length && !archiveLoading && !archiveError) void loadArchive();
  }, [archiveError, archivePage, archive.length, archiveLoading, loadArchive]);

  useEffect(() => {
    setEditionShareNotice('');
  }, [selectedEditionDate]);

  const openArchivePicker = useCallback(() => {
    setArchivePage(true);
    setSelectedEditionDate(null);
    setExpandedId(null);
    setLightboxIndex(null);
    setDailyGridZoomOpen(false);
    window.history.replaceState({}, '', PUBLIC_ROUTE_PATHS.vibeAtlasArchive);
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

    const shareUrl = new URL(PUBLIC_ROUTE_PATHS.vibeAtlas, window.location.origin);
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
    setSelectedEditionDate(null);
    setExpandedId(null);
    setLightboxIndex(null);
    setDailyGridZoomOpen(false);
    window.history.pushState({}, '', PUBLIC_ROUTE_PATHS.vibeAtlasArchive);
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
    window.history.pushState({}, '', `${PUBLIC_ROUTE_PATHS.vibeAtlas}${search}`);
    setArchivePage(false);
    setCollectionTab(tab);
    setBuilderSource('collection');
    setView(destination);
    if (destination === 'daily') selectEdition(null);
  };

  const openEditionBuilder = (date: string, placement: ArchiveRebuildPlacement) => {
    if (!isValidVibeAtlasEditionDate(date)) return;
    trackArchiveRebuildLaunched(date, placement);
    window.history.pushState({}, '', `${PUBLIC_ROUTE_PATHS.vibeAtlas}?view=builder&source=edition&date=${encodeURIComponent(date)}`);
    setArchivePage(false);
    setView('collection');
    setCollectionTab('builder');
    setBuilderSource('edition');
    setSelectedEditionDate(date);
  };

  useEffect(() => {
    const restoreUrlState = () => {
      const restoredView = initialVibeAtlasView(window.location.search);
      const restoredArchivePage = isVibeAtlasArchiveLocation(window.location.pathname);
      const invalidEditionDate = hasInvalidVibeAtlasEditionDate(window.location.search);
      setArchivePage(restoredArchivePage);
      setView(restoredView);
      setCollectionTab(initialCollectionType(window.location.search));
      setBuilderSource(initialGridBuilderSource(window.location.search));
      setExpandedId(null);
      setLightboxIndex(null);
      setDailyGridZoomOpen(false);
      setImageTiers({});
      const restoredBuilderSource = initialGridBuilderSource(window.location.search);
      const restoredEditionDate = (restoredView === 'daily' && !restoredArchivePage)
        || restoredBuilderSource === 'edition'
        ? initialVibeAtlasEditionDate(window.location.search)
        : null;
      setSelectedEditionDate(restoredEditionDate);
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
    if (view !== 'daily' || !selectedEditionDate || loading || !error) return;
    syncVibeAtlasEditionUrl(null, true);
    setSelectedEditionDate(null);
    openArchivePicker();
  }, [error, loading, openArchivePicker, selectedEditionDate, view]);

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

  const sendArchiveSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedEditionDate) return;
    setArchiveGateBusy('sign-in');
    trackArchiveAccess('sign_in', selectedEditionDate, 'requested');
    try {
      setArchiveGateNotice(await requestMagicLink(
        archiveGateEmail,
        `archive:${selectedEditionDate}`,
      ));
    } catch (error) {
      setArchiveGateNotice(error instanceof Error ? error.message : 'Could not send the sign-in link.');
    } finally {
      setArchiveGateBusy('');
    }
  };

  const startArchiveCheckout = async () => {
    if (!selectedEditionDate) return;
    setArchiveGateBusy('checkout');
    trackArchiveAccess('checkout', selectedEditionDate);
    try {
      window.location.assign(await createMembershipCheckout(selectedEditionDate));
    } catch (error) {
      setArchiveGateNotice(error instanceof Error ? error.message : 'Checkout could not be opened.');
      setArchiveGateBusy('');
    }
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
          <a className="fandom-tool-link fandom-tool-link--active" href={PUBLIC_ROUTE_PATHS.vibeAtlas}>
            <strong>Vibe Atlas</strong><small>Daily C-drama card drop</small>
          </a>
        </div>
        <div className="fandom-atlas-nav" aria-label="Vibe Atlas workspace">
          <button
            type="button"
            aria-label="今日之星 · Daily"
            onClick={() => navigateAtlas('daily')}
            className={(view === 'daily' || (view === 'collection' && collectionTab === 'builder' && builderSource === 'daily')) && !archivePage
              ? 'fandom-atlas-nav__active'
              : ''}
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
            className={view === 'collection' && builderSource === 'collection' ? 'fandom-atlas-nav__active' : ''}
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
          archiveHasMore={archiveHasMore}
          archiveTotal={archiveTotal}
          loadArchive={loadArchive}
          loadMoreArchive={loadMoreArchive}
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
         <p className="atlas-hero__hook"><em>Like Pokémon, but thirsty. You wanna catch all these.</em></p>
         <p className="atlas-hero__intro">Every day, Vibe Atlas pairs one C-drama star with one very specific kind of heartthrob energy. Browse nine collectible pieces of evidence, save the ones that understand your type, and build your own 3×3.</p>
         <div className="atlas-hero__actions" aria-label="Vibe Atlas actions">
           <a href="#daily-evidence">Browse today’s drop</a>
           <a href={`${PUBLIC_ROUTE_PATHS.vibeAtlas}?view=builder&source=daily`}>Open the Grid Builder</a>
         </div>
        {gate && selectedEditionDate ? (
          <ArchiveLockedEdition
            gate={gate}
            email={archiveGateEmail}
            busy={archiveGateBusy}
            notice={archiveGateNotice}
            onEmailChange={setArchiveGateEmail}
            onSignIn={sendArchiveSignIn}
            onCheckout={startArchiveCheckout}
            onIntent={() => trackArchiveAccess('gated_intent', selectedEditionDate, gate.reason)}
          />
        ) : meta && (
          <div className="atlas-edition">
            <div className="atlas-edition__meta">
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
                {rawData?.publicRecord && (
                  <VisibleArchiveRecordPlacement
                    as="nav"
                    className="atlas-edition__records"
                    ariaLabel="Curated public records"
                    location="daily"
                    recordTypes={['actor', 'edition']}
                    presentationKey={`daily:${rawData.publicRecord.actorPath}:${rawData.publicRecord.editionPath}`}
                  >
                    <a href={rawData.publicRecord.actorPath} onClick={() => trackArchiveRecordOpened('actor', 'daily')}>Explore {meta.actorName}’s actor record</a>
                    <a href={rawData.publicRecord.editionPath} onClick={() => trackArchiveRecordOpened('edition', 'daily')}>Read this edition’s permanent record</a>
                  </VisibleArchiveRecordPlacement>
                )}
              {meta.vibeSupportingCopyEn && (
                <div className="atlas-edition__supporting-copy">{meta.vibeSupportingCopyEn}</div>
              )}
              {meta.stale && (
                <div className="atlas-edition__stale">
                  ⏳ Showing yesterday's picks while today's grid builds
                </div>
              )}
            </div>
            {selectedEditionDate && isValidVibeAtlasEditionDate(selectedEditionDate) && (
              <div className="daily-edition-share">
                <button
                  type="button"
                  onClick={() => openEditionBuilder(selectedEditionDate, 'edition_detail')}
                >
                  Rebuild this edition
                </button>
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
                <div className="daily-actions__classification">
                  <WholeCardTierControls tier={wholeCardTier} onTierChange={setWholeCardTier} />
                  <WholeCardTierBadge tier={wholeCardTier} />
                </div>
                <div className="daily-actions__primary">
                  <ExportButton
                    rawData={exportData}
                    onShareComplete={() => trackDailyDropShared(exportData.date, 'image')}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </header>

       {!gate && (
         <div className="daily-grid" id="daily-evidence">
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
       )}

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
      ) : view === 'collection' && builderSource === 'edition' && gate && activeEditionDate ? (
        <ArchiveLockedEdition
          gate={gate}
          email={archiveGateEmail}
          busy={archiveGateBusy}
          notice={archiveGateNotice}
          onEmailChange={setArchiveGateEmail}
          onSignIn={sendArchiveSignIn}
          onCheckout={startArchiveCheckout}
          onIntent={() => trackArchiveAccess('gated_intent', activeEditionDate, gate.reason)}
        />
      ) : view === 'collection' ? (
        <Collection
          key={collectionTab}
          initialType={collectionTab}
          hasCollectorAccess={hasCollectorCapability({ capabilities: membershipCapabilities })}
          builderSourceKind={builderSource}
          builderSourcePool={builderSource === 'collection' ? [] : dailyBuilderPool}
          builderSourceEditionDate={builderSource === 'edition' ? activeEditionDate ?? undefined : undefined}
          onUpgrade={() => {
            trackUpgradeStarted('grid_builder');
            navigateAtlas('membership');
          }}
          onTypeChange={(type) => {
            const viewParam = type === 'grids' ? 'collection' : type;
            window.history.replaceState({}, '', `${PUBLIC_ROUTE_PATHS.vibeAtlas}?view=${viewParam}`);
            setCollectionTab(type);
            if (type === 'builder') setBuilderSource('collection');
          }}
        />
      ) : view === 'membership' ? (
        <Membership status={membershipStatus} />
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

function ArchiveLockedEdition({
  gate,
  email,
  busy,
  notice,
  onEmailChange,
  onSignIn,
  onCheckout,
  onIntent,
}: {
  gate: import('./hooks/useStarOfDay').ArchiveGate;
  email: string;
  busy: string;
  notice: string;
  onEmailChange: (value: string) => void;
  onSignIn: (event: React.FormEvent) => void;
  onCheckout: () => void;
  onIntent: () => void;
}) {
  const edition = gate.edition;
  const billingDelay = gate.reason === 'billing_delay';
  return (
    <section className="archive-gate" aria-labelledby="archive-gate-title" onFocus={onIntent}>
      <div className="archive-gate__preview" aria-hidden="true">
        {(edition.previewThumbnails ?? []).map((image, index) => (
          <img key={`${image}-${index}`} src={archivePreviewUrl(image)} alt="" />
        ))}
      </div>
      <div className="archive-gate__copy">
        <p className="daily-archive__kicker">Founding Member archive</p>
        <h2 id="archive-gate-title">{edition.vibeEmoji} {edition.actorName}</h2>
        <p><strong>{edition.vibeLabel}</strong> · {edition.vibeLabelEn}</p>
        {edition.publicRecord && (
          <VisibleArchiveRecordPlacement
            as="nav"
            className="atlas-edition__records"
            ariaLabel="Curated public records"
            location="locked_preview"
            recordTypes={['actor', 'edition']}
            presentationKey={`locked_preview:${edition.date}`}
          >
            <a href={edition.publicRecord.actorPath} onClick={() => trackArchiveRecordOpened('actor', 'locked_preview')}>Explore {edition.actorName}’s actor record</a>
            <a href={edition.publicRecord.editionPath} onClick={() => trackArchiveRecordOpened('edition', 'locked_preview')}>Read this edition’s permanent record</a>
          </VisibleArchiveRecordPlacement>
        )}
        <p>
          {billingDelay
            ? 'Your membership status is still being confirmed. Try again shortly or review billing.'
            : 'This published preview stays open to everyone. Founding Members can unlock the complete nine-card board, save its cards, use it in Grid Builder, and export finished boards.'}
        </p>
        {notice && <p className="membership__notice" role="status">{notice}</p>}
        {gate.reason === 'sign_in' ? (
          <form className="membership__sign-in" onSubmit={onSignIn}>
            <label htmlFor="archive-gate-email">Sign in to check your archive access</label>
            <div>
              <input
                id="archive-gate-email"
                type="email"
                required
                value={email}
                onChange={event => onEmailChange(event.target.value)}
                placeholder="you@example.com"
              />
              <button disabled={Boolean(busy)}>{busy === 'sign-in' ? 'Sending…' : 'Email sign-in link'}</button>
            </div>
          </form>
        ) : (
          <button type="button" className="archive-gate__checkout" onClick={onCheckout} disabled={Boolean(busy) || billingDelay}>
            {busy === 'checkout' ? 'Opening checkout…' : 'Become a Founding Member'}
          </button>
        )}
      </div>
    </section>
  );
}

function archivePreviewUrl(url: string): string {
  return url.startsWith('/.netlify/functions/image-proxy')
    ? url
    : `/.netlify/functions/image-proxy?url=${encodeURIComponent(url)}`;
}

function ArchiveEditionCard({
  edition,
  index,
  issueNumber,
}: {
  edition: StarOfDayArchiveEntry;
  index: number;
  issueNumber: number;
}) {
  const images = edition.previewThumbnails ?? [];
  const isLatest = index === 0;
  const className = [
    'archive-card',
    isLatest ? 'archive-card--latest' : '',
    edition.legendaryMisprint ? 'archive-card--misprint' : '',
  ].filter(Boolean).join(' ');
  const href = edition.publicRecord?.editionPath
    ?? `${PUBLIC_ROUTE_PATHS.vibeAtlas}?date=${encodeURIComponent(edition.date)}`;

  return (
    <article className={className}>
      <VisibleArchiveRecordPlacement
        as="a"
        className="archive-card__main"
        href={href}
        location="full_archive"
        recordTypes={edition.publicRecord ? ['edition'] : []}
        presentationKey={`full_archive_main:${edition.date}`}
        onClick={() => {
          trackDailyArchiveEditionSelected(edition.date, isLatest);
          if (edition.publicRecord) trackArchiveRecordOpened('edition', 'full_archive');
        }}
        ariaLabel={`Open Issue ${issueNumber}, ${formatEditionDate(edition.date)}: ${edition.actorName}, ${edition.vibeLabelEn}`}
      >
      <span className="archive-card__plate" aria-hidden="true">
        {images.length > 0 ? (
          <span className="archive-card__mosaic">
            {images.map((image, imageIndex) => (
              <img
                key={`${image}-${imageIndex}`}
                src={archivePreviewUrl(image)}
                alt=""
                loading="lazy"
                decoding="async"
              />
            ))}
          </span>
        ) : (
          <span className="archive-card__placeholder">{edition.vibeEmoji}</span>
        )}
        <span className="archive-card__wash" />
        <span className="archive-card__number">
          <small>Issue</small>
          {String(issueNumber).padStart(2, '0')}
        </span>
        {edition.legendaryMisprint && (
          <span className="archive-card__misprint-seal">Legendary<br />misprint</span>
        )}
      </span>
      <span className="archive-card__caption">
        {edition.legendaryMisprint && (
          <span className="archive-card__misprint-title">
            <small>Archive anomaly · Legendary Misprint</small>
            <b>{edition.legendaryMisprintTitle ?? 'Preserved retrieval anomaly'}</b>
          </span>
        )}
        <span className="archive-card__meta">
          <time dateTime={edition.date}>{formatEditionDate(edition.date)}</time>
          <span>{isLatest ? 'Latest edition' : 'Published edition'}</span>
        </span>
        <strong>{edition.actorName}</strong>
        {edition.actorShortNameEn && <small>{edition.actorShortNameEn}</small>}
        <span className="archive-card__vibe">
          <i>{edition.vibeEmoji}</i>
          <span>{edition.vibeLabel}<em>{edition.vibeLabelEn}</em></span>
        </span>
        {edition.vibeSubtitleEn && <q>{edition.vibeSubtitleEn}</q>}
        <span className="archive-card__open">
          {edition.publicRecord
            ? 'Read the permanent edition record'
            : edition.access === 'member' ? 'Preview Founding Member edition' : 'Open the nine-card board'}
          <b aria-hidden="true">↗</b>
        </span>
      </span>
      </VisibleArchiveRecordPlacement>
      {edition.publicRecord && (
        <VisibleArchiveRecordPlacement
          as="nav"
          className="archive-card__records"
          ariaLabel={`Curated records for ${edition.actorName}`}
          location="full_archive"
          recordTypes={['actor', 'edition']}
          presentationKey={`full_archive_records:${edition.date}`}
        >
          <a href={edition.publicRecord.actorPath} onClick={() => trackArchiveRecordOpened('actor', 'full_archive')}>Actor record</a>
          <a href={edition.publicRecord.editionPath} onClick={() => trackArchiveRecordOpened('edition', 'full_archive')}>Edition record</a>
          <a
            href={`${PUBLIC_ROUTE_PATHS.vibeAtlas}?view=builder&source=edition&date=${encodeURIComponent(edition.date)}`}
            onClick={() => trackArchiveRebuildLaunched(edition.date, 'archive_card')}
          >
            Rebuild this edition
          </a>
        </VisibleArchiveRecordPlacement>
      )}
    </article>
  );
}

function ArchivePage({
  archive,
  archiveLoading,
  archiveError,
  archiveHasMore,
  archiveTotal,
  loadArchive,
  loadMoreArchive,
}: {
  archive: StarOfDayArchiveEntry[];
  archiveLoading: boolean;
  archiveError: string | null;
  archiveHasMore: boolean;
  archiveTotal: number | null;
  loadArchive: () => Promise<void>;
  loadMoreArchive: () => Promise<void>;
}) {
  const yearCount = new Set(archive.map(edition => edition.date.slice(0, 4))).size;

  return (
    <main className="atlas-archive-page">
      <header className="atlas-hero atlas-archive-page__hero">
        <div className="atlas-hero__eyebrow"><span>Fandom Vibes / studio 01</span><i /></div>
        <div className="atlas-hero__title-row">
          <div>
            <p className="atlas-hero__universe">Star of the Day · The complete collection</p>
            <h1>Archive <span>星光典藏</span></h1>
          </div>
        </div>
        <p className="atlas-hero__intro">
          Browse every published Star of the Day as it first appeared: one actor, one assigned
          mood, nine pieces of visual evidence. Rare legendary misprints remain sealed in place.
        </p>
      </header>

      <section className="daily-archive daily-archive--page" aria-labelledby="archive-page-title">
        <div className="archive-index">
          <div>
            <h2 id="archive-page-title">The Star of the Day Archive</h2>
            <p>Published boards only. Each plate opens the exact original nine-card edition.</p>
          </div>
          <dl aria-label="Archive summary">
            <div><dt>Editions</dt><dd>{(archiveTotal ?? archive.length) || '—'}</dd></div>
            <div><dt>Years</dt><dd>{yearCount || '—'}</dd></div>
            <div><dt>Format</dt><dd>3 × 3</dd></div>
          </dl>
        </div>
        {archiveLoading && archive.length === 0 ? (
          <p className="daily-archive__status">Loading published editions…</p>
        ) : archiveError && archive.length === 0 ? (
          <>
            <p className="daily-archive__status daily-archive__status--error" role="alert">
              Couldn’t load the archive. Try again.
            </p>
            <button
              type="button"
              className="daily-archive__today"
              onClick={() => void loadArchive()}
            >
              Retry loading the archive
            </button>
          </>
        ) : archive.length === 0 ? (
          <p className="daily-archive__status">No published editions are available yet.</p>
        ) : (
          <>
            <div className="archive-gallery">
              {archive.map((edition, index) => (
                <ArchiveEditionCard
                  key={edition.date}
                  edition={edition}
                  index={index}
                  issueNumber={(archiveTotal ?? archive.length) - index}
                />
              ))}
            </div>
            {archiveHasMore && (
              <>
                {archiveError && (
                  <p className="daily-archive__status daily-archive__status--error" role="alert">
                    Couldn’t load more editions. Try again.
                  </p>
                )}
                <button
                  type="button"
                  className="daily-archive__today"
                  disabled={archiveLoading}
                  onClick={() => void loadMoreArchive()}
                >
                  {archiveLoading ? 'Loading editions…' : archiveError ? 'Retry loading editions' : 'Load more editions'}
                </button>
              </>
            )}
          </>
        )}
        <footer className="archive-footer">
          <span>Fandom Vibes · Permanent edition record</span>
          <a className="daily-archive__today" href={PUBLIC_ROUTE_PATHS.vibeAtlas}>Return to today’s drop <b aria-hidden="true">→</b></a>
        </footer>
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
