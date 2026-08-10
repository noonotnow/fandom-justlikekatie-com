import { useState, useEffect, useRef } from 'react';
import { dbGetVisibleCards, dbRemoveCard, type CardRecord } from '../../utils/collectionDB';
import {
  getPublicSession,
  hasMergeDecision,
  logoutPublicAccount,
  requestMagicLink,
  setDeviceMerge,
  syncPublicCollection,
  type PublicUser,
} from '../../utils/publicAccount';

export const Collection: React.FC = () => {
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterActor, setFilterActor] = useState<string | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [email, setEmail] = useState('');
  const [accountNotice, setAccountNotice] = useState(() => {
    const notice = sessionStorage.getItem('fandom_auth_notice') || '';
    sessionStorage.removeItem('fandom_auth_notice');
    return notice;
  });
  const [needsMergeChoice, setNeedsMergeChoice] = useState(false);
  const accountIdRef = useRef<string | undefined>(undefined);


  useEffect(() => {
    const load = () => dbGetVisibleCards(accountIdRef.current).then((all) => {
        // Sort newest-saved first
        all.sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''));
        setCards(all);
      });
    const refreshSession = async () => {
      const session = await getPublicSession();
      accountIdRef.current = session?.accountId;
      setUser(session);
      if (session) {
        const decided = await hasMergeDecision(session.accountId);
        setNeedsMergeChoice(!decided);
        if (decided) await syncPublicCollection(session);
      } else {
        setNeedsMergeChoice(false);
      }
      await load();
    };
    void refreshSession().finally(() => setLoading(false));
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel('fandom-collection') : null;
    channel?.addEventListener('message', event => {
      if (event.data?.type === 'session-changed') void refreshSession();
      else void load();
    });
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'fandom-collection-notify') return;
      if (event.newValue?.startsWith('session-changed:')) void refreshSession();
      else void load();
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      channel?.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  async function handleRemove(imageUrl: string) {
    try {
      await dbRemoveCard(imageUrl);
      setCards((prev) => prev.filter((c) => c.imageUrl !== imageUrl));
      if (user && !needsMergeChoice) await syncPublicCollection(user);
    } catch (error) {
      setAccountNotice(messageFrom(error, 'The card could not be removed.'));
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
      if (merge) {
        await syncPublicCollection(user);
        setCards(await dbGetVisibleCards(user.accountId));
      }
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
      setCards(await dbGetVisibleCards());
      setAccountNotice('Signed out. Local saves still work on this device.');
    } catch (error) {
      setAccountNotice(messageFrom(error, 'Could not sign out.'));
    }
  }

  if (loading) {
    return (
      <div className="text-center py-16 text-gray-500">Loading collection…</div>
    );
  }

  const actors = Array.from(new Set(cards.map((c) => c.actor)));
  const displayed = filterActor ? cards.filter((c) => c.actor === filterActor) : cards;

  return (
    <div className="px-4 py-8">
      <h2 className="text-2xl font-semibold text-gold text-center mb-6">
        我的收藏 · My Collection
      </h2>
      <div className="mx-auto mb-6 max-w-xl rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        {user ? (
          <>
            <p className="text-sm">Signed in as <strong>{user.email}</strong></p>
            {needsMergeChoice && (
              <div className="mt-3">
                <p className="text-sm">Merge this browser profile’s saved cards into your account collection?</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => void handleMerge(true)} className="rounded bg-gold px-3 py-1 text-sm text-black">Merge and sync</button>
                  <button onClick={() => void handleMerge(false)} className="rounded border px-3 py-1 text-sm">Keep separate</button>
                </div>
              </div>
            )}
            <button onClick={() => void handleLogout()} className="mt-3 text-sm underline">Sign out</button>
          </>
        ) : (
          <form onSubmit={handleMagicLink}>
            <label className="block text-sm" htmlFor="collection-email">Sync this collection across your devices</label>
            <div className="mt-2 flex gap-2">
              <input
                id="collection-email"
                type="email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="min-w-0 flex-1 rounded border px-3 py-1 text-black"
                placeholder="you@example.com"
              />
              <button className="rounded bg-gold px-3 py-1 text-sm text-black">Email sign-in link</button>
            </div>
          </form>
        )}
        {accountNotice && <p className="mt-2 text-sm text-gray-500">{accountNotice}</p>}
      </div>
      {cards.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-2xl mb-2">☆</p>
          <p>No saved cards yet — tap ☆ in the lightbox to start collecting!</p>
        </div>
      ) : (
        <>
      <div className="flex flex-wrap gap-2 justify-center mb-6">
        <button
          onClick={() => setFilterActor(null)}
          style={{
            padding: '0.3rem 0.85rem',
            borderRadius: '999px',
            border: `1px solid ${filterActor === null ? '#c9a96e' : '#c9a96e55'}`,
            background: filterActor === null ? '#c9a96e22' : 'transparent',
            color: '#c9a96e',
            fontSize: '0.82rem',
            fontWeight: filterActor === null ? 600 : 400,
            cursor: 'pointer',
          }}
        >
          全部 · All
        </button>
        {actors.map((actor) => (
          <button
            key={actor}
            onClick={() => setFilterActor(actor)}
            style={{
              padding: '0.3rem 0.85rem',
              borderRadius: '999px',
              border: `1px solid ${filterActor === actor ? '#c9a96e' : '#c9a96e55'}`,
              background: filterActor === actor ? '#c9a96e22' : 'transparent',
              color: '#c9a96e',
              fontSize: '0.82rem',
              fontWeight: filterActor === actor ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {actor}
          </button>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
        {displayed.map((card) => (
          <div
            key={card.imageUrl}
            className="relative rounded-lg overflow-hidden shadow-md bg-white dark:bg-gray-800"
          >
            <img
              src={card.thumbnailUrl}
              alt={`${card.actor} · ${card.vibe}`}
              className="w-full aspect-square object-cover"
            />
            <div className="p-2 text-xs">
              <div className="font-semibold truncate">
                {card.vibeEmoji} {card.actor}
              </div>
              <div className="text-gray-500 truncate">{card.vibe}</div>
              <div className="text-gray-400">{card.capturedDate}</div>
            </div>
            <button
              onClick={() => handleRemove(card.imageUrl)}
              title="Remove from collection"
              aria-label="Remove from collection"
              className="absolute top-1 right-1 text-gold text-lg leading-none"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              ★
            </button>
          </div>
        ))}
      </div>
        </>
      )}
    </div>
  );
};

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
