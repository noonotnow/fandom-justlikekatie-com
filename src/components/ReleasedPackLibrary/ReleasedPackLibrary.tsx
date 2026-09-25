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

function primaryReleasedCopy(english?: string, chinese?: string, fallback?: string) {
  return english || chinese || fallback || '';
}

function secondaryReleasedCopy(english?: string, chinese?: string) {
  return english && chinese && english !== chinese ? chinese : null;
}

function selectorReleasedCopy(english?: string, chinese?: string, fallback?: string) {
  const primary = primaryReleasedCopy(english, chinese, fallback);
  const secondary = secondaryReleasedCopy(english, chinese);
  return secondary ? `${primary} · ${secondary}` : primary;
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
      }).catch(() => { if (!cancelled) setSaveNotice('Could not check saved items on this device.'); });
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
        if (!session) throw new Error('Sign in to sync this save.');
        await syncPublicCard(session, card.imageUrl);
        setSyncedImages(current => [...new Set([...current, card.imageUrl])]);
        setSaveNotice('Image saved and synced to My Collection.');
      } catch (error) {
        setSaveNotice(`Image saved on this device, but account sync failed: ${error instanceof Error ? error.message : 'try again in My Collection.'}`);
      }
    } catch (error) {
      setSaveNotice(error instanceof Error ? error.message : 'Could not save this image.');
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
        if (!session) throw new Error('Sign in to sync this save.');
        await syncPublicGrid(session, grid.id);
        setSyncedGridId(grid.id);
        setSaveNotice('Grid saved and synced to My Collection.');
      } catch (error) {
        setSaveNotice(`Grid saved on this device, but account sync failed: ${error instanceof Error ? error.message : 'try again in My Collection.'}`);
      }
    } catch (error) {
      setSaveNotice(error instanceof Error ? error.message : 'Could not save this grid.');
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
        if (!response.ok) throw new Error(body?.error || 'Released packs are temporarily unavailable.');
        const next = Array.isArray(body?.packs) ? body.packs : [];
        if (!cancelled) setPacks(next.filter((pack: ActorPack) => typeof pack?.id === 'string'));
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Released packs are temporarily unavailable.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entitled]);

  useEffect(() => {
    if (entitled || source === 'daily_star' || source === 'article') {
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
          throw new Error('Public pack previews are temporarily unavailable.');
        }
        if (!controller.signal.aborted) setPublicPacks(body.packs);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPublicPacksError('Public pack previews are temporarily unavailable.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setPublicPacksLoading(false);
      });
    return () => controller.abort();
  }, [entitled, source]);

  useEffect(() => {
    if (entitled || source === 'daily_star' || source === 'article' || !actorId || vibeIndex == null) {
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
          throw new Error('This pairing does not have a published public preview yet.');
        }
        if (!response.ok) throw new Error(body?.error || 'Public preview is temporarily unavailable.');
        if (!body?.pack || body.pack.actor?.id !== actorId || body.pack.vibeIdx !== vibeIndex) {
          throw new Error('Public preview is temporarily unavailable.');
        }
        if (!cancelled) setPublicPreview(body.pack);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        if (!cancelled) {
          setPublicPreview(null);
          setPublicPreviewError(err instanceof Error ? err.message : 'Public preview is temporarily unavailable.');
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
      setPreflightPacksError('Today’s actor is unavailable, so its other pack previews cannot be loaded.');
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
          throw new Error('Public pack previews are temporarily unavailable.');
        }
        const previews = body.previews.filter(preview => preview.actor.id === actorId);
        if (!controller.signal.aborted) setPreflightPacks(previews);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreflightPacksError('Public pack previews are temporarily unavailable.');
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
      setPreflightPreviewError('This article links only to its two approved Liu Xueyi pack previews.');
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
            ? 'This pairing does not have an approved public preview yet.'
            : 'Public pack preview is temporarily unavailable.');
        }
        if (!controller.signal.aborted) setPreflightPreview(body);
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          setPreflightPreviewError(error instanceof Error ? error.message : 'Public pack preview is temporarily unavailable.');
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
        if (!session) throw new Error('Sign in to sync your saved items.');
        for (const url of pendingImages) {
          await syncPublicCard(session, url);
          setSyncedImages(current => [...new Set([...current, url])]);
        }
        if (pendingGrid) {
          await syncPublicGrid(session, savedGridId);
          setSyncedGridId(savedGridId);
        }
        setSaveNotice('Saved items synced to My Collection.');
      })().catch(error => {
        setSaveNotice(`Account sync still needs a connection: ${error instanceof Error ? error.message : 'try again.'}`);
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
      if (!savedResponse.ok) throw new Error(savedBody?.error || 'Saved grids are temporarily unavailable.');
      savedRuns = Array.isArray(savedBody?.runs) ? savedBody.runs : [];
      if (runRequest.current.id !== requestId) return;
      setRuns(savedRuns);
      setSelectedRun(savedRuns[0] || null);
      setRunError('');
    } catch (err) {
      if (controller.signal.aborted || runRequest.current.id !== requestId) return;
      setRunError(err instanceof Error ? err.message : 'Saved grids are temporarily unavailable.');
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
      if (!freshResponse.ok) throw new Error(freshBody?.error || 'This grid could not be generated.');
      if (!freshBody?.run) throw new Error('The generated grid was empty.');
      if (runRequest.current.id !== requestId) return;
      const nextRun = freshBody.run as GridRun;
      setRunError('');
      setSelectedRun(nextRun);
      setRuns(previous => [nextRun, ...previous.filter(run => run.id !== nextRun.id)]);
      trackReleasedPackOpened(source, actorValue, vibeValue);
    } catch (err) {
      if (controller.signal.aborted || runRequest.current.id !== requestId) return;
      setRunError(err instanceof Error ? err.message : 'This grid could not be generated.');
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
      if (!response.ok) throw new Error(body?.error || 'This grid could not be generated.');
      if (!body?.run) throw new Error('The generated grid was empty.');
      if (runRequest.current.id !== requestId) return;
      const nextRun = body.run as GridRun;
      setSelectedRun(nextRun);
      setRuns(previous => [nextRun, ...previous.filter(run => run.id !== nextRun.id)]);
    } catch (err) {
      if (controller.signal.aborted || runRequest.current.id !== requestId) return;
      setRunError(err instanceof Error ? err.message : 'This grid could not be generated.');
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
      setNotice(err instanceof Error ? err.message : 'Could not send the sign-in link.');
    } finally { setBusy(''); }
  }

  async function upgrade() {
    trackReleasedLibraryCheckoutStarted(source, actorId, vibeIndex);
    setBusy('checkout');
    try {
      window.location.assign(await createMembershipCheckout());
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Checkout could not be opened.');
      setBusy('');
    }
  }

  const publicPreviewFreeToday = publicPreview
    && currentRelease?.actorId === publicPreview.actor.id
    && currentRelease?.vibeIdx === publicPreview.vibeIdx;

  const selectedRunSourceLabel = selectedRun?.source === 'fallback'
    ? 'Image source: backup search · 备用搜索源'
    : selectedRun?.source
      ? `Source: ${selectedRun.source}`
      : null;

  if (!entitled) {
    return (
      <main className="released-library">
        <header className="released-library__hero">
          <p className="membership__label">Fandom Collector · 已发布 Vibe Packs</p>
          <h1>The Vibe Atlas library.</h1>
          <p>Explore released actor × vibe packs—and generate a fresh 图集 from each one. Every grid is saved to your account.</p>
        </header>
        {source !== 'daily_star' && source !== 'article' && <section className="released-library__directory" aria-label="Public released-pack previews">
          <h2>Browse public pack previews</h2>
          {publicPacksLoading && <p role="status">Loading public previews…</p>}
          {publicPacksError && <p role="alert">{publicPacksError}</p>}
          {!publicPacksLoading && !publicPacksError && publicPacks.length === 0 && (
            <p role="status">No public pack previews are published yet. Today’s free grid is on the <a href={`${PUBLIC_ROUTE_PATHS.vibeAtlas}#daily-evidence`}>Vibe Atlas homepage</a>.</p>
          )}
          {publicPacks.map(pack => {
            const url = safeExternalUrl(pack.canonical);
            const path = url ? new URL(url).pathname : null;
            return (
              <article className="released-library__teaser" key={`${pack.actor.id}:${pack.vibeIdx}`}>
                <div className="released-library__teaser-copy">
                  <p className="membership__label">Public teaser · 公开预览</p>
                  <h3>{pack.vibe.emoji || '✦'} {pack.actor.nameEn || pack.actor.name} × {pack.vibe.labelEn || pack.vibe.label}</h3>
                  <p>{pack.preview.copy}</p>
                  {path && <a href={path}>View public pack preview</a>}
                </div>
                <div className="released-image-grid released-image-grid--preview" aria-label={`${pack.actor.nameEn || pack.actor.name} preview images`}>
                  {pack.preview.cards.map((card, index) => {
                    const imageUrl = safeExternalUrl(card.thumbnailUrl || card.deliveryUrl || undefined);
                    return imageUrl ? (
                      <figure className="released-image-grid__item" key={index}>
                        <img src={imageUrl} alt={card.title || `Preview card ${index + 1}`} loading="lazy" />
                      </figure>
                    ) : null;
                  })}
                </div>
              </article>
            );
          })}
        </section>}
        {source !== 'daily_star' && source !== 'article' && publicPreviewLoading && <p role="status">Loading public teaser…</p>}
        {source !== 'daily_star' && source !== 'article' && publicPreview && (
          <section className="released-library__teaser" aria-labelledby="released-pack-preview-title">
            <div className="released-library__teaser-copy">
              <p className="membership__label">Public teaser · 公开预览</p>
              <h2 id="released-pack-preview-title">{publicPreview.vibe.emoji || '✦'} {publicPreview.vibe.labelEn || publicPreview.vibe.label}</h2>
              {publicPreview.vibe.label && publicPreview.vibe.labelEn && publicPreview.vibe.label !== publicPreview.vibe.labelEn && (
                <p className="released-library__teaser-label">{publicPreview.vibe.label}</p>
              )}
              <p><strong>Actor / 演员:</strong> {publicPreview.actor.nameEn || publicPreview.actor.name || publicPreview.actor.id}{publicPreview.actor.name && publicPreview.actor.nameEn && publicPreview.actor.name !== publicPreview.actor.nameEn ? ` · ${publicPreview.actor.name}` : ''}</p>
              {(publicPreview.vibe.subtitleEn || publicPreview.vibe.subtitle) && (
                <p>{publicPreview.vibe.subtitleEn || publicPreview.vibe.subtitle}{publicPreview.vibe.subtitle && publicPreview.vibe.subtitleEn && publicPreview.vibe.subtitle !== publicPreview.vibe.subtitleEn ? ` · ${publicPreview.vibe.subtitle}` : ''}</p>
              )}
              <p>{publicPreview.preview.copy}</p>
              <p className="released-grid-viewer__empty">This Vibe Pack / 氛围包 is the reusable editorial sourceboard. Each grid / 图集 is freshly generated from its search, safety, and ranking rules.</p>
            </div>
            <div className="released-image-grid released-image-grid--preview" aria-label="Released Vibe Pack public teaser">
              {publicPreview.preview.cards.map((image, index) => {
                const previewImageUrl = safeExternalUrl(image.thumbnailUrl || image.deliveryUrl || undefined);
                const previewLinkUrl = safeExternalUrl(image.link || undefined);
                return (
                  <figure className="released-image-grid__item" key={`${publicPreview.actor.id}-${publicPreview.vibeIdx}-${image.link || image.thumbnailUrl || index}`}>
                    {previewImageUrl
                      ? <img src={previewImageUrl} alt={image.title || `${publicPreview.vibe.labelEn || publicPreview.vibe.label || 'Vibe Pack'} preview ${index + 1}`} loading="lazy" />
                      : <div className="released-image-grid__missing" aria-label="Preview image unavailable">Preview unavailable</div>}
                    <figcaption>
                      <span>{image.title || 'Preview card'}</span>
                      {previewLinkUrl && <a href={previewLinkUrl} target="_blank" rel="noreferrer">{image.source || 'View source'} ↗</a>}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
            {publicPreview.preview.cards.length === 0 && (
              <p className="released-grid-viewer__empty" role="status" aria-live="polite">Public teaser images are unavailable right now. Sign in to open the full released Vibe Pack.</p>
            )}
            <div className="released-library__teaser-access">
              <h3>Access / 访问</h3>
              <p>The full Vibe Pack is included with Collector membership.</p>
              <p>{publicPreviewFreeToday ? 'Free today: this release is the current Star of the Day Vibe Pack on the Vibe Atlas homepage.' : 'This release unlocks publicly when it is the Star of the Day, using the existing daily unlock flow.'}</p>
              <div className="released-library__teaser-actions">
                {publicPreviewFreeToday && <a href="/vibe-atlas#todays-released-pack">Open today’s free pack</a>}
                <a href={PUBLIC_ROUTE_PATHS.vibeAtlas}>Browse today’s Vibe Atlas homepage</a>
              </div>
            </div>
          </section>
        )}
        {source !== 'daily_star' && source !== 'article' && publicPreviewError && (
          <div className="membership__notice" role="alert">
            <p>{publicPreviewError}</p>
          </div>
        )}
        {source === 'daily_star' && (
          <section className="released-library__directory" aria-label="Daily actor preflight previews">
            <h2>{`${preflightPacks[0]?.actor.nameEn || (currentRelease?.actorId === actorId ? actorName : '') || actorName || 'Today’s star'}’s other Vibe Packs`}</h2>
            {preflightPacksLoading && <p role="status">Loading approved three-card previews…</p>}
            {preflightPacksError && <p role="alert">{preflightPacksError}</p>}
            {!preflightPacksLoading && !preflightPacksError && dailyActorPacks.length === 0 && (
              <p role="status">{`${actorName || 'This star'}’s other packs do not have approved public previews yet.`}</p>
            )}
            {dailyActorPacks.map(pack => (
              <article className="released-library__teaser" key={`${pack.actor.id}:${pack.vibeIdx}`}>
                <div className="released-library__teaser-copy">
                  <p className="membership__label">Approved three-card preview</p>
                  <h3>{pack.actor.nameEn} × {pack.vibe.labelEn}</h3>
                  {pack.vibe.copy && <p>{pack.vibe.copy}</p>}
                </div>
                <div className="released-image-grid released-image-grid--preview" aria-label={`${pack.actor.nameEn} ${pack.vibe.labelEn} three-card preview`}>
                  {pack.cards.map((card, index) => (
                    <figure className="released-image-grid__item" key={`${pack.vibeIdx}-${index}`}>
                      <img src={safeExternalUrl(card.thumbnailUrl) || undefined} alt={card.title || `Preview card ${index + 1}`} loading="lazy" />
                      <figcaption><span>{card.title}</span></figcaption>
                    </figure>
                  ))}
                </div>
              </article>
            ))}
          </section>
        )}
        {source === 'article' && (
          <section className="released-library__directory" aria-label="Article-linked public pack preview">
            {preflightPreviewLoading && <p role="status">Loading approved three-card preview…</p>}
            {preflightPreviewError && <p role="alert">{preflightPreviewError}</p>}
            {preflightPreview && (
              <article className="released-library__teaser">
                <div className="released-library__teaser-copy">
                  <p className="membership__label">Approved three-card preview · Liu Xueyi</p>
                  <h2>{preflightPreview.vibe.labelEn}</h2>
                  {preflightPreview.vibe.copy && <p>{preflightPreview.vibe.copy}</p>}
                </div>
                <div className="released-image-grid released-image-grid--preview" aria-label={`${preflightPreview.actor.nameEn} ${preflightPreview.vibe.labelEn} three-card preview`}>
                  {preflightPreview.cards.map((card, index) => (
                    <figure className="released-image-grid__item" key={`${preflightPreview.vibeIdx}-${index}`}>
                      <img src={safeExternalUrl(card.thumbnailUrl) || undefined} alt={card.title || `Preview card ${index + 1}`} loading="lazy" />
                      <figcaption><span>{card.title}</span></figcaption>
                    </figure>
                  ))}
                </div>
              </article>
            )}
          </section>
        )}
        <section className="released-library__locked" aria-label="Collector library access">
          <span className="released-library__lock" aria-hidden="true">✦</span>
          <div>
            <h2>{publicPreview ? 'Unlock the full released Vibe Pack' : 'Unlock the full released-pack library'}</h2>
            <p>{signedIn ? 'You’re signed in. Become a Collector to browse every released actor and vibe.' : 'Sign in to continue with your account, or become a Collector to browse every released actor and vibe.'}</p>
            {signedIn === false && <form onSubmit={signIn} className="released-library__sign-in">
              <label htmlFor="released-library-email">Already have an account?</label>
              <div><input id="released-library-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /><button disabled={busy === 'sign-in'}>{busy === 'sign-in' ? 'Sending…' : 'Email sign-in link'}</button></div>
            </form>}
            <button type="button" onClick={() => void upgrade()} disabled={busy === 'checkout'}>{busy === 'checkout' ? 'Opening checkout…' : 'Become a Fandom Collector'}</button>
            {notice && <p role="status">{notice}</p>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="released-library">
      <header className="released-library__hero">
        <p className="membership__label">Fandom Collector · 已发布 Vibe Packs</p>
        <h1>The Vibe Atlas library.</h1>
        <p>Explore released actor × vibe packs—and generate a fresh 图集 from each one. Every grid is saved to your account.</p>
      </header>
      {loading && <p role="status">Loading released packs…</p>}
      {error && <p className="membership__notice" role="alert">{error}</p>}
      {!loading && !error && (
        <>
          {!packs.length && <p className="released-grid-viewer__empty" role="status">No released packs are available yet.</p>}
          <div className="released-library__filters">
            <label>Actor / 演员<select value={actor?.id || ''} onChange={event => chooseActor(event.target.value)}><option value="" disabled>Choose an actor</option>{packs.map(pack => <option key={pack.id} value={pack.id}>{pack.shortName_en || pack.name || pack.id}</option>)}</select></label>
            <label>Vibe Pack / 氛围包<select value={selectedVibe} onChange={event => chooseVibe(event.target.value)}><option value="">All Vibe Packs</option>{vibes.map(item => <option key={`${item.label_en || item.label}-${item.vibeIdx}`} value={item.vibeIdx}>{selectorReleasedCopy(item.label_en, item.label, `Vibe ${item.vibeIdx + 1}`)}</option>)}</select></label>
          </div>
          {vibe && (
            <section className="released-grid-viewer" aria-label={`${primaryReleasedCopy(vibe.label_en, vibe.label, 'Vibe')} generated grid`}>
              <div className="released-grid-viewer__heading">
                <div>
                  <p className="membership__label">Generated from this released Vibe Pack · 来自已发布氛围包</p>
                  <h2>{vibe.emoji || '✦'} {primaryReleasedCopy(vibe.label_en, vibe.label, 'Vibe pack')}</h2>
                  {secondaryReleasedCopy(vibe.label_en, vibe.label) && (
                    <p className="released-library__teaser-label">{secondaryReleasedCopy(vibe.label_en, vibe.label)}</p>
                  )}
                  {(vibe.subtitle_en || vibe.subtitle) && (
                    <p>{primaryReleasedCopy(vibe.subtitle_en, vibe.subtitle)}</p>
                  )}
                  {secondaryReleasedCopy(vibe.subtitle_en, vibe.subtitle) && (
                    <p className="released-library__teaser-label">{secondaryReleasedCopy(vibe.subtitle_en, vibe.subtitle)}</p>
                  )}
                  <p>Fresh results use this Vibe Pack’s search, safety, and ranking rules. Generated images are not individually hand-reviewed. / 图集为实时生成，未经逐张人工审核。</p>
                </div>
                <button type="button" onClick={() => void generateGrid(actor!.id, vibe.vibeIdx)} disabled={runLoading}>
                  {runLoading ? 'Generating…' : selectedRun ? 'Refresh grid · 换一组' : 'Open fresh grid · 打开图集'}
                </button>
              </div>
              {runError && <p className="membership__notice" role="alert">{runError}</p>}
              {runLoading && !selectedRun && <p role="status">Searching and curating nine images…</p>}
              {selectedRun && (
                <>
                  <div className="released-grid-viewer__meta">
                    <span>{new Date(selectedRun.generatedAt).toLocaleString()}</span>
                    {selectedRunSourceLabel && <span>{selectedRunSourceLabel}</span>}
                    {runs.length > 1 && <label>Saved run<select value={selectedRun.id} onChange={event => setSelectedRun(runs.find(run => run.id === event.target.value) || selectedRun)}>{runs.map(run => <option key={run.id} value={run.id}>{new Date(run.generatedAt).toLocaleString()}</option>)}</select></label>}
                  </div>
                  <button type="button" onClick={() => void saveCollectorGrid()} disabled={Boolean(saveBusy) || Boolean(savedGridId && savedGridId === syncedGridId)}>
                    {savedGridId && savedGridId === syncedGridId ? '✓ Grid synced to My Collection' : savedGridId ? 'Retry grid sync' : saveBusy === 'grid' ? 'Saving grid…' : 'Save grid to My Collection'}
                  </button>
                  {saveNotice && <p role="status">{saveNotice}</p>}
                  <div className="released-image-grid" aria-label="Nine image generated grid">
                    {selectedRun.images.slice(0, 9).map((image, index) => (
                      <figure className="released-image-grid__item" key={`${selectedRun.id}-${index}`}>
                        {safeExternalUrl(image.thumbnail) ? <img src={safeExternalUrl(image.thumbnail) || undefined} alt={image.title || `${primaryReleasedCopy(vibe.label_en, vibe.label, 'Vibe')} result ${index + 1}`} loading="lazy" /> : <div className="released-image-grid__missing" aria-label="Image unavailable">Image unavailable</div>}
                        <figcaption>
                          <span>{image.title || 'Untitled result'}</span>
                          {safeExternalUrl(image.link || image.source) && <a href={safeExternalUrl(image.link || image.source) || undefined} target="_blank" rel="noreferrer">{image.source || 'View source'} ↗</a>}
                          {safeExternalUrl(image.thumbnail) && <button type="button" onClick={() => void saveCollectorImage(index)} disabled={Boolean(saveBusy) || syncedImages.includes(image.thumbnail!)}>
                            {syncedImages.includes(image.thumbnail!) ? '✓ Synced to My Collection' : savedImages.includes(image.thumbnail!) ? 'Retry image sync' : saveBusy === `image-${index}` ? 'Saving…' : 'Save image'}
                          </button>}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </>
              )}
              {!runLoading && !selectedRun && !runError && runs.length === 0 && <p className="released-grid-viewer__empty">Open this pack to generate its first saved grid.</p>}
            </section>
          )}
          {!vibe && <section className="released-library__grid" aria-label="Released vibe packs">
            {vibes.map(item => <article className="released-pack-card" key={`${actor?.id}-${item.vibeIdx}`}>
              <span className="released-pack-card__emoji">{item.emoji || '✦'}</span>
              <p className="membership__label">{actor?.shortName_en || actor?.name}</p>
              <h2>{primaryReleasedCopy(item.label_en, item.label, 'Released vibe pack')}</h2>
              {secondaryReleasedCopy(item.label_en, item.label) && (
                <p className="released-library__teaser-label">{secondaryReleasedCopy(item.label_en, item.label)}</p>
              )}
              {(item.subtitle_en || item.subtitle) && <p>{primaryReleasedCopy(item.subtitle_en, item.subtitle)}</p>}
              {secondaryReleasedCopy(item.subtitle_en, item.subtitle) && (
                <p className="released-library__teaser-label">{secondaryReleasedCopy(item.subtitle_en, item.subtitle)}</p>
              )}
              <button type="button" onClick={() => chooseVibe(String(item.vibeIdx))}>Open grid</button>
              {item.supportingCopy_en || item.supportingCopy ? <p>{item.supportingCopy_en || item.supportingCopy}</p> : null}
              {item.sourceDepth?.queries?.length ? <details onToggle={event => { if (event.currentTarget.open && actor) trackReleasedPackOpened(source, actor.id, item.vibeIdx); }}><summary>Source depth</summary><ul>{item.sourceDepth.queries.map(query => <li key={query}>{query}</li>)}</ul>{item.sourceDepth.authoringPrompt && <p>{item.sourceDepth.authoringPrompt}</p>}</details> : null}
            </article>)}
          </section>}
        </>
      )}
    </main>
  );
}