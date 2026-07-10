import { useState, useEffect } from 'react';
import { GridItem } from './components/GridItem/GridItem';
import { GridItemSkeleton } from './components/GridItem/GridItemSkeleton';
import './App.css';

const MOCK_DATA = [
  { id: 'item-1', title: "Doctor's Trap", thumbnail: 'https://via.placeholder.com/400x400/1a1a22/c9a96e?text=1', publisher: 'Zhang Linghe Vibe Atlas', url: 'https://example.com/1' },
  { id: 'item-2', title: 'Four Seas Revived', thumbnail: 'https://via.placeholder.com/400x400/1a1a22/c9a96e?text=2', publisher: 'Zhang Linghe Vibe Atlas', url: 'https://example.com/2' },
  { id: 'item-3', title: 'Detective Out of Control', thumbnail: 'https://via.placeholder.com/400x400/1a1a22/c9a96e?text=3', publisher: 'Zhang Linghe Vibe Atlas', url: 'https://example.com/3' },
  { id: 'item-4', title: 'Jade-colored Calamity', thumbnail: 'https://via.placeholder.com/400x400/1a1a22/c9a96e?text=4', publisher: 'Zhang Linghe Vibe Atlas', url: 'https://example.com/4' },
  { id: 'item-5', title: 'Moonlight Aura Farmer', thumbnail: 'https://via.placeholder.com/400x400/1a1a22/c9a96e?text=5', publisher: 'Liu Yuning Vibe Atlas', url: 'https://example.com/5' },
  { id: 'item-6', title: 'Beauty Mark Close-Up', thumbnail: 'https://via.placeholder.com/400x400/1a1a22/c9a96e?text=6', publisher: 'Liu Yuning Vibe Atlas', url: 'https://example.com/6' },
  { id: 'item-7', title: 'Cold Jade Immortal', thumbnail: 'https://via.placeholder.com/400x400/1a1a22/c9a96e?text=7', publisher: 'Liu Xueyi Vibe Atlas', url: 'https://example.com/7' },
  { id: 'item-8', title: 'Boyfriend Lighting', thumbnail: 'https://via.placeholder.com/400x400/1a1a22/c9a96e?text=8', publisher: 'Liu Yuning Vibe Atlas', url: 'https://example.com/8' },
  { id: 'item-9', title: 'Skyscraper Energy', thumbnail: 'https://via.placeholder.com/400x400/1a1a22/c9a96e?text=9', publisher: 'Liu Yuning Vibe Atlas', url: 'https://example.com/9' },
];

function App() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="app">
      <h1>Vibe Atlas Phase 0 — Week 1 Components</h1>
      <p className="description">
        Components 2 & 3: Skeleton Loader + Save/Bookmark. Click bookmark icons to save. Refresh to verify persistence.
      </p>

      <div className="grid">
        {loading
          ? Array.from({ length: 9 }).map((_, i) => <GridItemSkeleton key={i} />)
          : MOCK_DATA.map((item) => <GridItem key={item.id} {...item} />)
        }
      </div>

      <button onClick={() => setLoading(true)}>
        Replay Skeleton Loading
      </button>
    </div>
  );
}

export default App;
