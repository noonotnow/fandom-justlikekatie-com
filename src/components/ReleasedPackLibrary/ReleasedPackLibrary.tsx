import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createMembershipCheckout,
  hasCollectorCapability,
  type MembershipStatus,
} from '../../utils/membership';
import { getPublicSession, requestMagicLink, syncPublicCard, syncPublicGrid } from '../../utils/publicAccount';
import { dbGetAllCards, dbGetAllGrids, dbSaveCard, dbSaveGrid } from '../../utils/collectionDB';
import { collectorCardRecord, collectorGridCollectionId, collectorGridRecord } from '../../utils/releasedPackCollection';
import {
  trackReleasedLibraryCheckoutStarted,
  trackReleasedLibraryFilterUsed,
  trackReleasedLibraryOpened,
  trackReleasedLibraryPageView,
  trackReleasedLibrarySignInStarted,
  trackReleasedPackOpened,
  type ReleasedLibrarySource,
} from '../../utils/analytics';
import { PUBLIC_ROUTE_PATHS } from '../../../shared/public-routes.js';
import { useLocale } from '../../i18n/LocaleContext';

type VibePack = {
  vibeIdx: number;
  emoji?: string;
  label?: string;
  label_en?: string;
  subtitle?: string;
  subtitle_en?: string;
  supportingCopy?: string;
  supportingCopy_en?: string;
  sourceDepth?: { queries?: string[]; authoringPrompt?: string };
};

type ActorPack = {
  id: string;
  name?: string;
  shortName_en?: string;
  accentColor?: string;
  title_en?: string;
  icon?: string;
  vibes?: VibePack[];
};

type GridImage = {
  thumbnail?: string;
  title?: string;
  source?: string;
  link?: string;
  query?: string;
};

type GridRun = {
  id: string;
  actorId: string;
  vibeIdx: number;
  generatedAt: string;
  source?: string;
  images: GridImage[];
};

type PublicPreviewCard = {
  position?: number;
  title?: string;
  source?: string;
  link?: string | null;
  thumbnailUrl?: string | null;
  deliveryUrl?: string | null;
};

type PublicReleasedPackPreview = {
  actor: {
    id: string;
    name?: string;
    nameEn?: string;
  };
  vibe: {
    emoji?: string | null;
    label?: string;
    labelEn?: string;
    subtitle?: string;
    subtitleEn?: string;
  };
  vibeIdx: number;
  preview: {
    copy: string;
    copyZh?: string;
    copyEn?: string;
    cards: PublicPreviewCard[];
  };
};

type PublicDirectoryPack = PublicReleasedPackPreview & { canonical: string };

type PreflightPreviewCard = {
  thumbnailUrl: string;
  title: string;
};

type PreflightReleasedPackPreview = {
  kind: 'vibe-atlas-preflight-three-card-preview';
  actor: { id: string; name: string; nameEn: string };
  vibe: { labelEn: string; copy?: string };
  vibeIdx: number;
  cards: PreflightPreviewCard[];
};

function primaryReleasedCopy(english?: string, chinese?: string, fallback?: string, locale: string = 'en') {
  return locale === 'zh-CN'
    ? chinese || english || fallback || ''
    : english || chinese || fallback || '';
}

function secondaryReleasedCopy(english: string | undefined, chinese: string | undefined, locale: string = 'en') {
  return english && chinese && english !== chinese
    ? locale === 'zh-CN' ? `英文：${english}` : `Chinese: ${chinese}`
    : null;
}

function selectorReleasedCopy(english?: string, chinese?: string, fallback?: string, locale: string = 'en') {
  const primary = primaryReleasedCopy(english, chinese, fallback, locale);
  const secondary = secondaryReleasedCopy(english, chinese, locale);
  return secondary ? `${primary} · ${secondary}` : primary;
}

function publicEditorialPreviewCopy(preview: PublicReleasedPackPreview['preview'], locale: string) {
  if (locale === 'zh-CN') {
    return preview.copyZh || `英文预览文案：${preview.copyEn || preview.copy}`;
  }
  return preview.copyEn || preview.copy;
}

function safeExternalUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function isSecurePreviewUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isPreflightPreview(value: unknown, actorId?: string | null, vibeIdx?: number | null): value is PreflightReleasedPackPreview {
  if (!value || typeof value !== 'object') return false;
  const pack = value as PreflightReleasedPackPreview;
  return pack.kind === 'vibe-atlas-preflight-three-card-preview'
    && typeof pack.actor?.id === 'string'
    && (!actorId || pack.actor.id === actorId)
    && typeof pack.actor.name === 'string'
    && typeof pack.actor.nameEn === 'string'
    && typeof pack.vibe?.labelEn === 'string'
    && (pack.vibe.copy === undefined || typeof pack.vibe.copy === 'string')
    && Number.isInteger(pack.vibeIdx)
    && (vibeIdx == null || pack.vibeIdx === vibeIdx)
    && Array.isArray(pack.cards)
    && pack.cards.length === 3
    && pack.cards.every(card => (
      typeof card?.title === 'string'
      && typeof card.thumbnailUrl === 'string'
      && isSecurePreviewUrl(card.thumbnailUrl)
    ));
}

function isPreflightDirectory(value: unknown): value is { previews: PreflightReleasedPackPreview[] } {
  if (!value || typeof value !== 'object') return false;
  const directory = value as { kind?: string; previews?: unknown[] };
  return directory.kind === 'vibe-atlas-preflight-preview-directory'
    && Array.isArray(directory.previews)
    && directory.previews.every(pack => isPreflightPreview(pack));
}

interface Props {
  status: MembershipStatus | null;
  membershipResolved: boolean;
  actorId?: string | null;
  actorName?: string;
  vibeIndex?: number | null;
  currentRelease?: { actorId: string; vibeIdx: number } | null;
  source: ReleasedLibrarySource;
}

