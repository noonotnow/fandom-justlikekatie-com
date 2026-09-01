import { useState, useEffect, useCallback } from 'react';
import type { GridItemData } from '../types';

export interface StarOfDayResult {
  title: string;
  thumbnail: string;
  link: string;
  source: string;
  familyId?: string;
  familyLabel?: string;
  familyEvidence?: 'persisted-event' | 'batch' | 'publisher' | 'fallback';
}

export interface RankedBatch {
  query: string;
  results: StarOfDayResult[];
  count: number;
  distinctSources: number;
  provider: string | null;
  misprint?: boolean;
  legendary?: boolean;
  intentionalMisprint?: boolean;
}

export interface StarOfDayData {
  actorId: string;
  actorName: string;
  actorShortNameEn: string;
  actorAccentColor: string;
  vibeEmoji: string;
  vibeLabel: string;
  vibeLabelEn: string;
  vibeSubtitle: string;
  vibeSubtitleEn: string;
  vibeSupportingCopy?: string;
  vibeSupportingCopyEn?: string;
  rankedBatches: RankedBatch[];
  displayResults?: StarOfDayResult[];
  date: string;
  generatedAt?: string;
  generationPrompt?: string;
  generationQuery?: string;
  ctaSeed?: string;
  editorial?: {
    mode: 'event' | 'compiled';
    compositionSize: 9 | 12;
    arrangement: 'automatic' | 'creator-arranged';
    primaryFamilyId?: string;
    primaryFamilyLabel?: string;
    evidenceBasis?: 'persisted-event' | 'batch';
  };
  stale?: boolean;
  building?: boolean;
  error?: string;
}

export interface StarOfDayArchiveEntry {
  date: string;
  actorName: string;
  actorShortNameEn?: string;
  vibeEmoji: string;
  vibeLabel: string;
  vibeLabelEn: string;
  vibeSubtitleEn?: string;
  generatedAt?: string;
}

function proxyUrl(url: string): string {
  return `/.netlify/functions/image-proxy?url=${encodeURIComponent(url)}`;
}

/** Map the star-of-day API response into GridItemData[] for the grid */
function mapToGridItems(data: StarOfDayData): GridItemData[] {
  const items: GridItemData[] = [];
  const seen = new Set<string>();

  const displayBatches = data.displayResults?.length
    ? [{ query: data.rankedBatches[0]?.query ?? 'daily-grid', results: data.displayResults }]
    : data.rankedBatches;

  for (const batch of displayBatches) {
    for (const result of batch.results) {
      if (!result.thumbnail || seen.has(result.thumbnail)) continue;
      seen.add(result.thumbnail);

      items.push({
        id: result.thumbnail,
        title: result.title || data.vibeLabelEn,
        thumbnail: proxyUrl(result.thumbnail),
        publisher: `${data.actorShortNameEn} · ${result.source}`,
        url: result.link || '#',
        tags: [data.vibeLabel, data.vibeLabelEn],
        batchKey: 'batchKey' in result && typeof result.batchKey === 'string'
          ? result.batchKey
          : batch.query,
        gridPosition: items.length,
      });
    }
  }

  // Cap at 9 for a clean 3×3 grid
  return items.slice(0, 9);
}

export interface UseStarOfDayReturn {
  items: GridItemData[];
  meta: {
    actorName: string;
    actorNameEn: string;
    vibeEmoji: string;
    vibeLabel: string;
    vibeLabelEn: string;
    vibeSubtitle: string;
    vibeSubtitleEn: string;
    vibeSupportingCopy?: string;
    vibeSupportingCopyEn?: string;
    date: string;
    stale: boolean;
  } | null;
  /** Raw API response — used by the export-card renderer */
  rawData: StarOfDayData | null;
  archive: StarOfDayArchiveEntry[];
  archiveLoading: boolean;
  archiveError: string | null;
  loadArchive: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

export const useStarOfDay = (editionDate: string | null = null): UseStarOfDayReturn => {
  const [items, setItems] = useState<GridItemData[]>([]);
  const [meta, setMeta] = useState<UseStarOfDayReturn['meta']>(null);
  const [rawData, setRawData] = useState<StarOfDayData | null>(null);
  const [archive, setArchive] = useState<StarOfDayArchiveEntry[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems([]);
    setMeta(null);
    setRawData(null);
    setLoading(true);
    setError(null);

    async function fetchStarOfDay() {
      try {
        const query = editionDate ? `?date=${encodeURIComponent(editionDate)}` : '';
        const res = await fetch(`/.netlify/functions/star-of-day${query}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        if (!res.headers.get('content-type')?.includes('application/json')) {
          throw new Error('Today’s Vibe Atlas data service is unavailable in this preview.');
        }

        const data: StarOfDayData = await res.json();

        if (cancelled) return;

        if (data.building) {
          setError('Today\'s grid is still being built — check back in a moment!');
          setLoading(false);
          return;
        }

        if (!data.rankedBatches?.length) {
          setError('No images found for today\'s vibe. Try refreshing!');
          setLoading(false);
          return;
        }

        const gridItems = mapToGridItems(data);
        setItems(gridItems);
        setRawData(data);
        setMeta({
          actorName: data.actorName,
          actorNameEn: data.actorShortNameEn,
          vibeEmoji: data.vibeEmoji,
          vibeLabel: data.vibeLabel,
          vibeLabelEn: data.vibeLabelEn,
          vibeSubtitle: data.vibeSubtitle,
          vibeSubtitleEn: data.vibeSubtitleEn,
          vibeSupportingCopy: data.vibeSupportingCopy,
          vibeSupportingCopyEn: data.vibeSupportingCopyEn,
          date: data.date,
          stale: data.stale ?? false,
        });
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
        setLoading(false);
      }
    }

    fetchStarOfDay();
    return () => { cancelled = true; };
  }, [editionDate]);

  const loadArchive = useCallback(async () => {
    setArchiveLoading(true);
    setArchiveError(null);
    try {
      const res = await fetch('/.netlify/functions/star-of-day?archive=1');
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error('The Vibe Atlas archive is unavailable in this preview.');
      }
      const data: { editions?: StarOfDayArchiveEntry[] } = await res.json();
      setArchive(Array.isArray(data.editions) ? data.editions : []);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'Failed to load the archive');
    } finally {
      setArchiveLoading(false);
    }
  }, []);

  return {
    items,
    meta,
    rawData,
    archive,
    archiveLoading,
    archiveError,
    loadArchive,
    loading,
    error,
  };
};
