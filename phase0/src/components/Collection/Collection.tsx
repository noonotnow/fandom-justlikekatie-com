import { useState, useEffect } from 'react';
import { dbGetAllCards, dbRemoveCard, type CardRecord } from '../../utils/collectionDB';

export const Collection: React.FC = () => {
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterActor, setFilterActor] = useState<string | null>(null);


  useEffect(() => {
    dbGetAllCards()
      .then((all) => {
        // Sort newest-saved first
        all.sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''));
        setCards(all);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleRemove(imageUrl: string) {
    await dbRemoveCard(imageUrl);
    setCards((prev) => prev.filter((c) => c.imageUrl !== imageUrl));
  }

  if (loading) {
    return (
      <div className="text-center py-16 text-gray-500">Loading collection…</div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-2xl mb-2">☆</p>
        <p>No saved cards yet — tap ☆ in the lightbox to start collecting!</p>
      </div>
    );
  }
  const actors = Array.from(new Set(cards.map((c) => c.actor)));
  const displayed = filterActor ? cards.filter((c) => c.actor === filterActor) : cards;

  return (
    <div className="px-4 py-8">
      <h2 className="text-2xl font-semibold text-gold text-center mb-6">
        我的收藏 · My Collection
      </h2>
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
    </div>
  );
};
