import { useState, useEffect } from 'react';
import { GridItem } from './components/GridItem/GridItem';
import { GridItemSkeleton } from './components/GridItem/GridItemSkeleton';
import { InlinePreview } from './components/InlinePreview/InlinePreview';
import { Lightbox } from './components/Lightbox/Lightbox';
import { ThemeToggle } from './components/ThemeToggle/ThemeToggle';
import { ExportButton } from './components/ExportButton/ExportButton';
import { SendToPlanButton } from './components/SendToPlanButton/SendToPlanButton';
import { Collection } from './components/Collection/Collection';
import { migrateBookmarks } from './utils/migrateBookmarks';
import { useDarkMode } from './hooks/useDarkMode';
import { useStarOfDay } from './hooks/useStarOfDay';
import './App.css';

/** Number of columns in the grid — used to calculate preview row insertion */
const GRID_COLS = 3;

function App() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [view, setView] = useState<'daily' | 'collection'>('daily');
  const { isDark, toggle: toggleDarkMode } = useDarkMode();
  const { items: gridImages, meta, rawData, loading, error } = useStarOfDay();

  useEffect(() => { migrateBookmarks(); }, []);

  const handleItemClick = (itemId: string) => {
    setExpandedId((prev) => (prev === itemId ? null : itemId));
  };

  const handleViewFull = (index: number) => {
    setExpandedId(null);
    setLightboxIndex(index);
  };

  /**
   * Render grid items with inline preview rows inserted after the row
   * containing the expanded item.
   */
  const renderGridItems = () => {
    const elements: React.ReactNode[] = [];

    for (let i = 0; i < gridImages.length; i++) {
      const item = gridImages[i];

      // Grid item
      elements.push(
        <GridItem
          key={item.id}
          {...item}
          onImageClick={() => handleItemClick(item.id)}
        />,
      );

      // Insert inline preview after the end of the current row
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
      }
    }

    return elements;
  };

  return (
    <div className="app">
      <ThemeToggle isDark={isDark} onToggle={toggleDarkMode} />

      {/* Navigation bar */}
      <nav className="flex justify-center gap-6 pt-4 pb-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setView('daily')}
          className={`pb-2 text-sm tracking-wide transition-colors ${
            view === 'daily'
              ? 'border-b-2 border-gold text-gold font-semibold'
              : 'text-gray-500'
          }`}
        >
          今日之星 · Daily
        </button>
        <button
          onClick={() => setView('collection')}
          className={`pb-2 text-sm tracking-wide transition-colors ${
            view === 'collection'
              ? 'border-b-2 border-gold text-gold font-semibold'
              : 'text-gray-500'
          }`}
        >
          我的收藏 · Collection
        </button>
      </nav>

      {view === 'daily' ? (
        <>
      <header className="text-center py-12 px-4">
        <h1 className="text-5xl md:text-6xl font-bold text-gold mb-4">
          Vibe Atlas — 氛围图鉴
        </h1>
        <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-400 font-light tracking-wide">
          Too wrong to discard. Too iconic to ignore.
        </p>
        {meta && (
          <div className="mt-4">
            <div className="text-2xl font-semibold text-gold-text">
              {meta.vibeEmoji} {meta.actorName} · {meta.vibeLabel}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {meta.vibeLabelEn} — {meta.vibeSubtitleEn}
            </div>
            {meta.stale && (
              <div className="text-xs text-amber-500 mt-1">
                ⏳ Showing yesterday's picks while today's grid builds
              </div>
            )}
            {rawData && (
            <div className="mt-4" style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
  <ExportButton rawData={rawData} />
  <SendToPlanButton rawData={rawData} />
</div>
            )}
          </div>
        )}
      </header>

      <div className="grid">
        {loading
          ? Array.from({ length: 9 }).map((_, i) => <GridItemSkeleton key={i} />)
          : error
            ? <div className="col-span-3 text-center py-8 text-gray-500">{error}</div>
            : renderGridItems()
        }
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          images={gridImages}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          cardMetadata={meta ? {
            actorName: meta.actorName,
            vibeEmoji: meta.vibeEmoji,
            vibeLabel: meta.vibeLabel,
            vibeLabelEn: meta.vibeLabelEn,
            date: meta.date,
          } : undefined}
        />
      )}
        </>
      ) : (
        <Collection />
      )}
    </div>
  );
}

export default App;
