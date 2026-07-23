import { useState, useEffect } from 'react';
import { dbGetAllPlanItems, dbRemoveFromPlan, type PlanRecord } from '../../utils/planDB';

export const Plan: React.FC = () => {
  const [items, setItems] = useState<PlanRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dbGetAllPlanItems()
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  async function handleRemove(imageUrl: string) {
    await dbRemoveFromPlan(imageUrl);
    setItems((prev) => prev.filter((c) => c.imageUrl !== imageUrl));
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-500">Loading plan…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-2xl mb-2">📋</p>
        <p>计划为空 · Plan is empty — use 加入计划 in the grid to queue cards.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-8">
      <h2 className="text-2xl font-semibold text-gold text-center mb-6">
        我的计划 · My Plan
      </h2>
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}
      >
        {items.map((item, idx) => (
          <div
            key={item.imageUrl}
            className="relative rounded-lg overflow-hidden shadow-md bg-white dark:bg-gray-800"
          >
            <img
              src={item.thumbnailUrl}
              alt={`${item.actor} · ${item.vibe}`}
              className="w-full aspect-square object-cover"
            />
            <div
              className="absolute top-1 left-1 text-white text-xs px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(0,0,0,0.55)', fontVariantNumeric: 'tabular-nums' }}
            >
              {idx + 1}
            </div>
            <div className="p-2 text-xs">
              <div className="font-semibold truncate">{item.vibeEmoji} {item.actor}</div>
              <div className="text-gray-500 truncate">{item.vibe}</div>
              <div className="text-gray-400">{item.capturedDate}</div>
            </div>
            <button
              onClick={() => handleRemove(item.imageUrl)}
              title="Remove from plan"
              aria-label="Remove from plan"
              className="absolute top-1 right-1 text-gold text-lg leading-none"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
