import { useState, useEffect } from 'react';
import { dbGetAllCards, dbRemoveCard, type CardRecord } from '../../utils/collectionDB';

export const Collection: React.FC = () => {
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="px-4 py-8">
      <h2 className="text-2xl font-semibold text-gold text-center mb-6">
        我的收藏 · My Collection
      </h2>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
        {cards.map((card) => (
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
