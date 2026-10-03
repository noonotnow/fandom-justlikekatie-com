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
import type { SaveItemMetadata } from './hooks/useSaveItem';
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
import { ReleasedPackLibrary } from './components/ReleasedPackLibrary/ReleasedPackLibrary';
import { useSession } from './hooks/useSession';
import {
  hasMalformedGridBuilderSource,
  hasInvalidVibeAtlasEditionDate,
  initialCollectionType,
  initialGridBuilderSource,
  type GridBuilderSource,
  initialVibeAtlasEditionDate,
  initialVibeAtlasView,
  isValidVibeAtlasEditionDate,
  isVibeAtlasArchiveLocation,
  isPublishingHandoffPreview,
  resolveFandomProductRoute,
  vibeAtlasPath,
} from './utils/fandomRoutes';
import { buildDailyDropPool } from './utils/gridBuilder';
import './App.css';
import { VeteranSubmissionForm } from './components/VeteranSubmissionForm/VeteranSubmissionForm';
import {
  consumeReleasedLibrarySignInReturn,
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
  trackReleasedLibraryCollectorActivated,
  trackUpgradeStarted,
} from './utils/analytics';
import type {
  ArchiveRebuildPlacement,
  ArchiveRecordLocation,
  ArchiveRecordType,
} from './utils/analytics';
import {
  PUBLIC_ORIGIN,
  PUBLIC_ROUTE_PATHS,
  publicAlternatePaths,
  publicRouteUrl,
} from '../shared/public-routes.js';
import { stripLocalePath } from '../shared/locale.js';
import { useLocale } from './i18n/LocaleProvider';

/** Number of columns in the grid — used to calculate preview row insertion */
const GRID_COLS = 3;
const LAST_SAVED_EDITION_KEY = 'fandom_vibe_atlas_last_saved_edition';
type ErrorTranslator = (english: string, chinese: string) => string;

function publicApiErrorMessage(
  message: string,
  locale: 'en' | 'zh-CN',
  t: ErrorTranslator,
  fallbackEnglish: string,
  fallbackChinese: string,
): string {
  if (/private\s+approval\s+desk|publish(?:ing)?\s+(?:the\s+)?rescue\s+board/i.test(message)) {
    return t(fallbackEnglish, fallbackChinese);
  }
  if (locale === 'zh-CN' && !/\p{Script=Han}/u.test(message)) {
    return `${t('Original error: ', '英文原文错误：')}${message}`;
  }
  return message;
}

type DailyPackPublication =
  | { pairKey: string; status: 'checking' | 'unpublished' | 'unavailable' }
  | { pairKey: string; status: 'published'; canonical: string; cards: { thumbnailUrl: string; title: string }[] }
  | { pairKey: string; status: 'snapshot'; cards: { thumbnailUrl: string; title: string }[] };

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

function formatEditionDate(value: string, locale = 'en-US'): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function syncVibeAtlasEditionUrl(date: string | null, replace = false, localizePath: (url: string) => string = url => url) {
  const params = new URLSearchParams(window.location.search);
  if (date) {
    params.set('date', date);
  } else {
    params.delete('date');
  }

  const query = params.toString();
  const nextUrl = localizePath(`${PUBLIC_ROUTE_PATHS.vibeAtlas}${query ? `?${query}` : ''}`);
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
  const { hasAdminAccess, isSignedIn, recheck } = useSession();
  const showCollection = new URLSearchParams(window.location.search).get('view') === 'collection';

  if (showCollection) {
    return <Collection scope="middle-earth" hasCollectorAccess={hasAdminAccess} />;
  }
  return (
    <MiddleEarthWorkspace
      canGenerate={isSignedIn}
      hasAdminAccess={hasAdminAccess}
      onSessionExpired={recheck}
    />
  );
}