export function ReleasedPackLibrary({
  status,
  membershipResolved,
  actorId,
  actorName,
  vibeIndex,
  currentRelease = null,
  source,
}: Props) {
  const { locale, t, path } = useLocale();
  const entitled = hasCollectorCapability(status);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [savedImages, setSavedImages] = useState<string[]>([]);
  const [syncedImages, setSyncedImages] = useState<string[]>([]);
  const [savedGridId, setSavedGridId] = useState('');
  const [syncedGridId, setSyncedGridId] = useState('');
  const [saveBusy, setSaveBusy] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [packs, setPacks] = useState<ActorPack[]>([]);
  const [publicPreview, setPublicPreview] = useState<PublicReleasedPackPreview | null>(null);
  const [publicPacks, setPublicPacks] = useState<PublicDirectoryPack[]>([]);
  const [publicPacksLoading, setPublicPacksLoading] = useState(false);
  const [publicPacksError, setPublicPacksError] = useState('');
  const [preflightPacks, setPreflightPacks] = useState<PreflightReleasedPackPreview[]>([]);
  const [preflightPacksLoading, setPreflightPacksLoading] = useState(false);
  const [preflightPacksError, setPreflightPacksError] = useState('');
  const [preflightPreview, setPreflightPreview] = useState<PreflightReleasedPackPreview | null>(null);
  const [preflightPreviewLoading, setPreflightPreviewLoading] = useState(false);
  const [preflightPreviewError, setPreflightPreviewError] = useState('');
  const [publicPreviewLoading, setPublicPreviewLoading] = useState(false);
  const [publicPreviewError, setPublicPreviewError] = useState('');
  const [selectedActor, setSelectedActor] = useState(actorId || '');
  const [selectedVibe, setSelectedVibe] = useState(vibeIndex == null ? '' : String(vibeIndex));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [runs, setRuns] = useState<GridRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<GridRun | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState('');
  const runRequest = useRef<{ id: number; controller: AbortController | null }>({ id: 0, controller: null });
  const autoOpenedPair = useRef('');
  const lastTrackedOpen = useRef('');
  const pageViewTracked = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void getPublicSession().then(session => {
      if (!cancelled) setSignedIn(Boolean(session));
    }).catch(() => {
      if (!cancelled) setSignedIn(null);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSavedImages([]);
    setSyncedImages([]);
    setSavedGridId('');
    setSyncedGridId('');
    setSaveNotice('');
    if (selectedRun) {
      void Promise.all([
        dbGetAllGrids(),
        dbGetAllCards(),
      ]).then(([grids, cards]) => {
        if (cancelled) return;
        const matchingGrid = grids.find(grid => grid.id === collectorGridCollectionId(selectedRun));
        setSavedGridId(matchingGrid?.id || '');
        setSyncedGridId(matchingGrid?.serverId ? matchingGrid.id : '');
        const runUrls = new Set(selectedRun.images.map(image => image.thumbnail));
        setSavedImages(cards.filter(card => runUrls.has(card.imageUrl)).map(card => card.imageUrl));
        setSyncedImages(cards.filter(card => runUrls.has(card.imageUrl) && card.serverId)
          .map(card => card.imageUrl));
      }).catch(() => { if (!cancelled) setSaveNotice(t('Could not check saved items on this device.', '无法检查此设备上的已保存内容。')); });
    }
    return () => { cancelled = true; };
  }, [selectedRun]);

  async function saveCollectorImage(index: number) {
    if (!selectedRun || !actor || !vibe || saveBusy) return;
    setSaveBusy(`image-${index}`);
    setSaveNotice('');
    try {
      const card = collectorCardRecord(selectedRun, index, actor, vibe);
      if (!savedImages.includes(card.imageUrl)) {
        await dbSaveCard(card);
        setSavedImages(current => [...new Set([...current, card.imageUrl])]);
      }
      try {
        const session = await getPublicSession();
        if (!session) throw new Error(t('Sign in to sync this save.', '请登录以同步这项收藏。'));
        await syncPublicCard(session, card.imageUrl);
        setSyncedImages(current => [...new Set([...current, card.imageUrl])]);
        setSaveNotice(t('Image saved and synced to My Collection.', '图片已保存并同步到“我的收藏”。'));
      } catch (error) {
        setSaveNotice(t('Image saved on this device, but account sync failed:', '图片已保存到此设备，但账户同步失败：') + ` ${error instanceof Error ? error.message : t('try again in My Collection.', '请在“我的收藏”中重试。')}`);
      }
    } catch (error) {
      setSaveNotice(error instanceof Error ? error.message : t('Could not save this image.', '无法保存此图片。'));
    } finally { setSaveBusy(''); }
  }

  async function saveCollectorGrid() {
    if (!selectedRun || !actor || !vibe || saveBusy) return;
    setSaveBusy('grid');
    setSaveNotice('');
    try {
      const grid = collectorGridRecord(selectedRun, actor, vibe);
      if (savedGridId !== grid.id) {
        await dbSaveGrid(grid);
        setSavedGridId(grid.id);
      }
      try {
        const session = await getPublicSession();
        if (!session) throw new Error(t('Sign in to sync this save.', '请登录以同步这项收藏。'));
        await syncPublicGrid(session, grid.id);
        setSyncedGridId(grid.id);
        setSaveNotice(t('Grid saved and synced to My Collection.', '九宫格已保存并同步到“我的收藏”。'));
      } catch (error) {
        setSaveNotice(t('Grid saved on this device, but account sync failed:', '九宫格已保存到此设备，但账户同步失败：') + ` ${error instanceof Error ? error.message : t('try again in My Collection.', '请在“我的收藏”中重试。')}`);
      }
    } catch (error) {
      setSaveNotice(error instanceof Error ? error.message : t('Could not save this grid.', '无法保存此九宫格。'));
    } finally { setSaveBusy(''); }
  }

  useEffect(() => {
    if (pageViewTracked.current) return;
    pageViewTracked.current = true;
    trackReleasedLibraryPageView(source, actorId, vibeIndex);
  }, [source, actorId, vibeIndex]);

  useEffect(() => {
    if (!membershipResolved || status === null) return;
    const signature = `${source}:${actorId || ''}:${vibeIndex ?? ''}:${entitled}`;
    if (lastTrackedOpen.current === signature) return;
    lastTrackedOpen.current = signature;
    trackReleasedLibraryOpened(source, entitled, actorId, vibeIndex);
  }, [actorId, entitled, membershipResolved, source, status, vibeIndex]);

  useEffect(() => {
    if (!entitled) {
      setPacks([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch('/.netlify/functions/actor-pack-depth', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
      .then(async response => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error || t('Released packs are temporarily unavailable.', '已发布氛围包暂时无法使用。'));
        const next = Array.isArray(body?.packs) ? body.packs : [];
        if (!cancelled) setPacks(next.filter((pack: ActorPack) => typeof pack?.id === 'string'));
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : t('Released packs are temporarily unavailable.', '已发布氛围包暂时无法使用。'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entitled]);

  useEffect(() => {
    if (entitled || source === 'article') {
      setPublicPacks([]);
      setPublicPacksError('');
      setPublicPacksLoading(false);
      return;
    }
    const controller = new AbortController();
    setPublicPacksLoading(true);
    setPublicPacksError('');
    fetch('/.netlify/functions/released-pack-directory', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async response => {
        const body = await response.json().catch(() => null);
        if (!response.ok || body?.kind !== 'vibe-atlas-public-pack-directory' || !Array.isArray(body.packs)) {
          throw new Error(t('Public pack previews are temporarily unavailable.', '公开氛围包预览暂时无法使用。'));
        }
        if (!controller.signal.aborted) setPublicPacks(body.packs);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPublicPacksError(t('Public pack previews are temporarily unavailable.', '公开氛围包预览暂时无法使用。'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPublicPacksLoading(false);
      });
    return () => controller.abort();
  }, [entitled, source]);

  useEffect(() => {
    if (entitled || !actorId || vibeIndex == null
      || (source === 'article' && (actorId !== 'liu-xueyi' || (vibeIndex !== 1 && vibeIndex !== 2)))) {
      setPublicPreview(null);
      setPublicPreviewError('');
      setPublicPreviewLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setPublicPreviewLoading(true);
    setPublicPreview(null);
    setPublicPreviewError('');
    fetch(`/.netlify/functions/released-pack-preview?actorId=${encodeURIComponent(actorId)}&vibeIdx=${encodeURIComponent(vibeIndex)}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async response => {
        const body = await response.json().catch(() => null);
        if (response.status === 404) {
          throw new Error(t('This pairing does not have a published public preview yet.', '这组演员与氛围目前还没有已发布的公开预览。'));
        }
        if (!response.ok) throw new Error(body?.error || t('Public preview is temporarily unavailable.', '公开预览暂时无法使用。'));
        if (!body?.pack || body.pack.actor?.id !== actorId || body.pack.vibeIdx !== vibeIndex) {
          throw new Error(t('Public preview is temporarily unavailable.', '公开预览暂时无法使用。'));
        }
        if (!cancelled) setPublicPreview(body.pack);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        if (!cancelled) {
          setPublicPreview(null);
          setPublicPreviewError(err instanceof Error ? err.message : t('Public preview is temporarily unavailable.', '公开预览暂时无法使用。'));
        }
      })
      .finally(() => {
        if (!cancelled) setPublicPreviewLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [actorId, entitled, source, vibeIndex]);

  useEffect(() => {
    if (entitled || source !== 'daily_star') {
      setPreflightPacks([]);
      setPreflightPacksError('');
      setPreflightPacksLoading(false);
      return;
    }
    if (!actorId) {
      setPreflightPacks([]);
      setPreflightPacksError(t('Today’s actor is unavailable, so its other pack previews cannot be loaded.', '今日演员信息不可用，因此无法加载其余氛围包预览。'));
      setPreflightPacksLoading(false);
      return;
    }
    const controller = new AbortController();
    setPreflightPacksLoading(true);
    setPreflightPacksError('');
    const params = new URLSearchParams({ actorId });
    fetch(`/.netlify/functions/public-preflight-preview-directory?${params}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async response => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || !isPreflightDirectory(body)) {
          throw new Error(t('Public pack previews are temporarily unavailable.', '公开氛围包预览暂时无法使用。'));
        }
        const previews = body.previews.filter(preview => preview.actor.id === actorId);
        if (!controller.signal.aborted) setPreflightPacks(previews);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreflightPacksError(t('Public pack previews are temporarily unavailable.', '公开氛围包预览暂时无法使用。'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreflightPacksLoading(false);
      });
    return () => controller.abort();
  }, [actorId, entitled, source]);

  useEffect(() => {
    if (entitled || source !== 'article') {
      setPreflightPreview(null);
      setPreflightPreviewError('');
      setPreflightPreviewLoading(false);
      return;
    }
    if (actorId !== 'liu-xueyi' || (vibeIndex !== 1 && vibeIndex !== 2)) {
      setPreflightPreview(null);
      setPreflightPreviewError(t('This article links only to its two approved Liu Xueyi pack previews.', '此文章仅链接到两项经批准的刘学义氛围包预览。'));
      setPreflightPreviewLoading(false);
      return;
    }
    const controller = new AbortController();
    setPreflightPreview(null);
    setPreflightPreviewError('');
    setPreflightPreviewLoading(true);
    const params = new URLSearchParams({ actorId, vibeIdx: String(vibeIndex) });
    fetch(`/.netlify/functions/public-preflight-preview?${params}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async response => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || !isPreflightPreview(body, actorId, vibeIndex)) {
          throw new Error(response.status === 404
            ? t('This pairing does not have an approved public preview yet.', '这组演员与氛围目前还没有获批的公开预览。')
            : t('Public pack preview is temporarily unavailable.', '公开氛围包预览暂时无法使用。'));
        }
        if (!controller.signal.aborted) setPreflightPreview(body);
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          setPreflightPreviewError(error instanceof Error ? error.message : t('Public pack preview is temporarily unavailable.', '公开氛围包预览暂时无法使用。'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreflightPreviewLoading(false);
      });
    return () => controller.abort();
  }, [actorId, entitled, source, vibeIndex]);

  const currentDailyPair = currentRelease || (source === 'daily_star' && actorId && vibeIndex != null
    ? { actorId, vibeIdx: vibeIndex }
    : null);
  const dailyActorPacks = source === 'daily_star' && actorId
    ? preflightPacks.filter(pack => (
      pack.actor.id === actorId
      && !(currentDailyPair
        && pack.actor.id === currentDailyPair.actorId
        && pack.vibeIdx === currentDailyPair.vibeIdx)
    ))
    : [];
  const isDailyActorView = source === 'daily_star' && Boolean(actorId);
  const scopedPublicPacks = actorId
    ? publicPacks.filter(pack => pack.actor.id === actorId)
    : publicPacks;
  const visiblePublicPacks = isDailyActorView
    ? scopedPublicPacks.filter(pack => (
      !currentDailyPair
      || pack.actor.id !== currentDailyPair.actorId
      || pack.vibeIdx !== currentDailyPair.vibeIdx
    ))
    : scopedPublicPacks;
  const displayedActorName = actorName
    || scopedPublicPacks[0]?.actor.nameEn
    || actorId?.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  const actor = useMemo(
    () => packs.find(pack => pack.id === selectedActor) || packs[0],
    [packs, selectedActor],
  );
  const vibes = actor?.vibes || [];
  const vibe = selectedVibe === ''
    ? null
    : vibes.find(item => item.vibeIdx === Number(selectedVibe)) || null;

  useEffect(() => {
    const retryPendingSaves = () => {
      if (!selectedRun || saveBusy) return;
      const pendingImages = selectedRun.images
        .map(image => image.thumbnail)
        .filter((url): url is string => Boolean(url && savedImages.includes(url) && !syncedImages.includes(url)));
      const pendingGrid = savedGridId === collectorGridCollectionId(selectedRun)
        && savedGridId !== syncedGridId;
      if (!pendingImages.length && !pendingGrid) return;
      setSaveBusy('retry');
      void (async () => {
        const session = await getPublicSession();
        if (!session) throw new Error(t('Sign in to sync your saved items.', '请登录以同步已保存的内容。'));
        for (const url of pendingImages) {
          await syncPublicCard(session, url);
          setSyncedImages(current => [...new Set([...current, url])]);
        }
        if (pendingGrid) {
          await syncPublicGrid(session, savedGridId);
          setSyncedGridId(savedGridId);
        }
        setSaveNotice(t('Saved items synced to My Collection.', '已保存内容已同步到“我的收藏”。'));
      })().catch(error => {
        setSaveNotice(t('Account sync still needs a connection:', '账户同步仍需要网络连接：') + ` ${error instanceof Error ? error.message : t('try again.', '请重试。')}`);
      }).finally(() => setSaveBusy(''));
    };
    window.addEventListener('online', retryPendingSaves);
    return () => window.removeEventListener('online', retryPendingSaves);
  }, [selectedRun, saveBusy, savedImages, syncedImages, savedGridId, syncedGridId]);

  useEffect(() => {
    if (actor && actor.id !== selectedActor) setSelectedActor(actor.id);
    if (actor && selectedVibe === '' && actor.vibes?.length) {
      setSelectedVibe(String(actor.vibes[0].vibeIdx));
    }
  }, [actor, selectedActor]);

  useEffect(() => {
    if (!actor || selectedVibe === '' || !vibe) return;
    const pairKey = `${actor.id}:${vibe.vibeIdx}`;
    if (autoOpenedPair.current === pairKey) return;
    autoOpenedPair.current = pairKey;
    void openPair(actor.id, vibe.vibeIdx);
  }, [actor?.id, selectedVibe, vibe?.vibeIdx]);

  function cancelRunRequest() {
    runRequest.current.controller?.abort();
    runRequest.current = { id: runRequest.current.id + 1, controller: null };
  }

  async function openPair(actorValue: string, vibeValue: number) {
    const requestId = runRequest.current.id + 1;
    runRequest.current.controller?.abort();
    const controller = new AbortController();
    runRequest.current = { id: requestId, controller };
    setRunLoading(true);
    setRunError('');
    try {
      let savedRuns: GridRun[] = [];
      const savedResponse = await fetch(
        `/.netlify/functions/collector-grid?actorId=${encodeURIComponent(actorValue)}&vibeIdx=${vibeValue}`,
        { credentials: 'include', headers: { Accept: 'application/json' }, signal: controller.signal },
      );
      const savedBody = await savedResponse.json().catch(() => null);
      if (!savedResponse.ok) throw new Error(savedBody?.error || t('Saved grids are temporarily unavailable.', '已保存的九宫格暂时无法使用。'));
      savedRuns = Array.isArray(savedBody?.runs) ? savedBody.runs : [];
      if (runRequest.current.id !== requestId) return;
      setRuns(savedRuns);
      setSelectedRun(savedRuns[0] || null);
      setRunError('');
    } catch (err) {
      if (controller.signal.aborted || runRequest.current.id !== requestId) return;
      setRunError(err instanceof Error ? err.message : t('Saved grids are temporarily unavailable.', '已保存的九宫格暂时无法使用。'));
    }

    try {
      const freshResponse = await fetch('/.netlify/functions/collector-grid', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: actorValue, vibeIdx: vibeValue }),
        signal: controller.signal,
      });
      const freshBody = await freshResponse.json().catch(() => null);
      if (!freshResponse.ok) throw new Error(freshBody?.error || t('This grid could not be generated.', '无法生成此九宫格。'));
      if (!freshBody?.run) throw new Error(t('The generated grid was empty.', '生成的九宫格为空。'));
      if (runRequest.current.id !== requestId) return;
      const nextRun = freshBody.run as GridRun;
      setRunError('');
      setSelectedRun(nextRun);
      setRuns(previous => [nextRun, ...previous.filter(run => run.id !== nextRun.id)]);
      trackReleasedPackOpened(source, actorValue, vibeValue);
    } catch (err) {
      if (controller.signal.aborted || runRequest.current.id !== requestId) return;
      setRunError(err instanceof Error ? err.message : t('This grid could not be generated.', '无法生成此九宫格。'));
    } finally {
      if (runRequest.current.id === requestId) setRunLoading(false);
    }
  }

  async function generateGrid(actorValue: string, vibeValue: number) {
    const requestId = runRequest.current.id + 1;
    runRequest.current.controller?.abort();
    const controller = new AbortController();
    runRequest.current = { id: requestId, controller };
    setRunLoading(true);
    setRunError('');
    try {
      const response = await fetch('/.netlify/functions/collector-grid', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: actorValue, vibeIdx: vibeValue }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || t('This grid could not be generated.', '无法生成此九宫格。'));
      if (!body?.run) throw new Error(t('The generated grid was empty.', '生成的九宫格为空。'));
      if (runRequest.current.id !== requestId) return;
      const nextRun = body.run as GridRun;
      setSelectedRun(nextRun);
      setRuns(previous => [nextRun, ...previous.filter(run => run.id !== nextRun.id)]);
    } catch (err) {
      if (controller.signal.aborted || runRequest.current.id !== requestId) return;
      setRunError(err instanceof Error ? err.message : t('This grid could not be generated.', '无法生成此九宫格。'));
    } finally {
      if (runRequest.current.id === requestId) setRunLoading(false);
    }
  }

  function chooseActor(value: string) {
    trackReleasedLibraryFilterUsed('actor', source, value);
    setSelectedActor(value);
    setSelectedVibe('');
    cancelRunRequest();
    setRunLoading(false);
    setRuns([]);
    setSelectedRun(null);
    setRunError('');
    autoOpenedPair.current = '';
  }

  function chooseVibe(value: string) {
    trackReleasedLibraryFilterUsed('vibe', source, actor?.id, value === '' ? null : Number(value));
    setSelectedVibe(value);
    cancelRunRequest();
    setRunLoading(false);
    setRuns([]);
    setSelectedRun(null);
    setRunError('');
    autoOpenedPair.current = '';
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    trackReleasedLibrarySignInStarted(source, actorId, vibeIndex);
    setBusy('sign-in');
    try {
      setNotice(await requestMagicLink(email, `released:${actorId || ''}`));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t('Could not send the sign-in link.', '无法发送登录链接。'));
    } finally { setBusy(''); }
  }

  async function upgrade() {
    trackReleasedLibraryCheckoutStarted(source, actorId, vibeIndex);
    setBusy('checkout');
    try {
      window.location.assign(await createMembershipCheckout());
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t('Checkout could not be opened.', '无法打开结账页面。'));
      setBusy('');
    }
  }

  const publicPreviewFreeToday = publicPreview
    && currentRelease?.actorId === publicPreview.actor.id
    && currentRelease?.vibeIdx === publicPreview.vibeIdx;

  const selectedRunSourceLabel = selectedRun?.source === 'fallback'
    ? t('Image source: backup search', '图片来源：备用搜索')
    : selectedRun?.source
      ? `${t('Source', '来源')} · ${selectedRun.source}`
      : null;

  if (!entitled) {
    return (
      <main className="released-library">
        <header className="released-library__hero">
          <p className="membership__label">{t('Fandom Collector · released Vibe Packs', 'Fandom 收藏会员 · 已发布氛围包')}</p>
          <h1>{t('The Vibe Atlas library.', '氛围图鉴氛围包库。')}</h1>
          <p>{t('Explore released actor × vibe packs—and generate a fresh grid from each one. Every grid is saved to your account.', '探索已发布的演员 × 氛围包，并根据每个氛围包生成全新九宫格。所有九宫格都会保存到你的账户。')}</p>
        </header>
        {source !== 'article' && <section className="released-library__directory" aria-label={t('Public released-pack previews', '已发布氛围包的公开预览')}>
          <h2>{isDailyActorView
            ? `${displayedActorName || t('Today’s star', '今日之星')}${t('’s other Vibe Packs', '的其他氛围包')}`
            : t('Browse public pack previews', '浏览氛围包公开预览')}</h2>
          {publicPacksLoading && <p role="status">{t('Loading public previews…', '正在加载公开预览…')}</p>}
          {publicPacksError && <p role="alert">{publicPacksError}</p>}
          {!publicPacksLoading && !preflightPacksLoading && !publicPacksError && visiblePublicPacks.length === 0 && dailyActorPacks.length === 0 && (
            <p role="status">{isDailyActorView
              ? `${displayedActorName || t('This star', '这位明星')}${t('’s other packs do not have verified public previews ready yet.', '的其他氛围包暂时还没有已核实的公开预览。')}`
              : t('No public pack previews are published yet.', '目前还没有已发布的氛围包公开预览。')} {t('Today’s free nine-card drop is on the', '今日免费的九张卡片可在')} <a href={`${path(PUBLIC_ROUTE_PATHS.vibeAtlas)}#daily-evidence`}>{t('Vibe Atlas homepage', '氛围图鉴首页')}</a> {t('page.', '查看。')}</p>
          )}
          {visiblePublicPacks.map(pack => {
            const url = safeExternalUrl(pack.canonical);
            const previewPath = url ? path(url) : null;
            const preflightPack = dailyActorPacks.find(preview => (
              preview.actor.id === pack.actor.id && preview.vibeIdx === pack.vibeIdx
            ));
            return (
              <article className="released-library__teaser" key={`${pack.actor.id}:${pack.vibeIdx}`}>
                <div className="released-library__teaser-copy">
                  <p className="membership__label">{t('Public teaser', '公开预览')}</p>
                  <h3>{pack.vibe.emoji || '✦'} {locale === 'zh-CN' ? pack.actor.name || pack.actor.nameEn : pack.actor.nameEn || pack.actor.name} × {primaryReleasedCopy(pack.vibe.labelEn, pack.vibe.label, undefined, locale)}</h3>
                  {(preflightPack?.vibe.copy || pack.preview.copy) && <p>{locale === 'zh-CN'
                    ? preflightPack?.vibe.copy
                      ? `${t('English preview copy:', '英文预览文案：')} ${preflightPack.vibe.copy}`
                      : publicEditorialPreviewCopy(pack.preview, locale)
                    : preflightPack?.vibe.copy || pack.preview.copy}</p>}
                  {previewPath && <a href={previewPath}>{t('View public pack preview', '查看氛围包公开预览')}</a>}
                </div>
                <div className="released-image-grid released-image-grid--preview" aria-label={`${locale === 'zh-CN' ? pack.actor.name || pack.actor.nameEn : pack.actor.nameEn || pack.actor.name} ${t('preview images', '预览图片')}`}>
                  {preflightPack
                    ? preflightPack.cards.map((card, index) => (
                      <figure className="released-image-grid__item" key={index}>
                        <img src={safeExternalUrl(card.thumbnailUrl) || undefined} alt={card.title ? `${locale === 'zh-CN' ? '来源原标题（未翻译）：' : ''}${card.title}` : `${t('Preview card', '预览卡片')} ${index + 1}`} loading="lazy" />
                        <figcaption><span>{card.title ? `${locale === 'zh-CN' ? '来源原标题（未翻译）：' : ''}${card.title}` : ''}</span></figcaption>
                      </figure>
                    ))
                    : pack.preview.cards.map((card, index) => {
                      const imageUrl = safeExternalUrl(card.thumbnailUrl || card.deliveryUrl || undefined);
                      return imageUrl ? (
                        <figure className="released-image-grid__item" key={index}>
                          <img src={imageUrl} alt={card.title ? `${locale === 'zh-CN' ? '来源原标题（未翻译）：' : ''}${card.title}` : `${t('Preview card', '预览卡片')} ${index + 1}`} loading="lazy" />
                        </figure>
                      ) : null;
                    })}
                </div>
              </article>
            );
          })}
          {preflightPacksLoading && <p role="status">{t('Loading approved three-card previews…', '正在加载经批准的三张卡片预览…')}</p>}
          {preflightPacksError && <p role="alert">{preflightPacksError}</p>}
          {dailyActorPacks.filter(pack => !visiblePublicPacks.some(publicPack => (
            publicPack.actor.id === pack.actor.id && publicPack.vibeIdx === pack.vibeIdx
          ))).map(pack => (
            <article className="released-library__teaser" key={`preflight:${pack.actor.id}:${pack.vibeIdx}`}>
              <div className="released-library__teaser-copy">
                <p className="membership__label">{t('Approved three-card preview', '经批准的三张卡片预览')}</p>
                <h3>{locale === 'zh-CN' ? `英文：${pack.actor.nameEn}` : pack.actor.nameEn} × {locale === 'zh-CN' ? `英文：${pack.vibe.labelEn}` : pack.vibe.labelEn}</h3>
                {pack.vibe.copy && <p>{locale === 'zh-CN' ? `${t('English preview copy:', '英文预览文案：')} ${pack.vibe.copy}` : pack.vibe.copy}</p>}
              </div>
              <div className="released-image-grid released-image-grid--preview" aria-label={`${locale === 'zh-CN' ? `英文：${pack.actor.nameEn}` : pack.actor.nameEn} ${locale === 'zh-CN' ? `英文：${pack.vibe.labelEn}` : pack.vibe.labelEn} ${t('three-card preview', '三张卡片预览')}`}>
                {pack.cards.map((card, index) => (
                  <figure className="released-image-grid__item" key={`${pack.vibeIdx}-${index}`}>
                    <img src={safeExternalUrl(card.thumbnailUrl) || undefined} alt={card.title ? `${locale === 'zh-CN' ? '来源原标题（未翻译）：' : ''}${card.title}` : `${t('Preview card', '预览卡片')} ${index + 1}`} loading="lazy" />
                    <figcaption><span>{card.title ? `${locale === 'zh-CN' ? '来源原标题（未翻译）：' : ''}${card.title}` : ''}</span></figcaption>
                  </figure>
                ))}
              </div>
            </article>
          ))}
        </section>}
        {source !== 'article' && publicPreviewLoading && <p role="status">{t('Loading public teaser…', '正在加载公开预览…')}</p>}
        {((source === 'article' && (publicPreview || preflightPreviewLoading || preflightPreviewError || preflightPreview))
          || (source !== 'article' && publicPreview)) && (
          <section
            className={source === 'article' ? 'released-library__directory' : 'released-library__teaser'}
            aria-label={source === 'article' ? t('Article-linked public pack previews', '文章关联的氛围包公开预览') : t('Released Vibe Pack public teaser', '已发布氛围包公开预览')}
          >
            {source === 'article' && publicPreviewLoading && <p role="status">{t('Loading public teaser…', '正在加载公开预览…')}</p>}
            {source === 'article' && preflightPreviewLoading && <p role="status">{t('Loading approved three-card preview…', '正在加载经批准的三张卡片预览…')}</p>}
            {source === 'article' && preflightPreviewError && <p role="alert">{preflightPreviewError}</p>}
            {publicPreview && (source !== 'article' || !preflightPreview) && (
              <article className="released-library__teaser" aria-labelledby="released-pack-preview-title">
                <div className="released-library__teaser-copy">
                  <p className="membership__label">{t('Public teaser', '公开预览')}</p>
                  <h2 id="released-pack-preview-title">{publicPreview.vibe.emoji || '✦'} {primaryReleasedCopy(publicPreview.vibe.labelEn, publicPreview.vibe.label, undefined, locale)}</h2>
                  {publicPreview.vibe.label && publicPreview.vibe.labelEn && publicPreview.vibe.label !== publicPreview.vibe.labelEn && (
                    <p className="released-library__teaser-label">{locale === 'zh-CN' ? `英文：${publicPreview.vibe.labelEn}` : `Chinese: ${publicPreview.vibe.label}`}</p>
                  )}
                  <p><strong>{t('Actor', '演员')}:</strong> {locale === 'zh-CN' ? publicPreview.actor.name || publicPreview.actor.nameEn || publicPreview.actor.id : publicPreview.actor.nameEn || publicPreview.actor.name || publicPreview.actor.id}{publicPreview.actor.name && publicPreview.actor.nameEn && publicPreview.actor.name !== publicPreview.actor.nameEn ? ` · ${locale === 'zh-CN' ? `英文：${publicPreview.actor.nameEn}` : `中文：${publicPreview.actor.name}`}` : ''}</p>
                  {(publicPreview.vibe.subtitleEn || publicPreview.vibe.subtitle) && (
                    <p>{primaryReleasedCopy(publicPreview.vibe.subtitleEn, publicPreview.vibe.subtitle, undefined, locale)}{publicPreview.vibe.subtitle && publicPreview.vibe.subtitleEn && publicPreview.vibe.subtitle !== publicPreview.vibe.subtitleEn ? ` · ${secondaryReleasedCopy(publicPreview.vibe.subtitleEn, publicPreview.vibe.subtitle, locale)}` : ''}</p>
                  )}
                  <p>{publicEditorialPreviewCopy(publicPreview.preview, locale)}</p>
                  <p className="released-grid-viewer__empty">{t('This Vibe Pack is the reusable editorial sourceboard. Each grid is freshly generated from its search, safety, and ranking rules.', '此氛围包是可重复使用的编辑源板。每个九宫格均依据其搜索、安全与排序规则重新生成。')}</p>
                </div>
                <div className="released-image-grid released-image-grid--preview" aria-label={t('Released Vibe Pack public teaser', '已发布氛围包公开预览')}>
                  {publicPreview.preview.cards.map((image, index) => {
                    const previewImageUrl = safeExternalUrl(image.thumbnailUrl || image.deliveryUrl || undefined);
                    const previewLinkUrl = safeExternalUrl(image.link || undefined);
                    return (
                      <figure className="released-image-grid__item" key={`${publicPreview.actor.id}-${publicPreview.vibeIdx}-${image.link || image.thumbnailUrl || index}`}>
                        {previewImageUrl
                          ? <img src={previewImageUrl} alt={image.title ? `${locale === 'zh-CN' ? '来源原标题（未翻译）：' : ''}${image.title}` : `${locale === 'zh-CN' ? `英文：${publicPreview.vibe.labelEn || publicPreview.vibe.label || 'Vibe Pack'}` : publicPreview.vibe.labelEn || publicPreview.vibe.label || 'Vibe Pack'} ${t('preview', '预览')} ${index + 1}`} loading="lazy" />
                          : <div className="released-image-grid__missing" aria-label={t('Preview image unavailable', '预览图片不可用')}>{t('Preview unavailable', '预览不可用')}</div>}
                        <figcaption>
                          <span>{image.title ? `${locale === 'zh-CN' ? '来源原标题（未翻译）：' : ''}${image.title}` : t('Preview card', '预览卡片')}</span>
                          {previewLinkUrl && <a href={previewLinkUrl} target="_blank" rel="noreferrer">{image.source || t('View source', '查看原始来源')} ↗</a>}
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
                {publicPreview.preview.cards.length === 0 && (
                  <p className="released-grid-viewer__empty" role="status" aria-live="polite">{t('Public teaser images are unavailable right now. Sign in to open the full released Vibe Pack.', '公开预览图片目前不可用。请登录以查看完整的已发布氛围包。')}</p>
                )}
                <div className="released-library__teaser-access">
                  <h3>{t('Access', '访问方式')}</h3>
                  <p>{t('The full Vibe Pack is included with Collector membership.', '收藏会员可查看完整氛围包。')}</p>
                  <p>{publicPreviewFreeToday ? t('Free today: this release is the current Star of the Day Vibe Pack on the Vibe Atlas homepage.', '今日免费：此氛围包是氛围图鉴首页的今日之星主题。') : t('This release unlocks publicly when it is the Star of the Day, using the existing daily unlock flow.', '当此主题成为今日之星时，将按现有每日解锁流程向所有人开放。')}</p>
                  <div className="released-library__teaser-actions">
                    {publicPreviewFreeToday && <a href={`${path('/vibe-atlas')}#todays-released-pack`}>{t('Open today’s free pack', '查看今日免费氛围包')}</a>}
                    <a href={path(PUBLIC_ROUTE_PATHS.vibeAtlas)}>{t('Browse today’s Vibe Atlas homepage', '浏览氛围图鉴首页')}</a>
                  </div>
                </div>
            </article>
            )}
            {source === 'article' && preflightPreview && (
              <article className="released-library__teaser">
                <div className="released-library__teaser-copy">
                  <p className="membership__label">{t('Approved three-card preview · Liu Xueyi', '经批准的三张卡片预览 · 刘学义')}</p>
                  <h2>{locale === 'zh-CN' ? `英文：${preflightPreview.vibe.labelEn}` : preflightPreview.vibe.labelEn}</h2>
                  {preflightPreview.vibe.copy && <p>{locale === 'zh-CN' ? `${t('English preview copy:', '英文预览文案：')} ${preflightPreview.vibe.copy}` : preflightPreview.vibe.copy}</p>}
                </div>
                <div className="released-image-grid released-image-grid--preview" aria-label={`${locale === 'zh-CN' ? `英文：${preflightPreview.actor.nameEn}` : preflightPreview.actor.nameEn} ${preflightPreview.vibe.labelEn} ${t('three-card preview', '三张卡片预览')}`}>
                  {preflightPreview.cards.map((card, index) => (
                    <figure className="released-image-grid__item" key={`${preflightPreview.vibeIdx}-${index}`}>
                      <img src={safeExternalUrl(card.thumbnailUrl) || undefined} alt={card.title ? `${locale === 'zh-CN' ? '来源原标题（未翻译）：' : ''}${card.title}` : `${t('Preview card', '预览卡片')} ${index + 1}`} loading="lazy" />
                      <figcaption><span>{card.title ? `${locale === 'zh-CN' ? '来源原标题（未翻译）：' : ''}${card.title}` : ''}</span></figcaption>
                    </figure>
                  ))}
                </div>
                <div className="released-library__teaser-access">
                  <h3>{t('Access', '访问方式')}</h3>
                  <p>{t('The full Vibe Pack is included with Collector membership.', '收藏会员可查看完整氛围包。')}</p>
                  <p>{publicPreviewFreeToday ? t('Free today: this release is the current Star of the Day Vibe Pack on the Vibe Atlas homepage.', '今日免费：此氛围包是氛围图鉴首页的今日之星主题。') : t('This release unlocks publicly when it is the Star of the Day, using the existing daily unlock flow.', '当此主题成为今日之星时，将按现有每日解锁流程向所有人开放。')}</p>
                  <div className="released-library__teaser-actions">
                    {publicPreviewFreeToday && <a href={`${path('/vibe-atlas')}#todays-released-pack`}>{t('Open today’s free pack', '查看今日免费氛围包')}</a>}
                    <a href={path(PUBLIC_ROUTE_PATHS.vibeAtlas)}>{t('Browse today’s Vibe Atlas homepage', '浏览氛围图鉴首页')}</a>
                  </div>
                </div>
              </article>
            )}
          </section>
        )}
        {source !== 'daily_star' && source !== 'article' && publicPreviewError && (
          <div className="membership__notice" role="alert">
            <p>{publicPreviewError}</p>
          </div>
        )}
        <section className="released-library__locked" aria-label={t('Collector library access', '收藏会员图书馆访问权限')}>
          <span className="released-library__lock" aria-hidden="true">✦</span>
          <div>
            <h2>{publicPreview || preflightPreview ? t('Unlock the full released Vibe Pack', '解锁完整的已发布氛围包') : t('Unlock the full released-pack library', '解锁完整的已发布氛围包图书馆')}</h2>
            <p>{signedIn ? t('You’re signed in. Become a Collector to browse every released actor and vibe.', '你已登录。成为收藏会员，即可浏览所有已发布的演员与氛围包。') : t('Sign in to continue with your account, or become a Collector to browse every released actor and vibe.', '登录以继续使用账户，或成为收藏会员以浏览所有已发布的演员与氛围包。')}</p>
            {signedIn === false && <form onSubmit={signIn} className="released-library__sign-in">
              <label htmlFor="released-library-email">{t('Already have an account?', '已有账户？')}</label>
              <div><input id="released-library-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder={t('you@example.com', 'you@example.com')} /><button disabled={busy === 'sign-in'}>{busy === 'sign-in' ? t('Sending…', '正在发送…') : t('Email sign-in link', '发送登录链接')}</button></div>
            </form>}
            <button type="button" onClick={() => void upgrade()} disabled={busy === 'checkout'}>{busy === 'checkout' ? t('Opening checkout…', '正在打开结账页面…') : t('Become a Fandom Collector', '成为 Fandom 收藏会员')}</button>
            {notice && <p role="status">{notice}</p>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="released-library">
      <header className="released-library__hero">
        <p className="membership__label">{t('Fandom Collector · released Vibe Packs', 'Fandom 收藏会员 · 已发布氛围包')}</p>
        <h1>{t('The Vibe Atlas library.', '氛围图鉴氛围包库。')}</h1>
        <p>{t('Explore released actor × vibe packs—and generate a fresh grid from each one. Every grid is saved to your account.', '探索已发布的演员 × 氛围包，并根据每个氛围包生成全新九宫格。所有九宫格都会保存到你的账户。')}</p>
      </header>
      {loading && <p role="status">{t('Loading released packs…', '正在加载已发布的氛围包…')}</p>}
      {error && <p className="membership__notice" role="alert">{error}</p>}
      {!loading && !error && (
        <>
          {!packs.length && <p className="released-grid-viewer__empty" role="status">{t('No released packs are available yet.', '目前还没有可用的已发布氛围包。')}</p>}
          <div className="released-library__filters">
            <label>{t('Actor', '演员')}<select value={actor?.id || ''} onChange={event => chooseActor(event.target.value)}><option value="" disabled>{t('Choose an actor', '选择演员')}</option>{packs.map(pack => <option key={pack.id} value={pack.id}>{locale === 'zh-CN' ? pack.name || pack.shortName_en || pack.id : pack.shortName_en || pack.name || pack.id}</option>)}</select></label>
            <label>{t('Vibe Pack', '氛围包')}<select value={selectedVibe} onChange={event => chooseVibe(event.target.value)}><option value="">{t('All Vibe Packs', '全部氛围包')}</option>{vibes.map(item => <option key={`${item.label_en || item.label}-${item.vibeIdx}`} value={item.vibeIdx}>{selectorReleasedCopy(item.label_en, item.label, `Vibe ${item.vibeIdx + 1}`, locale)}</option>)}</select></label>
          </div>
          {vibe && (
            <section className="released-grid-viewer" aria-label={`${primaryReleasedCopy(vibe.label_en, vibe.label, t('Vibe', '氛围'), locale)} ${t('generated grid', '生成的九宫格')}`}>
              <div className="released-grid-viewer__heading">
                <div>
                  <p className="membership__label">{t('Generated from this released Vibe Pack', '由此已发布氛围包生成')}</p>
                  <h2>{vibe.emoji || '✦'} {primaryReleasedCopy(vibe.label_en, vibe.label, t('Vibe pack', '氛围包'), locale)}</h2>
                  {secondaryReleasedCopy(vibe.label_en, vibe.label, locale) && (
                    <p className="released-library__teaser-label">{secondaryReleasedCopy(vibe.label_en, vibe.label, locale)}</p>
                  )}
                  {(vibe.subtitle_en || vibe.subtitle) && (
                    <p>{primaryReleasedCopy(vibe.subtitle_en, vibe.subtitle, undefined, locale)}</p>
                  )}
                  {secondaryReleasedCopy(vibe.subtitle_en, vibe.subtitle, locale) && (
                    <p className="released-library__teaser-label">{secondaryReleasedCopy(vibe.subtitle_en, vibe.subtitle, locale)}</p>
                  )}
                  <p>{t('Fresh results use this Vibe Pack’s search, safety, and ranking rules. Generated images are not individually hand-reviewed.', '全新结果使用此氛围包的搜索、安全与排序规则。生成的图片未经逐张人工审核。')}</p>
                </div>
                <button type="button" onClick={() => void generateGrid(actor!.id, vibe.vibeIdx)} disabled={runLoading}>
                  {runLoading ? t('Generating…', '正在生成…') : selectedRun ? t('Refresh grid', '换一组') : t('Open fresh grid', '打开新九宫格')}
                </button>
              </div>
              {runError && <p className="membership__notice" role="alert">{runError}</p>}
              {runLoading && !selectedRun && <p role="status">{t('Searching and curating nine images…', '正在搜索并精选九张图片…')}</p>}
              {selectedRun && (
                <>
                  <div className="released-grid-viewer__meta">
                    <span>{new Date(selectedRun.generatedAt).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US')}</span>
                    {selectedRunSourceLabel && <span>{selectedRunSourceLabel}</span>}
                    {runs.length > 1 && <label>{t('Saved run', '已保存的生成记录')}<select value={selectedRun.id} onChange={event => setSelectedRun(runs.find(run => run.id === event.target.value) || selectedRun)}>{runs.map(run => <option key={run.id} value={run.id}>{new Date(run.generatedAt).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US')}</option>)}</select></label>}
                  </div>
                  <button type="button" onClick={() => void saveCollectorGrid()} disabled={Boolean(saveBusy) || Boolean(savedGridId && savedGridId === syncedGridId)}>
                    {savedGridId && savedGridId === syncedGridId ? `✓ ${t('Grid synced to My Collection', '九宫格已同步到“我的收藏”')}` : savedGridId ? t('Retry grid sync', '重试同步九宫格') : saveBusy === 'grid' ? t('Saving grid…', '正在保存九宫格…') : t('Save grid to My Collection', '将九宫格保存到“我的收藏”')}
                  </button>
                  {saveNotice && <p role="status">{saveNotice}</p>}
                  <div className="released-image-grid" aria-label={t('Nine image generated grid', '九张图片组成的生成九宫格')}>
                    {selectedRun.images.slice(0, 9).map((image, index) => (
                      <figure className="released-image-grid__item" key={`${selectedRun.id}-${index}`}>
                        {safeExternalUrl(image.thumbnail) ? <img src={safeExternalUrl(image.thumbnail) || undefined} alt={image.title ? `${locale === 'zh-CN' ? '来源原标题（未翻译）：' : ''}${image.title}` : `${primaryReleasedCopy(vibe.label_en, vibe.label, t('Vibe', '氛围'), locale)} ${t('result', '结果')} ${index + 1}`} loading="lazy" /> : <div className="released-image-grid__missing" aria-label={t('Image unavailable', '图片不可用')}>{t('Image unavailable', '图片不可用')}</div>}
                        <figcaption>
                          <span>{image.title ? `${locale === 'zh-CN' ? '来源原标题（未翻译）：' : ''}${image.title}` : t('Untitled result', '未命名结果')}</span>
                          {safeExternalUrl(image.link || image.source) && <a href={safeExternalUrl(image.link || image.source) || undefined} target="_blank" rel="noreferrer">{image.source || t('View source', '查看原始来源')} ↗</a>}
                          {safeExternalUrl(image.thumbnail) && <button type="button" onClick={() => void saveCollectorImage(index)} disabled={Boolean(saveBusy) || syncedImages.includes(image.thumbnail!)}>
                            {syncedImages.includes(image.thumbnail!) ? `✓ ${t('Synced to My Collection', '已同步到“我的收藏”')}` : savedImages.includes(image.thumbnail!) ? t('Retry image sync', '重试同步图片') : saveBusy === `image-${index}` ? t('Saving…', '正在保存…') : t('Save image', '保存图片')}
                          </button>}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </>
              )}
              {!runLoading && !selectedRun && !runError && runs.length === 0 && <p className="released-grid-viewer__empty">{t('Open this pack to generate its first saved grid.', '打开此氛围包以生成第一个已保存的九宫格。')}</p>}
            </section>
          )}
          {!vibe && <section className="released-library__grid" aria-label={t('Released vibe packs', '已发布的氛围包')}>
            {vibes.map(item => <article className="released-pack-card" key={`${actor?.id}-${item.vibeIdx}`}>
              <span className="released-pack-card__emoji">{item.emoji || '✦'}</span>
              <p className="membership__label">{locale === 'zh-CN' ? actor?.name || actor?.shortName_en : actor?.shortName_en || actor?.name}</p>
              <h2>{primaryReleasedCopy(item.label_en, item.label, t('Released vibe pack', '已发布氛围包'), locale)}</h2>
              {secondaryReleasedCopy(item.label_en, item.label, locale) && (
                <p className="released-library__teaser-label">{secondaryReleasedCopy(item.label_en, item.label, locale)}</p>
              )}
              {(item.subtitle_en || item.subtitle) && <p>{primaryReleasedCopy(item.subtitle_en, item.subtitle, undefined, locale)}</p>}
              {secondaryReleasedCopy(item.subtitle_en, item.subtitle, locale) && (
                <p className="released-library__teaser-label">{secondaryReleasedCopy(item.subtitle_en, item.subtitle, locale)}</p>
              )}
              <button type="button" onClick={() => chooseVibe(String(item.vibeIdx))}>{t('Open grid', '打开九宫格')}</button>
              {item.supportingCopy_en || item.supportingCopy ? <p>{primaryReleasedCopy(item.supportingCopy_en, item.supportingCopy, undefined, locale)}</p> : null}
              {item.sourceDepth?.queries?.length ? <details onToggle={event => { if (event.currentTarget.open && actor) trackReleasedPackOpened(source, actor.id, item.vibeIdx); }}><summary>{t('Source notes', '来源说明')}</summary><p>{t('Original search queries', '英文原始搜索词')}</p><ul>{item.sourceDepth.queries.map(query => <li key={query} lang="en">{query}</li>)}</ul>{item.sourceDepth.authoringPrompt && <p lang="en">{locale === 'zh-CN' ? `${t('English source prompt:', '英文来源提示词：')} ${item.sourceDepth.authoringPrompt}` : item.sourceDepth.authoringPrompt}</p>}</details> : null}
            </article>)}
          </section>}
        </>
      )}
    </main>
  );
}