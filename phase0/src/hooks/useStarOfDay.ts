import { useState, useEffect } from 'react';
import type { GridItemData } from '../types';

export interface StarOfDayResult {
  title: string;
  thumbnail: string;
  link: string;
  source: string;
}

export interface RankedBatch {
  query: string;
  results: StarOfDayResult[];
  count: number;
  distinctSources: number;
  provider: string | null;
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
  rankedBatches: RankedBatch[];
  date: string;
  stale?: boolean;
  building?: boolean;
  error?: string;
}

function proxyUrl(url: string): string {
  return `/.netlify/functions/image-proxy?url=${encodeURIComponent(url)}`;
}

/** Map the star-of-day API response into GridItemData[] for the grid */
function mapToGridItems(data: StarOfDayData): GridItemData[] {
  const items: GridItemData[] = [];
  const seen = new Set<string>();

  for (const batch of data.rankedBatches) {
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
    date: string;
    stale: boolean;
  } | null;
  /** Raw API response — used by the export-card renderer */
  rawData: StarOfDayData | null;
  loading: boolean;
  error: string | null;
}

export const useStarOfDay = (): UseStarOfDayReturn => {
  const [items, setItems] = useState<GridItemData[]>([]);
  const [meta, setMeta] = useState<UseStarOfDayReturn['meta']>(null);
  const [rawData, setRawData] = useState<StarOfDayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStarOfDay() {
      try {
        const res = await fetch('/.netlify/functions/star-of-day');
        if (!res.ok) throw new Error(`API error: ${res.status}`);

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
  }, []);

  return { items, meta, rawData, loading, error };
};
