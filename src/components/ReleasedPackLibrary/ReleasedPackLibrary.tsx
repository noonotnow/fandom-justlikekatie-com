import { useEffect, useMemo, useState } from 'react';
import {
  createMembershipCheckout,
  hasCollectorCapability,
  type MembershipStatus,
} from '../../utils/membership';
import { requestMagicLink } from '../../utils/publicAccount';

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

interface Props {
  status: MembershipStatus | null;
  actorId?: string | null;
  vibeIndex?: number | null;
}

export function ReleasedPackLibrary({ status, actorId, vibeIndex }: Props) {
  const entitled = hasCollectorCapability(status);
  const [packs, setPacks] = useState<ActorPack[]>([]);
  const [selectedActor, setSelectedActor] = useState(actorId || '');
  const [selectedVibe, setSelectedVibe] = useState(vibeIndex == null ? '' : String(vibeIndex));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

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
  }, [actor, selectedActor]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy('sign-in');
    try {
      setNotice(await requestMagicLink(email, `released:${actorId || ''}`));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not send the sign-in link.');
    } finally { setBusy(''); }
  }

  async function upgrade() {
    setBusy('checkout');
    try {
      window.location.assign(await createMembershipCheckout());
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Checkout could not be opened.');
      setBusy('');
    }
  }

  if (!entitled) {
    return (
      <main className="released-library">
        <header className="released-library__hero">
          <p className="membership__label">Vibe Atlas Collector library</p>
          <h1>Released packs, ready when you are.</h1>
          <p>Every approved actor × vibe pairing gets a useful editorial preview. The full source-depth pack is reserved for Fandom Collectors.</p>
        </header>
        <section className="released-library__locked" aria-label="Collector library access">
          <span className="released-library__lock" aria-hidden="true">✦</span>
          <div>
            <h2>Unlock the full released-pack library</h2>
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
        <p className="membership__label">Fandom Collector · Released packs</p>
        <h1>The Vibe Atlas library.</h1>
        <p>Browse the approved actor × vibe packs and open the source depth behind each release.</p>
      </header>
      {loading && <p role="status">Loading released packs…</p>}
      {error && <p className="membership__notice" role="alert">{error}</p>}
      {!loading && !error && (
        <>
          <div className="released-library__filters">
            <label>Actor<select value={actor?.id || ''} onChange={event => { setSelectedActor(event.target.value); setSelectedVibe(''); }}><option value="" disabled>Choose an actor</option>{packs.map(pack => <option key={pack.id} value={pack.id}>{pack.shortName_en || pack.name || pack.id}</option>)}</select></label>
            <label>Vibe<select value={selectedVibe} onChange={event => setSelectedVibe(event.target.value)}><option value="">All vibes</option>{vibes.map(item => <option key={`${item.label_en || item.label}-${item.vibeIdx}`} value={item.vibeIdx}>{item.label_en || item.label || `Vibe ${item.vibeIdx + 1}`}</option>)}</select></label>
          </div>
          <section className="released-library__grid" aria-label="Released vibe packs">
            {(vibe ? [vibe] : vibes).map(item => <article className="released-pack-card" key={`${actor?.id}-${item.vibeIdx}`}>
              <span className="released-pack-card__emoji">{item.emoji || '✦'}</span>
              <p className="membership__label">{actor?.shortName_en || actor?.name}</p>
              <h2>{item.label_en || item.label || 'Released vibe pack'}</h2>
              <p>{item.subtitle_en || item.subtitle}</p>
              {item.supportingCopy_en || item.supportingCopy ? <p>{item.supportingCopy_en || item.supportingCopy}</p> : null}
              {item.sourceDepth?.queries?.length ? <details><summary>Source depth</summary><ul>{item.sourceDepth.queries.map(query => <li key={query}>{query}</li>)}</ul>{item.sourceDepth.authoringPrompt && <p>{item.sourceDepth.authoringPrompt}</p>}</details> : null}
            </article>)}
          </section>
        </>
      )}
    </main>
  );
}