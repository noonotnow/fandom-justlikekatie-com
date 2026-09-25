import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createMembershipCheckout,
  hasCollectorCapability,
  type MembershipStatus,
} from '../../utils/membership';
import { requestMagicLink } from '../../utils/publicAccount';
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

interface Props {
  status: MembershipStatus | null;
  membershipResolved: boolean;
  actorId?: string | null;
  vibeIndex?: number | null;
  currentRelease?: { actorId: string; vibeIdx: number } | null;
  source: ReleasedLibrarySource;
}

export function ReleasedPackLibrary({
  status,
  membershipResolved,
  actorId,
  vibeIndex,
  currentRelease = null,
  source,
}: Props) {
  const entitled = hasCollectorCapability(status);
  const [packs, setPacks] = useState<ActorPack[]>([]);
  const [publicPreview, setPublicPreview] = useState<PublicReleasedPackPreview | null>(null);
  const [publicPacks, setPublicPacks] = useState<PublicDirectoryPack[]>([]);
  const [publicPacksLoading, setPublicPacksLoading] = useState(false);
  const [publicPacksError, setPublicPacksError] = useState('');
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
    if (entitled) {
      setPublicPacks([]);
      setPublicPacksError('');
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
  }, [entitled]);

  useEffect(() => {
    if (entitled || !actorId || vibeIndex == null) {
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
          throw new Error(source === 'daily_star'
            ? "This pairing has no published public teaser yet. Today's nine-card drop is free on the Vibe Atlas homepage."
            : 'This pairing does not have a published public preview yet.');
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

  const actor = useMemo(
    () => packs.find(pack => pack.id === selectedActor) || packs[0],
    [packs, selectedActor],
  );
  const vibes = actor?.vibes || [];
  const vibe = selectedVibe === ''
    ? null
    : vibes.find(item => item.vibeIdx === Number(selectedVibe)) || null;

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
        <section className="released-library__directory" aria-label="Public released-pack previews">
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
        </section>
        {publicPreviewLoading && <p role="status">Loading public teaser…</p>}
        {publicPreview && (
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
        {publicPreviewError && (
          <div className="membership__notice" role="alert">
            <p>{publicPreviewError}</p>
            {source === 'daily_star' && (
              <a href={`${PUBLIC_ROUTE_PATHS.vibeAtlas}#daily-evidence`}>View today's free nine-card drop</a>
            )}
          </div>
        )}
        <section className="released-library__locked" aria-label="Collector library access">
          <span className="released-library__lock" aria-hidden="true">✦</span>
          <div>
            <h2>{publicPreview ? 'Unlock the full released Vibe Pack' : 'Unlock the full released-pack library'}</h2>
            <p>Sign in to continue with your account, or become a Collector to browse every released actor and vibe.</p>
            <form onSubmit={signIn} className="released-library__sign-in">
              <label htmlFor="released-library-email">Already have an account?</label>
              <div><input id="released-library-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /><button disabled={busy === 'sign-in'}>{busy === 'sign-in' ? 'Sending…' : 'Email sign-in link'}</button></div>
            </form>
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
                  <div className="released-image-grid" aria-label="Nine image generated grid">
                    {selectedRun.images.slice(0, 9).map((image, index) => (
                      <figure className="released-image-grid__item" key={`${selectedRun.id}-${index}`}>
                        {safeExternalUrl(image.thumbnail) ? <img src={safeExternalUrl(image.thumbnail) || undefined} alt={image.title || `${primaryReleasedCopy(vibe.label_en, vibe.label, 'Vibe')} result ${index + 1}`} loading="lazy" /> : <div className="released-image-grid__missing" aria-label="Image unavailable">Image unavailable</div>}
                        <figcaption>
                          <span>{image.title || 'Untitled result'}</span>
                          {safeExternalUrl(image.link || image.source) && <a href={safeExternalUrl(image.link || image.source) || undefined} target="_blank" rel="noreferrer">{image.source || 'View source'} ↗</a>}
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