function VibeAtlasApp({ archiveEntry = false }: { archiveEntry?: boolean }) {
  const { locale, t, path } = useLocale();
  const dateLocale = locale === 'zh-CN' ? 'zh-CN' : 'en-US';
  const [exploreOpen, setExploreOpen] = useState(false);
  const exploreRef = useRef<HTMLDivElement>(null);
  const exploreToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!exploreOpen) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!exploreRef.current?.contains(event.target as Node)) setExploreOpen(false);
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExploreOpen(false);
        exploreToggleRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissEscape);
    };
  }, [exploreOpen]);
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
  const [view, setView] = useState<'daily' | 'collection' | 'admin' | 'membership' | 'released'>(
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
  const {
    hasAdminAccess,
    loading: adminLoading,
    recheck: recheckAdmin,
  } = useSession();
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
  } = useStarOfDay(
    (archivePage && !activeEditionDate)
    || (view === 'collection' && (builderSource === 'archive' || builderSource === 'edition'))
      ? undefined
      : activeEditionDate,
  );
  const dailyPairKey = rawData ? `${rawData.date}:${rawData.actorId}:${rawData.vibeIdx}` : '';
  const [dailyPackPublication, setDailyPackPublication] = useState<DailyPackPublication>({ pairKey: '', status: 'checking' });
  const visibleDailyPublication: DailyPackPublication = dailyPackPublication.pairKey === dailyPairKey
    ? dailyPackPublication
    : { pairKey: dailyPairKey, status: 'checking' };
  useEffect(() => {
    if (!rawData?.actorId || rawData.vibeIdx === undefined || activeEditionDate) return;
    const controller = new AbortController();
    const pairKey = `${rawData.date}:${rawData.actorId}:${rawData.vibeIdx}`;
    setDailyPackPublication({ pairKey, status: 'checking' });
    const params = new URLSearchParams({
      actorId: rawData.actorId,
      vibeIdx: String(rawData.vibeIdx),
      date: rawData.date,
    });
    fetch(`/.netlify/functions/public-released-pack-preview?${params}`, { signal: controller.signal })
      .then(async response => {
        if (response.status === 404) return { pairKey, status: 'unpublished' } as DailyPackPublication;
        if (!response.ok) return { pairKey, status: 'unavailable' } as DailyPackPublication;
        const preview: unknown = await response.json();
        if (!preview || typeof preview !== 'object') {
          return { pairKey, status: 'unavailable' } as DailyPackPublication;
        }
        const result = preview as {
          kind?: string;
          canonical?: string;
          date?: string;
          actorId?: string;
          vibeIdx?: number;
          cards?: { thumbnailUrl?: string; title?: string }[];
          preview?: { cards?: { thumbnailUrl?: string; title?: string }[] };
        };
        const published = result.kind === 'vibe-atlas-released-pack'
          && result.canonical?.startsWith(`${PUBLIC_ORIGIN}/vibe-atlas/packs/`);
        const snapshot = result.kind === 'vibe-atlas-daily-pack-snapshot'
          && result.date === rawData.date
          && result.actorId === rawData.actorId
          && result.vibeIdx === rawData.vibeIdx;
        const cards = published ? result.preview?.cards : snapshot ? result.cards : null;
        if (!cards || cards.length !== 9 || cards.some(card => !card.thumbnailUrl?.startsWith('https://'))) {
          return { pairKey, status: 'unavailable' } as DailyPackPublication;
        }
        return {
          pairKey,
          status: published ? 'published' : 'snapshot',
          ...(published ? { canonical: result.canonical } : {}),
          cards: cards.map(card => ({ thumbnailUrl: card.thumbnailUrl!, title: card.title || '' })),
        } as DailyPackPublication;
      })
      .then(status => { if (!controller.signal.aborted) setDailyPackPublication(status); })
      .catch(() => { if (!controller.signal.aborted) setDailyPackPublication({ pairKey, status: 'unavailable' }); });
    return () => controller.abort();
  }, [rawData?.actorId, rawData?.vibeIdx, rawData?.date, activeEditionDate]);
  const dailyBuilderPool = useMemo(
    () => rawData ? buildDailyDropPool(rawData) : [],
    [rawData],
  );
  const [imageTiers, setImageTiers] = useState<Record<string, ImageTier>>({});
  const [personalReaction, setPersonalReaction] = useState<{
    boardKey: string | null;
    reason: 'nailed_vibe' | 'every_image_belongs' | 'unforgettable_set' | null;
  }>({ boardKey: null, reason: null });
  const [recoveredReportTarget, setRecoveredReportTarget] = useState<{ date: string; imageId: string } | null>(null);
  const [membershipCapabilities, setMembershipCapabilities] = useState<MembershipCapability[]>([]);
  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus | null>(null);
  const canUsePremiumTools = hasCollectorCapability({ capabilities: membershipCapabilities })
    || isPublishingHandoffPreview(window.location.hostname, window.location.search);
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
  const personalReason = personalReaction.boardKey === boardKey ? personalReaction.reason : null;
  const exportData = rawData ? {
    ...applyWholeCardTierOverride(rawData, wholeCardTier),
    personalReaction: {
      tier: wholeCardTier,
      ...(wholeCardTier === 'legendary' && personalReason ? { reason: personalReason } : {}),
    },
  } : null;
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
          // useSession refreshes admin authority before the Admin view renders.
          recheckAdmin();
          const archiveReturnDate = destination.startsWith('archive:')
            ? destination.slice('archive:'.length)
            : null;
          if (
            archiveReturnDate
            && isValidVibeAtlasEditionDate(archiveReturnDate)
          ) {
            try {
              const returnedReport = JSON.parse(localStorage.getItem('fandom_daily_report_return') || 'null') as { date?: string; imageId?: string; expiresAt?: number } | null;
              if (
                returnedReport?.date === archiveReturnDate
                && returnedReport.imageId
                && typeof returnedReport.expiresAt === 'number'
                && returnedReport.expiresAt > Date.now()
                && returnedReport.expiresAt <= Date.now() + 6 * 60 * 60 * 1000
              ) {
                setRecoveredReportTarget({ date: returnedReport.date, imageId: returnedReport.imageId });
              } else {
                localStorage.removeItem('fandom_daily_report_return');
              }
            } catch {
              localStorage.removeItem('fandom_daily_report_return');
            }
            syncVibeAtlasEditionUrl(archiveReturnDate, true, path);
            setSelectedEditionDate(archiveReturnDate);
            setView('daily');
            trackArchiveAccess('restored', archiveReturnDate, 'sign_in');
          } else {
            const releasedReturn = destination === 'collection'
              ? consumeReleasedLibrarySignInReturn()
              : null;
            if (releasedReturn) {
              const params = new URLSearchParams({
                view: 'released',
                source: releasedReturn.source,
              });
              if (releasedReturn.actorId) params.set('actorId', releasedReturn.actorId);
              if (releasedReturn.vibeIndex !== undefined) {
                params.set('vibeIdx', String(releasedReturn.vibeIndex));
              }
              window.history.replaceState(
                {},
                '',
                path(`${PUBLIC_ROUTE_PATHS.vibeAtlas}?${params.toString()}`),
              );
              setView('released');
            } else if (
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
          publicApiErrorMessage(
            error instanceof Error ? error.message : 'The sign-in link could not be used.',
            locale,
            t,
            'The sign-in link could not be used.',
            '无法使用此登录链接。',
          ),
        );
        setView('collection');
      });
  }, [locale, path, refreshMembership, t]);

  useEffect(() => {
    if (!recoveredReportTarget || loading || rawData?.date !== recoveredReportTarget.date) return;
    const index = gridImages.findIndex(image => image.archiveImageId === recoveredReportTarget.imageId
      || image.id === recoveredReportTarget.imageId);
    if (index >= 0) {
      const returnedImageId = gridImages[index].archiveImageId || gridImages[index].id;
      // Daily payloads can use a public MEDIA URL while Archive payloads use a
      // canonical card id. Both must name the same displayed immutable image.
      if (returnedImageId !== recoveredReportTarget.imageId) {
        try {
          const oldKey = `fandom_daily_report_draft:${recoveredReportTarget.date}:${recoveredReportTarget.imageId}`;
          const draft = localStorage.getItem(oldKey);
          if (draft) localStorage.setItem(`fandom_daily_report_draft:${recoveredReportTarget.date}:${returnedImageId}`, draft);
          const target = JSON.parse(localStorage.getItem('fandom_daily_report_return') || 'null');
          if (target) localStorage.setItem('fandom_daily_report_return', JSON.stringify({ ...target, imageId: returnedImageId }));
        } catch { /* The form remains usable when local recovery storage fails. */ }
        setRecoveredReportTarget({ date: recoveredReportTarget.date, imageId: returnedImageId });
      }
      setLightboxIndex(index);
    }
  }, [gridImages, loading, rawData?.date, recoveredReportTarget]);

  useEffect(() => {
    if (
      membershipResolved
      && hasCollectorCapability(membershipStatus)
      && new URLSearchParams(window.location.search).get('membership') === 'success'
    ) {
      trackReleasedLibraryCollectorActivated();
    }
  }, [membershipResolved, membershipStatus]);

  useEffect(() => {
    // Keep old PLAN URLs usable, but do not leave the retired product name in
    // the browser location after routing them to the Operator Console.
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') !== 'plan') return;
    params.delete('view');
    params.set('admin', 'true');
    window.history.replaceState({}, '', path(`${PUBLIC_ROUTE_PATHS.vibeAtlas}?${params.toString()}`));
  }, [path]);

  useEffect(() => {
    if (!hasMalformedGridBuilderSource(window.location.search)) return;
    window.history.replaceState({}, '', path(`${PUBLIC_ROUTE_PATHS.vibeAtlas}?view=builder&source=archive`));
  }, [path]);

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
    const normalizedPath = stripLocalePath(window.location.pathname).replace(/\/+$/, '') || '/';
    const privateView = normalizedPath === '/auth/verify'
      || window.location.search.length > 0
      || view === 'collection'
      || view === 'admin'
      || view === 'membership'
      || view === 'released';
    const title = archivePage
      ? t('Vibe Atlas Archive | Fandom Vibes', 'Vibe Atlas 往期典藏｜每日古装剧收藏卡 | Fandom Vibes')
      : view === 'daily'
        ? t('Vibe Atlas | Daily C-Drama Collectible Cards | Fandom Vibes', 'Vibe Atlas｜每日古装剧收藏卡 | Fandom Vibes')
      : view === 'membership'
        ? t('Vibe Atlas Founding Member | Fandom Vibes', '氛围图鉴创始会员 | Fandom Vibes')
        : view === 'released'
          ? t('Released Vibe Packs | Fandom Vibes', '已发布氛围包 | Fandom Vibes')
        : view === 'collection'
          ? t('Your Vibe Atlas Studio | Fandom Vibes', '你的氛围图鉴工作室 | Fandom Vibes')
          : t('Operator Console | Fandom Vibes', '运营控制台 | Fandom Vibes');
    const description = archivePage
      ? t('Browse past Vibe Atlas C-drama collectible card drops, with one star, one vibe, and nine pieces of evidence in every edition.', '浏览 Vibe Atlas 往期古装剧收藏卡，每期包含一位演员、一个氛围主题和九张精选图片。')
      : t('Browse today’s Vibe Atlas C-drama collectible: one star, one vibe, and nine pieces of evidence.', '浏览今日 Vibe Atlas 古装剧收藏卡：一位演员、一个氛围主题，以及九张精选图片。');
    const publicPath = archivePage ? PUBLIC_ROUTE_PATHS.vibeAtlasArchive : PUBLIC_ROUTE_PATHS.vibeAtlas;
    document.title = title;

    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
      ?? document.head.appendChild(document.createElement('meta'));
    robots.name = 'robots';
    robots.content = privateView ? 'noindex,follow' : 'index,follow,max-image-preview:large';

    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?? document.head.appendChild(document.createElement('link'));
    canonical.rel = 'canonical';
    canonical.href = publicRouteUrl(path(publicPath));

    for (const alternate of publicAlternatePaths(publicPath)) {
      const link = document.querySelector<HTMLLinkElement>(
        `link[rel="alternate"][hreflang="${alternate.hreflang}"]`,
      ) ?? document.head.appendChild(document.createElement('link'));
      link.rel = 'alternate';
      link.hreflang = alternate.hreflang;
      link.href = publicRouteUrl(alternate.path);
    }

    const setMetaContent = (selector: string, attribute: 'name' | 'property', key: string, content: string) => {
      const meta = document.querySelector<HTMLMetaElement>(selector)
        ?? document.head.appendChild(document.createElement('meta'));
      meta.setAttribute(attribute, key);
      meta.content = content;
    };
    setMetaContent('meta[property="og:title"]', 'property', 'og:title', title);
    setMetaContent('meta[property="og:description"]', 'property', 'og:description', description);
    setMetaContent('meta[property="og:url"]', 'property', 'og:url', publicRouteUrl(path(publicPath)));
    setMetaContent('meta[property="og:image"]', 'property', 'og:image', `${PUBLIC_ORIGIN}/assets/c-drama-fandom/legendary-grid-liu-xueyi-2026-08-29.webp`);
    setMetaContent('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    setMetaContent('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    setMetaContent('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    setMetaContent('meta[name="twitter:image"]', 'name', 'twitter:image', `${PUBLIC_ORIGIN}/assets/c-drama-fandom/legendary-grid-liu-xueyi-2026-08-29.webp`);
  }, [archivePage, path, t, view]);

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
    window.history.replaceState({}, '', path(PUBLIC_ROUTE_PATHS.vibeAtlasArchive));
    if (!archive.length && !archiveLoading) void loadArchive();
  }, [archive.length, archiveLoading, loadArchive, path]);

  const selectEdition = (date: string | null) => {
    setExpandedId(null);
    setLightboxIndex(null);
    setDailyGridZoomOpen(false);
    setImageTiers({});
    if (date !== null && !isValidVibeAtlasEditionDate(date)) {
      syncVibeAtlasEditionUrl(null, true, path);
      setSelectedEditionDate(null);
      openArchivePicker();
      return;
    }
    setArchivePage(false);
    syncVibeAtlasEditionUrl(date, false, path);
    setSelectedEditionDate(date);
  };

  const copyArchivedEditionLink = async () => {
    if (!selectedEditionDate || !isValidVibeAtlasEditionDate(selectedEditionDate)) return;

    const shareUrl = new URL(path(PUBLIC_ROUTE_PATHS.vibeAtlas), window.location.origin);
    shareUrl.searchParams.set('date', selectedEditionDate);

    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(shareUrl.toString());
      setEditionShareNotice(t('Copied link for', '已复制链接：') + ` ${formatEditionDate(selectedEditionDate, dateLocale)}.`);
      trackDailyDropShared(selectedEditionDate, 'edition_link');
    } catch {
      setEditionShareNotice(
        t('Could not copy this archived edition link. Please copy the address from your browser.', '无法复制此期刊链接。请从浏览器地址栏复制链接。'),
      );
    }
  };

  const openArchivePage = () => {
    setExploreOpen(false);
    setArchivePage(true);
    setSelectedEditionDate(null);
    setExpandedId(null);
    setLightboxIndex(null);
    setDailyGridZoomOpen(false);
    window.history.pushState({}, '', path(PUBLIC_ROUTE_PATHS.vibeAtlasArchive));
    if (!archive.length && !archiveLoading) void loadArchive();
  };

  const navigateAtlas = (
    destination: 'daily' | 'collection' | 'membership' | 'released',
    tab: 'grids' | 'results' | 'builder' = 'grids',
  ) => {
    setExploreOpen(false);
    const nextPath = destination === 'daily'
      ? path(vibeAtlasPath())
      : destination === 'membership'
        ? path(vibeAtlasPath({ view: 'membership' }))
        : destination === 'released'
          ? path(vibeAtlasPath({ view: 'released' }))
          : path(vibeAtlasPath({
            view: tab === 'grids' ? 'collection' : tab,
            ...(tab === 'builder' ? { source: 'collection' } : {}),
          }));
    window.history.pushState({}, '', nextPath);
    setArchivePage(false);
    setCollectionTab(tab);
    setBuilderSource('collection');
    setView(destination);
    if (destination === 'daily') selectEdition(null);
  };

  const openEditionBuilder = (date: string, placement: ArchiveRebuildPlacement) => {
    if (!isValidVibeAtlasEditionDate(date)) return;
    trackArchiveRebuildLaunched(date, placement);
    window.history.pushState({}, '', path(`${PUBLIC_ROUTE_PATHS.vibeAtlas}?view=builder&source=edition&date=${encodeURIComponent(date)}`));
    setArchivePage(false);
    setView('collection');
    setCollectionTab('builder');
    setBuilderSource('edition');
    setSelectedEditionDate(date);
  };

  useEffect(() => {
    const restoreUrlState = () => {
      const malformedBuilderSource = hasMalformedGridBuilderSource(window.location.search);
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
      if (malformedBuilderSource) {
        window.history.replaceState({}, '', path(`${PUBLIC_ROUTE_PATHS.vibeAtlas}?view=builder&source=archive`));
      }
      if (restoredView === 'daily' && !restoredArchivePage && invalidEditionDate) {
        syncVibeAtlasEditionUrl(null, true, path);
        openArchivePicker();
      }
    };
    window.addEventListener('popstate', restoreUrlState);
    return () => window.removeEventListener('popstate', restoreUrlState);
  }, [openArchivePicker, path]);

  useEffect(() => {
    if (!hasInvalidVibeAtlasEditionDate(window.location.search)) return;
    syncVibeAtlasEditionUrl(null, true, path);
    setSelectedEditionDate(null);
    if (view === 'daily' && !archivePage) openArchivePicker();
  }, [archivePage, openArchivePicker, view]);

  useEffect(() => {
    // A valid date can still point at a cache entry that has been retired or
    // was never generated. Return the visitor to a usable picker rather than
    // leaving them on an empty/error grid.
    if (view !== 'daily' || !selectedEditionDate || loading || !error) return;
    syncVibeAtlasEditionUrl(null, true, path);
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
      setArchiveGateNotice(publicApiErrorMessage(
        error instanceof Error ? error.message : 'Could not send the sign-in link.',
        locale,
        t,
        'Could not send the sign-in link.',
        '无法发送登录链接。',
      ));
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
      setArchiveGateNotice(publicApiErrorMessage(
        error instanceof Error ? error.message : 'Checkout could not be opened.',
        locale,
        t,
        'Checkout could not be opened.',
        '无法打开结账页面。',
      ));
      setArchiveGateBusy('');
    }
  };

  /**
   * Render grid items with inline preview rows inserted after the row
   * containing the expanded item.
   */
  const renderGridItems = () => {
    const elements: React.ReactNode[] = [];
    const saveMetadata: SaveItemMetadata | undefined = rawData && meta ? {
      actorId: rawData.actorId,
      actorName: meta.actorName,
      actorNameEn: rawData.actorShortNameEn,
      vibeLabel: meta.vibeLabel,
      vibeLabelEn: meta.vibeLabelEn,
      vibeEmoji: meta.vibeEmoji,
      date: rawData.date,
    } : undefined;

    for (let i = 0; i < gridImages.length; i++) {
      const item = gridImages[i];

      // Grid item
      elements.push(
        <GridItem
          key={item.id}
          {...item}
          tier={imageTiers[item.id] ?? null}
          saveMetadata={saveMetadata}
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
            saveMetadata={saveMetadata}
            onClose={() => setExpandedId(null)}
            onSaveChange={saved => handleCardSaveChange(
              gridImages.findIndex(gridItem => gridItem.id === expandedInThisRow.id),
              saved,
            )}
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
    <div className="app fandom-atlas-page" lang={locale === 'zh-CN' ? 'zh-CN' : 'en'}>
      <ThemeToggle isDark={isDark} onToggle={toggleDarkMode} />

      {/* Navigation bar */}
      <nav className="fandom-universe-nav" aria-label={t('Fandom Vibes navigation', 'Fandom Vibes 导航')}>
        <a className="fandom-universe-brand" href={path('/')}>
          <span className="fandom-universe-mark">FV</span>
          <span><strong>Fandom Vibes</strong><small>{t('Worldbuilding launchpad', '世界构筑创作入口')}</small></span>
        </a>
        <div className="fandom-atlas-nav" aria-label={t('Vibe Atlas workspace', '氛围图鉴工作区')}>
          <span className="fandom-atlas-nav__title">{t('Vibe Atlas', '氛围图鉴')}</span>
          <button
            type="button"
            aria-label={t('Daily drop', '每日卡组')}
            onClick={() => navigateAtlas('daily')}
            aria-current={!archivePage && view === 'daily' ? 'page' : undefined}
            className={!archivePage && view === 'daily' ? 'fandom-atlas-nav__active' : ''}
          >
            <span>{t('Today', '今日')}</span>
          </button>
          <button
            type="button"
            aria-label={t('Your Collection · Saved Grids and Grid Builder', '我的收藏 · 已保存的九宫格与九宫格创作器')}
            onClick={() => navigateAtlas('collection', 'grids')}
            aria-current={!archivePage && view === 'collection' ? 'page' : undefined}
            className={!archivePage && view === 'collection' ? 'fandom-atlas-nav__active' : ''}
          >
            <span>{t('Your Collection', '我的收藏')}</span>
          </button>
          <div
            className="fandom-atlas-nav__group"
            ref={exploreRef}
            onBlur={event => {
              if (!event.currentTarget.contains(event.relatedTarget)) setExploreOpen(false);
            }}
          >
            <button
              ref={exploreToggleRef}
              type="button"
              aria-expanded={exploreOpen}
              aria-controls="atlas-explore-links"
              className={archivePage || view === 'released' ? 'fandom-atlas-nav__active' : ''}
              onClick={() => setExploreOpen(open => !open)}
            >
              <span>{t('Explore', '探索')} <span aria-hidden="true" className="fandom-atlas-nav__chevron">⌄</span></span>
            </button>
            {exploreOpen && (
              <div id="atlas-explore-links" className="fandom-atlas-nav__panel">
                <p>{t('Discover', '发现')}</p>
                <button type="button" aria-current={!archivePage && view === 'released' ? 'page' : undefined} onClick={() => navigateAtlas('released')}>{t('Released packs', '已发布氛围包')}</button>
                <button type="button" aria-label={t('Vibe Atlas archive', '氛围图鉴典藏')} aria-current={archivePage ? 'page' : undefined} onClick={openArchivePage}>{t('Archive', '典藏')}</button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigateAtlas('membership')}
            aria-current={!archivePage && view === 'membership' ? 'page' : undefined}
            className={!archivePage && view === 'membership' ? 'fandom-atlas-nav__active' : ''}
          >
            <span>{t('Membership', '会员')}</span>
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
        <div className="atlas-hero__eyebrow"><span>{t('Fandom Vibes / studio 01', 'Fandom Vibes / 工作室 01')}</span><i /></div>
        <div className="atlas-hero__title-row">
          <div>
            <p className="atlas-hero__universe">{t('A daily C-drama card drop', '每日中剧卡组')}</p>
            <h1>{locale === 'zh-CN' ? '氛围图鉴' : 'Vibe Atlas'} {locale === 'zh-CN' ? null : <span lang="zh-CN">氛围图鉴</span>}</h1>
          </div>
          <p className="atlas-hero__thesis">{t('One star. One vibe. Nine pieces of evidence.', '一位明星，一种氛围，九份心动证据。')}</p>
        </div>
         <p className="atlas-hero__hook">
           <em>{t('Collect the evidence. Confirm your type.', '收集心动证据，确认你的偏爱。')}</em><br />
           <span lang="zh-CN">九张证据，一眼心动</span>
         </p>
         <p className="atlas-hero__intro">{t('Every day, Vibe Atlas pairs one C-drama star with one very specific kind of heartthrob energy. Browse nine collectible pieces of evidence, save the ones that understand your type, and build your own 3×3.', '每天，氛围图鉴都会为一位中剧明星配上一种独特的心动气质。浏览九份可收藏的视觉证据，保存最懂你偏爱的卡片，再拼出专属 3×3 九宫格。')}</p>
         <div className="atlas-hero__actions" aria-label={t('Vibe Atlas actions', '氛围图鉴操作')}>
           <a href="#daily-evidence">{t('Browse today’s drop', '浏览今日卡组')}</a>
           <a href={path(`${PUBLIC_ROUTE_PATHS.vibeAtlas}?view=builder&source=daily`)}>{t('Open the Grid Builder', '打开九宫格创作器')}</a>
            {rawData?.actorId && !selectedEditionDate && (
              <a href="#todays-released-pack">{t('Open today’s free released pack', '查看今日免费氛围包')}</a>
            )}
            {rawData?.actorId && (
              <a href={path(vibeAtlasPath({
                view: 'released',
                source: 'daily_star',
                actorId: rawData.actorId,
                vibeIdx: rawData.vibeIdx,
              }))}>
                {t('Explore released packs for', '探索此演员的已发布氛围包：')} {locale === 'zh-CN' ? rawData.actorName : rawData.actorShortNameEn || rawData.actorName}
              </a>
            )}
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
                {selectedEditionDate ? `${t('Archived card drop', '典藏卡组')} · ${formatEditionDate(meta.date, dateLocale)}` : t("Today's curated card drop", '今日精选卡组')}
              </div>
              <div className="atlas-edition__name">
                <span>{t("Today's star", '今日之星')}</span> {meta.vibeEmoji} {meta.actorName}
              </div>
              <div className="atlas-edition__name">
                <span>{t("Today's vibe", '今日氛围')}</span> {meta.vibeLabel}
              </div>
              <div className="atlas-edition__subline">
                {locale === 'zh-CN' ? `英文：${meta.vibeLabelEn} — ${meta.vibeSubtitleEn}` : `${meta.vibeLabelEn} — ${meta.vibeSubtitleEn}`}
              </div>
                {rawData?.publicRecord && (
                  <VisibleArchiveRecordPlacement
                    as="nav"
                    className="atlas-edition__records"
                    ariaLabel={t('Curated public records', '精选公开档案')}
                    location="daily"
                    recordTypes={['actor', 'edition']}
                    presentationKey={`daily:${rawData.publicRecord.actorPath}:${rawData.publicRecord.editionPath}`}
                  >
                    <a href={path(rawData.publicRecord.actorPath)} onClick={() => trackArchiveRecordOpened('actor', 'daily')}>{t('Explore actor record', '查看演员档案')} · {meta.actorName}</a>
                    <a href={path(rawData.publicRecord.editionPath)} onClick={() => trackArchiveRecordOpened('edition', 'daily')}>{t('Read this edition’s permanent record', '阅读本期永久档案')}</a>
                  </VisibleArchiveRecordPlacement>
                )}
              {meta.vibeSupportingCopyEn && (
                <div className="atlas-edition__supporting-copy">{locale === 'zh-CN' ? `英文说明：${meta.vibeSupportingCopyEn}` : meta.vibeSupportingCopyEn}</div>
              )}
              {meta.stale && (
                <div className="atlas-edition__stale">
                  ⏳ {t("Showing yesterday's picks while today's grid builds", '今日九宫格正在生成，暂时显示昨日精选')}
                </div>
              )}
            </div>
            {selectedEditionDate && isValidVibeAtlasEditionDate(selectedEditionDate) && (
              <div className="daily-edition-share">
                <button
                  type="button"
                  onClick={() => openEditionBuilder(selectedEditionDate, 'edition_detail')}
                >
                  {t('Rebuild this edition', '重建本期九宫格')}
                </button>
                <button type="button" onClick={copyArchivedEditionLink}>
                  {t('Copy archived edition link', '复制本期典藏链接')}
                </button>
                <p className="daily-edition-share__notice" role="status" aria-live="polite" aria-atomic="true">
                  {editionShareNotice}
                </p>
              </div>
            )}
            {rawData && exportData && (
              <div className="daily-actions">
                <div className="daily-actions__classification">
                  <WholeCardTierControls
                    tier={wholeCardTier}
                    onTierChange={tier => {
                      setWholeCardTier(tier);
                      if (tier !== 'legendary') setPersonalReaction({ boardKey, reason: null });
                    }}
                    reason={personalReason}
                    onReasonChange={reason => setPersonalReaction({ boardKey, reason })}
                  />
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

       {!gate && rawData && !selectedEditionDate && (
         <section className="daily-released-pack" id="todays-released-pack" aria-labelledby="todays-released-pack-title">
           <div className="daily-released-pack__intro">
             <p className="membership__label">{t('Free today · Star of the Day released Vibe Pack', '今日免费 · 今日之星已发布氛围包')}</p>
             <h2 id="todays-released-pack-title">{rawData.vibeEmoji} {locale === 'zh-CN' ? rawData.actorName : rawData.actorShortNameEn || rawData.actorName} · {locale === 'zh-CN' ? rawData.vibeLabel : rawData.vibeLabelEn || rawData.vibeLabel}</h2>
             <p>{locale === 'zh-CN' ? rawData.vibeSubtitle : rawData.vibeSubtitleEn || rawData.vibeSubtitle}</p>
             {(rawData.vibeSupportingCopyEn || rawData.vibeSupportingCopy) && (
               <p>{locale === 'zh-CN' ? rawData.vibeSupportingCopy || (rawData.vibeSupportingCopyEn ? `英文说明：${rawData.vibeSupportingCopyEn}` : '') : rawData.vibeSupportingCopyEn || rawData.vibeSupportingCopy}</p>
             )}
           </div>
           <div className="daily-released-pack__access">
             <strong>{t('Today’s pack is free on this homepage.', '今日氛围包可在此首页免费浏览。')}</strong>
             {visibleDailyPublication.status === 'published' ? (
               <p>{t('This first daily grid also has a permanent public record.', '今日首个九宫格也有永久公开档案。')} <a href={path(visibleDailyPublication.canonical)}>{t('View the released pack', '查看已发布氛围包')}</a>.</p>
             ) : visibleDailyPublication.status === 'snapshot' ? (
               <p>{t('Today’s first grid is saved as a public snapshot. A permanent editorial page is not published yet.', '今日首个九宫格已保存为公开快照，永久编辑页面尚未发布。')}</p>
             ) : visibleDailyPublication.status === 'unpublished' ? (
               <p>{t('A permanent public preview has not been published for this pairing. Today’s nine cards remain free here.', '这组演员与氛围尚未发布永久公开预览。今日九张卡片仍可在此免费浏览。')}</p>
             ) : (
               <p>{t('Permanent preview status is', '永久预览状态：')} {visibleDailyPublication.status === 'checking' ? t('being checked', '正在检查') : t('temporarily unavailable', '暂时无法使用')}{t('. Today’s nine cards remain free here.', '。今日九张卡片仍可在此免费浏览。')}</p>
             )}
             <p>{t('The full released-pack library stays available to Fandom Collectors.', '完整的已发布氛围包图书馆仅向 Fandom 收藏会员开放。')}</p>
              <a href={path(vibeAtlasPath({
                view: 'released',
                source: 'daily_star',
                actorId: rawData.actorId,
                vibeIdx: rawData.vibeIdx,
              }))}>
               {t('Open fresh grids in the Collector library', '在收藏会员图书馆中打开新九宫格')}
             </a>
           </div>
           {(visibleDailyPublication.status === 'published' || visibleDailyPublication.status === 'snapshot') && (
             <div className="daily-released-pack__teaser" aria-label={t('First daily grid teaser', '今日首个九宫格预览')}>
               {visibleDailyPublication.cards.slice(0, 6).map((card, index) => (
                 <img key={index} src={card.thumbnailUrl} alt={card.title || `${locale === 'zh-CN' ? rawData.vibeLabel : rawData.vibeLabelEn || rawData.vibeLabel} ${t('card', '卡片')} ${index + 1}`} loading="lazy" />
               ))}
             </div>
           )}
         </section>
       )}

       {!gate && (
         <div className="daily-grid" id="daily-evidence">
          <div className="daily-grid__header">
            <h2>{t('Today’s evidence', '今日心动证据')}</h2>
            <p>{t('Nine cards from today’s star × Vibe Pack.', '来自今日之星 × 氛围包的九张卡片。')}</p>
          </div>
          {!loading && !error && gridImages.length > 0 && (
            <button type="button" className="daily-grid__zoom" onClick={() => setDailyGridZoomOpen(true)}>
              ⛶ {t('View whole grid', '查看完整九宫格')}
            </button>
          )}
          <div className="grid">
            {loading
              ? Array.from({ length: 9 }).map((_, i) => <GridItemSkeleton key={i} />)
              : error
                ? <div className="col-span-3 text-center py-8 text-gray-500">
                    {publicApiErrorMessage(
                      error,
                      locale,
                      t,
                      'Today’s Vibe Atlas card drop could not be loaded. Please try again later.',
                      '今日 Vibe Atlas 卡组暂时无法加载，请稍后重试。',
                    )}
                  </div>
                : renderGridItems()
            }
          </div>
        </div>
       )}

      {dailyGridZoomOpen && meta && (
        <ArtifactZoomDialog
          title={`${meta.vibeEmoji} ${meta.actorName}`}
          subtitle={locale === 'zh-CN' ? `${meta.vibeLabel} · 英文：${meta.vibeLabelEn}` : `${meta.vibeLabel} · ${meta.vibeLabelEn}`}
          images={gridImages.map(image => ({ src: image.thumbnail, alt: image.title }))}
          footer={`${gridImages.length} ${t(gridImages.length === 1 ? 'source result' : 'source results', gridImages.length === 1 ? '条来源结果' : '条来源结果')} · ${meta.date}`}
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
          recoverDailyReport={Boolean(
            recoveredReportTarget
            && recoveredReportTarget.date === rawData?.date
            && (gridImages[lightboxIndex]?.archiveImageId || gridImages[lightboxIndex]?.id) === recoveredReportTarget.imageId,
          )}
          onDailyReportRecovered={() => setRecoveredReportTarget(null)}
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
          hasCollectorAccess={canUsePremiumTools}
          membershipResolved={membershipResolved}
          builderSourceKind={builderSource}
          builderSourcePool={builderSource === 'daily' ? dailyBuilderPool : []}
          builderSourceEditionDate={builderSource === 'edition' ? activeEditionDate ?? undefined : undefined}
          onUpgrade={() => {
            trackUpgradeStarted('grid_builder');
            navigateAtlas('membership');
          }}
          onTypeChange={(type) => {
            const viewParam = type === 'grids' ? 'collection' : type;
            const sourceParam = type === 'builder' ? '&source=collection' : '';
            window.history.pushState({}, '', path(`${PUBLIC_ROUTE_PATHS.vibeAtlas}?view=${viewParam}${sourceParam}`));
            setCollectionTab(type);
            if (type === 'builder') setBuilderSource('collection');
          }}
        />
      ) : view === 'released' ? (
        <ReleasedPackLibrary
          status={membershipStatus}
          membershipResolved={membershipResolved}
          currentRelease={rawData?.actorId && Number.isInteger(rawData?.vibeIdx)
            ? {
              actorId: rawData.actorId,
              vibeIdx: rawData.vibeIdx as number,
            }
            : null}
          actorName={rawData?.actorId === new URLSearchParams(window.location.search).get('actorId')
            ? rawData.actorShortNameEn || rawData.actorName
            : undefined}
          source={(() => {
            const value = new URLSearchParams(window.location.search).get('source');
            return value === 'daily_star' || value === 'public_record' || value === 'article'
              ? value
              : 'library_navigation';
          })()}
          actorId={new URLSearchParams(window.location.search).get('actorId')}
          vibeIndex={(() => {
            const value = new URLSearchParams(window.location.search).get('vibeIdx');
            return value !== null && value !== '' && Number.isInteger(Number(value))
              ? Number(value)
              : null;
          })()}
        />
      ) : view === 'membership' ? (
        <Membership status={membershipStatus} />
      ) : adminLoading ? (
        <div className="admin-gate-loading" role="status" aria-label={t('Checking admin session…', '正在检查管理员会话…')} />
      ) : !hasAdminAccess ? (
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
  const { t, path } = useLocale();
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
        <p className="daily-archive__kicker">{t('Founding Member archive', '创始会员典藏')}</p>
        <h2 id="archive-gate-title">{edition.vibeEmoji} {edition.actorName}</h2>
        <p><strong>{edition.vibeLabel}</strong> · {edition.vibeLabelEn}</p>
        {edition.publicRecord && (
          <VisibleArchiveRecordPlacement
            as="nav"
            className="atlas-edition__records"
          ariaLabel={t('Curated public records', '精选公开档案')}
            location="locked_preview"
            recordTypes={['actor', 'edition']}
            presentationKey={`locked_preview:${edition.date}`}
          >
            <a href={path(edition.publicRecord.actorPath)} onClick={() => trackArchiveRecordOpened('actor', 'locked_preview')}>{t('Explore actor record', '查看演员档案')} · {edition.actorName}</a>
            <a href={path(edition.publicRecord.editionPath)} onClick={() => trackArchiveRecordOpened('edition', 'locked_preview')}>{t('Read this edition’s permanent record', '阅读本期永久档案')}</a>
          </VisibleArchiveRecordPlacement>
        )}
        <p>
          {billingDelay
            ? t('Your membership status is still being confirmed. Try again shortly or review billing.', '会员状态仍在确认中。请稍后重试，或查看账单。')
            : t('This published preview stays open to everyone. Founding Members can unlock the complete nine-card board, save its cards, use it in Grid Builder, and export finished boards.', '此公开预览对所有人开放。创始会员可解锁完整九宫格、收藏其中卡片、在九宫格创作器中使用并导出完成的作品。')}
        </p>
        {notice && <p className="membership__notice" role="status">{notice}</p>}
        {gate.reason === 'sign_in' ? (
          <form className="membership__sign-in" onSubmit={onSignIn}>
            <label htmlFor="archive-gate-email">{t('Sign in to check your archive access', '登录以检查典藏访问权限')}</label>
            <div>
              <input
                id="archive-gate-email"
                type="email"
                required
                value={email}
                onChange={event => onEmailChange(event.target.value)}
                placeholder={t('you@example.com', 'you@example.com')}
              />
              <button disabled={Boolean(busy)}>{busy === 'sign-in' ? t('Sending…', '正在发送…') : t('Email sign-in link', '发送登录链接')}</button>
            </div>
          </form>
        ) : (
          <button type="button" className="archive-gate__checkout" onClick={onCheckout} disabled={Boolean(busy) || billingDelay}>
            {busy === 'checkout' ? t('Opening checkout…', '正在打开结账页面…') : t('Become a Founding Member', '成为创始会员')}
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
  const { t, locale, path } = useLocale();
  const dateLocale = locale === 'zh-CN' ? 'zh-CN' : 'en-US';
  const images = edition.previewThumbnails ?? [];
  const isLatest = index === 0;
  const className = [
    'archive-card',
    isLatest ? 'archive-card--latest' : '',
    edition.legendaryMisprint ? 'archive-card--misprint' : '',
  ].filter(Boolean).join(' ');
  const href = edition.publicRecord?.editionPath
    ?? path(`${PUBLIC_ROUTE_PATHS.vibeAtlas}?date=${encodeURIComponent(edition.date)}`);

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
        ariaLabel={`${t('Open issue', '打开第')} ${issueNumber} · ${formatEditionDate(edition.date, dateLocale)}：${edition.actorName} · ${locale === 'zh-CN' ? `英文：${edition.vibeLabelEn}` : edition.vibeLabelEn}`}
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
          <small>{t('Issue', '期')}</small>
          {String(issueNumber).padStart(2, '0')}
        </span>
        {edition.legendaryMisprint && (
          <span className="archive-card__misprint-seal">{t('Legendary', '传奇')}<br />{t('misprint', '错版')}</span>
        )}
      </span>
      <span className="archive-card__caption">
        {edition.legendaryMisprint && (
          <span className="archive-card__misprint-title">
            <small>{t('Archive anomaly · Legendary Misprint', '典藏异常 · 传奇错版')}</small>
            <b>{locale === 'zh-CN'
              ? `英文：${edition.legendaryMisprintTitle ?? 'Preserved retrieval anomaly'}`
              : edition.legendaryMisprintTitle ?? 'Preserved retrieval anomaly'}</b>
          </span>
        )}
        {edition.legendaryMisprintCopy && <q>{locale === 'zh-CN' ? `英文原文：${edition.legendaryMisprintCopy}` : edition.legendaryMisprintCopy}</q>}
        <span className="archive-card__meta">
          <time dateTime={edition.date}>{formatEditionDate(edition.date, dateLocale)}</time>
          <span>{isLatest ? t('Latest edition', '最新一期') : t('Published edition', '已发布期刊')}</span>
        </span>
        <strong>{edition.actorName}</strong>
        {edition.actorShortNameEn && <small>{locale === 'zh-CN' ? `英文名：${edition.actorShortNameEn}` : edition.actorShortNameEn}</small>}
        <span className="archive-card__vibe">
          <i>{edition.vibeEmoji}</i>
          <span>{edition.vibeLabel}<em>{locale === 'zh-CN' ? `英文：${edition.vibeLabelEn}` : edition.vibeLabelEn}</em></span>
        </span>
        {edition.vibeSubtitleEn && <q>{locale === 'zh-CN' ? `英文说明：${edition.vibeSubtitleEn}` : edition.vibeSubtitleEn}</q>}
        <span className="archive-card__open">
          {edition.publicRecord
            ? t('Read the permanent edition record', '阅读本期永久档案')
            : edition.access === 'member' ? t('Preview Founding Member edition', '预览创始会员特刊') : t('Open the nine-card board', '打开九宫格')}
          <b aria-hidden="true">↗</b>
        </span>
      </span>
      </VisibleArchiveRecordPlacement>
      {edition.publicRecord && (
        <VisibleArchiveRecordPlacement
          as="nav"
          className="archive-card__records"
          ariaLabel={`${edition.actorName} ${t('curated records', '精选档案')}`}
          location="full_archive"
          recordTypes={['actor', 'edition']}
          presentationKey={`full_archive_records:${edition.date}`}
        >
          <a href={path(edition.publicRecord.actorPath)} onClick={() => trackArchiveRecordOpened('actor', 'full_archive')}>{t('Actor record', '演员档案')}</a>
          <a href={path(edition.publicRecord.editionPath)} onClick={() => trackArchiveRecordOpened('edition', 'full_archive')}>{t('Edition record', '期刊档案')}</a>
          <a
            href={path(`${PUBLIC_ROUTE_PATHS.vibeAtlas}?view=builder&source=edition&date=${encodeURIComponent(edition.date)}`)}
            onClick={() => trackArchiveRebuildLaunched(edition.date, 'archive_card')}
          >
            {t('Rebuild this edition', '重建本期九宫格')}
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
  const { t, locale, path } = useLocale();
  const yearCount = new Set(archive.map(edition => edition.date.slice(0, 4))).size;

  return (
    <main className="atlas-archive-page">
      <header className="atlas-hero atlas-archive-page__hero">
        <div className="atlas-hero__eyebrow"><span>{t('Fandom Vibes / studio 01', 'Fandom Vibes / 工作室 01')}</span><i /></div>
        <div className="atlas-hero__title-row">
          <div>
            <p className="atlas-hero__universe">{t('Star of the Day · The complete collection', '今日之星 · 完整典藏')}</p>
            <h1>{locale === 'zh-CN' ? '星光典藏' : 'Archive'} {locale === 'zh-CN' ? null : <span lang="zh-CN">星光典藏</span>}</h1>
          </div>
        </div>
        <p className="atlas-hero__intro">
          {t('Browse every published Star of the Day as it first appeared: one actor, one assigned mood, nine pieces of visual evidence. Rare legendary misprints remain sealed in place.', '浏览每一期最初发布的今日之星：一位演员、一种指定氛围、九份视觉证据。珍稀传奇错版将原样封存。')}
        </p>
      </header>

      <section className="daily-archive daily-archive--page" aria-labelledby="archive-page-title">
        <div className="archive-index">
          <div>
            <h2 id="archive-page-title">{t('The Star of the Day Archive', '今日之星典藏')}</h2>
            <p>{t('Published boards only. Each plate opens the exact original nine-card edition.', '仅收录已发布的九宫格。每张典藏卡片都会打开对应的原始九张卡组。')}</p>
          </div>
          <dl aria-label={t('Archive summary', '典藏摘要')}>
            <div><dt>{t('Editions', '期数')}</dt><dd>{(archiveTotal ?? archive.length) || '—'}</dd></div>
            <div><dt>{t('Years', '年份')}</dt><dd>{yearCount || '—'}</dd></div>
            <div><dt>{t('Format', '规格')}</dt><dd>3 × 3</dd></div>
          </dl>
        </div>
        {archiveLoading && archive.length === 0 ? (
          <p className="daily-archive__status">{t('Loading published editions…', '正在加载已发布期刊…')}</p>
        ) : archiveError && archive.length === 0 ? (
          <>
            <p className="daily-archive__status daily-archive__status--error" role="alert">
              {t('Couldn’t load the archive. Try again.', '无法加载典藏。请重试。')}
            </p>
            <button
              type="button"
              className="daily-archive__today"
              onClick={() => void loadArchive()}
            >
              {t('Retry loading the archive', '重试加载典藏')}
            </button>
          </>
        ) : archive.length === 0 ? (
          <p className="daily-archive__status">{t('No published editions are available yet.', '目前还没有可查看的已发布期刊。')}</p>
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
                    {t('Couldn’t load more editions. Try again.', '无法加载更多期刊。请重试。')}
                  </p>
                )}
                <button
                  type="button"
                  className="daily-archive__today"
                  disabled={archiveLoading}
                  onClick={() => void loadMoreArchive()}
                >
                  {archiveLoading ? t('Loading editions…', '正在加载期刊…') : archiveError ? t('Retry loading editions', '重试加载期刊') : t('Load more editions', '加载更多期刊')}
                </button>
              </>
            )}
          </>
        )}
        <footer className="archive-footer">
          <span>{t('Fandom Vibes · Permanent edition record', 'Fandom Vibes · 永久期刊档案')}</span>
          <a className="daily-archive__today" href={path(PUBLIC_ROUTE_PATHS.vibeAtlas)}>{t('Return to today’s drop', '返回今日卡组')} <b aria-hidden="true">→</b></a>
        </footer>
      </section>
    </main>
  );
}

/** Shown in the Fandom Admin view when the admin session has expired or was never set. */
function AdminSignIn() {
  const { locale, t } = useLocale();
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
      setNotice(publicApiErrorMessage(
        error instanceof Error ? error.message : 'Could not send the admin sign-in link.',
        locale,
        t,
        'Could not send the admin sign-in link.',
        '无法发送管理员登录链接。',
      ));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-sign-in">
      <span className="admin-sign-in__icon" aria-hidden="true">🔒</span>
      <h2>{t('Admin sign-in required', '需要管理员登录')}</h2>
      <p>{t('Your admin session has expired. Enter your admin email to receive a new sign-in link.', '管理员会话已过期。请输入管理员邮箱以接收新的登录链接。')}</p>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          required
          value={email}
          onChange={event => setEmail(event.target.value)}
          placeholder="admin@example.com"
          aria-label={t('Admin email address', '管理员邮箱地址')}
        />
        <button type="submit" disabled={busy || !email.trim()}>
          {busy ? t('Sending…', '正在发送…') : t('Email sign-in link', '发送登录链接')}
        </button>
      </form>
      {notice && <p className="admin-sign-in__notice" role="status">{notice}</p>}
    </div>
  );
}

export default App;
