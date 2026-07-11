import { useState, useEffect, useMemo } from 'react';
import { GridItem } from './components/GridItem/GridItem';
import { GridItemSkeleton } from './components/GridItem/GridItemSkeleton';
import { InlinePreview } from './components/InlinePreview/InlinePreview';
import { Lightbox } from './components/Lightbox/Lightbox';
import { EditorialGroupHeader } from './components/EditorialGroup/EditorialGroup';
import { detectEditorialSets, assembleSmartGrid } from './utils/editorialDetection';
import type { GridItemData } from './types';
import './App.css';

const MOCK_DATA: GridItemData[] = [
  { id: 'item-1', title: "Doctor's Trap", thumbnail: 'https://via.placeholder.com/400x400/1a1a22/c9a96e?text=1', publisher: 'Zhang Linghe Vibe Atlas', url: 'https://example.com/1', tags: ['drama', 'costume', 'studio'] },
  { id: 'item-2', title: 'Four Seas Revived', thumbnail: 'https://via.placeholder.com/400x400/1a1a22/c9a96e?text=2', publisher: 'Zhang Linghe Vibe Atlas', url: 'https://example.com/2', tags: ['drama', 'wuxia', 'studio'] },
  { id: 'item-3', title: 'Detective Out of Control', thumbnail: 'https://via.placeholder.com/400x400/1a1a22/c9a96e?text=3', publisher: 'Zhang Linghe Vibe Atlas', url: 'https://example.com/3', tags: ['drama', 'modern', 'outdoor'] },
  { id: 'item-4', title: 'Jade-colored Calamity', thumbnail: 'https://via.placeholder.com/400x400/1a1a22/c9a96e?text=4', publisher: 'Zhang Linghe Vibe Atlas', url: 'https://example.com/4', tags: ['drama', 'costume', 'studio'] },
  { id: 'item-5', title: 'Moonlight Aura Farmer', thumbnail: 'https://via.placeholder.com/400x400/1a1a22/c9a96e?text=5', publisher: 'Liu Yuning Vibe Atlas', url: 'https://example.com/5', tags: ['editorial', 'nature', 'outdoor'] },
  { id: 'item-6', title: 'Beauty Mark Close-Up', thumbnail: 'https://via.placeholder.com/400x400/1a1a22/c9a96e?text=6', publisher: 'Liu Yuning Vibe Atlas', url: 'https://example.com/6', tags: ['editorial', 'portrait', 'studio'] },
  { id: 'item-7', title: 'Cold Jade Immortal', thumbnail: 'https://via.placeholder.com/400x400/1a1a22/c9a96e?text=7', publisher: 'Liu Xueyi Vibe Atlas', url: 'https://example.com/7', tags: ['drama', 'costume'] },
  { id: 'item-8', title: 'Boyfriend Lighting', thumbnail: 'https://via.placeholder.com/400x400/1a1a22/c9a96e?text=8', publisher: 'Liu Yuning Vibe Atlas', url: 'https://example.com/8', tags: ['editorial', 'portrait', 'studio'] },
  { id: 'item-9', title: 'Skyscraper Energy', thumbnail: 'https://via.placeholder.com/400x400/1a1a22/c9a96e?text=9', publisher: 'Liu Yuning Vibe Atlas', url: 'https://example.com/9', tags: ['editorial', 'urban', 'outdoor'] },
];

/** Number of columns in the grid — used to calculate preview row insertion */
const GRID_COLS = 3;

function App() {
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Detect editorial sets and assemble smart grid order
  const { items: taggedItems, sets: editorialSets } = useMemo(
    () => detectEditorialSets(MOCK_DATA),
    [],
  );
  const gridImages = useMemo(
    () => assembleSmartGrid(taggedItems, editorialSets),
    [taggedItems, editorialSets],
  );

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  const handleItemClick = (itemId: string) => {
    setExpandedId((prev) => (prev === itemId ? null : itemId));
  };

  const handleViewFull = (index: number) => {
    setExpandedId(null);
    setLightboxIndex(index);
  };

  /**
   * Render grid items with:
   * 1. Editorial group headers inserted before each set
   * 2. Inline preview rows inserted after the row containing the expanded item
   */
  const renderGridItems = () => {
    const elements: React.ReactNode[] = [];
    let lastSetId: string | undefined;

    for (let i = 0; i < gridImages.length; i++) {
      const item = gridImages[i];

      // Insert editorial group header when set changes
      if (item.editorialSetId && item.editorialSetId !== lastSetId) {
        const set = editorialSets.find((s) => s.id === item.editorialSetId);
        if (set) {
          elements.push(
            <EditorialGroupHeader key={`header-${set.id}`} set={set} />,
          );
        }
      }
      lastSetId = item.editorialSetId;

      // Grid item
      elements.push(
        <GridItem
          key={item.id}
          {...item}
          onImageClick={() => handleItemClick(item.id)}
        />,
      );

      // Insert inline preview after the end of the current row
      const isExpanded = expandedId === item.id;
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
            onClose={() => setExpandedId(null)}
            onViewFull={() => {
              const idx = gridImages.findIndex((g) => g.id === expandedInThisRow.id);
              handleViewFull(idx);
            }}
          />,
        );
      } else if (isExpanded && !isEndOfRow) {
        // The preview will be rendered at end-of-row above
      }
    }

    return elements;
  };

  return (
    <div className="app">
      <header className="text-center py-12 px-4">
        <h1 className="text-5xl md:text-6xl font-bold text-gold mb-4">
          Vibe Atlas — 氛围图鉴
        </h1>
        <p className="text-xl md:text-2xl text-gray-400 font-light tracking-wide">
          Too wrong to discard. Too iconic to ignore.
        </p>
        <div className="mt-2 text-sm text-gray-500">
          Phase 0 — Weeks 1+2 Demo
        </div>
      </header>

      <div className="grid">
        {loading
          ? Array.from({ length: 9 }).map((_, i) => <GridItemSkeleton key={i} />)
          : renderGridItems()
        }
      </div>

      <button onClick={() => setLoading(true)}>
        Replay Skeleton Loading
      </button>

      {lightboxIndex !== null && (
        <Lightbox
          images={gridImages}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}

export default App;
