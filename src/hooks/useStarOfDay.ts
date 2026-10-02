import { useState, useEffect, useCallback, useRef } from 'react';
import { getLocale, translate } from '../i18n/locale';
import { localizedPublicArchiveMessage } from '../i18n/publicArchiveMessages';
import type { GridItemData } from '../types';
import { publicArchiveRecord } from '../contracts/publicArchiveRecord.js';
import type { PublicArchiveRecord } from '../contracts/publicArchiveRecord.js';
import { normalizePublicArchiveEdition } from './usePublicArchiveInventory';

export interface StarOfDayResult {
  imageId?: string;
  title: string;
  thumbnail: string;
  link: string;
  source: string;
  familyId?: string;
  familyLabel?: string;
  familyEvidence?: 'persisted-event' | 'batch' | 'publisher' | 'fallback';
  archiveSource?: {
    date: string;
    publicRecord: PublicArchiveRecord;
  };
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
  vibeIdx?: number;
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
  presentation?: {
    paletteId?: string;
    atmosphereId?: string;
  };
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
  publicRecord?: PublicRecordLinks;
}

export interface PublicRecordLinks {
  actorPath: string;
  editionPath: string;
}

function projectPublicRecord<T extends { publicRecord?: unknown }>(
  value: T,
): Omit<T, 'publicRecord'> & { publicRecord?: PublicRecordLinks } {
  const { publicRecord, ...projected } = value;
  const validated = publicArchiveRecord(publicRecord);
  return {
    ...projected,
    ...(validated ? { publicRecord: validated } : {}),
  };
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
  previewThumbnails?: string[];
  legendaryMisprint?: boolean;
  legendaryMisprintTitle?: string;
  legendaryMisprintCopy?: string;
  access?: 'free' | 'member';
  publicRecord?: PublicRecordLinks;
}

export interface ArchiveGate {
  reason: 'sign_in' | 'upgrade' | 'billing_delay';
  edition: StarOfDayArchiveEntry;
}

export function shouldFallbackToLegacyArchiveEdition(status: number, body: unknown): boolean {
  return status === 404
    && Boolean(body && typeof body === 'object'
      && 'fallback' in body
      && body.fallback === 'legacy_unverified_edition');
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
        archiveDate: data.date,
        archiveImageId: result.imageId || result.thumbnail,
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
  archiveHasMore: boolean;
  archiveTotal: number | null;
  loadArchive: () => Promise<void>;
  loadMoreArchive: () => Promise<void>;
  loading: boolean;
  error: string | null;
  gate: ArchiveGate | null;
}

export const useStarOfDay = (editionDate: string | null | undefined = null): UseStarOfDayReturn => {
  const [items, setItems] = useState<GridItemData[]>([]);
  const [meta, setMeta] = useState<UseStarOfDayReturn['meta']>(null);
  const [rawData, setRawData] = useState<StarOfDayData | null>(null);
  const [archive, setArchive] = useState<StarOfDayArchiveEntry[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveNextCursor, setArchiveNextCursor] = useState<string | null>(null);
  const [archiveHasMore, setArchiveHasMore] = useState(false);
  const [archiveTotal, setArchiveTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<ArchiveGate | null>(null);
  const archiveFirstPageRequest = useRef<Promise<void> | null>(null);
  const archiveCursorRequests = useRef(new Map<string, Promise<void>>());
  const archiveRequestCount = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setItems([]);
    setMeta(null);
    setRawData(null);
    setLoading(true);
    setError(null);
    setGate(null);

    if (editionDate === undefined) {
      setLoading(false);
      return () => { cancelled = true; };
    }

    async function fetchLegacyStarOfDay(): Promise<StarOfDayData | null> {
      const query = editionDate ? `?date=${encodeURIComponent(editionDate)}` : '';
      const res = await fetch(`/.netlify/functions/star-of-day${query}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null) as {
          access?: ArchiveGate['reason'];
          edition?: StarOfDayArchiveEntry;
          error?: string;
        } | null;
        if (
          (res.status === 401 || res.status === 403 || res.status === 503)
          && body?.edition
          && ['sign_in', 'upgrade', 'billing_delay'].includes(body.access || '')
        ) {
          setGate({
            reason: body.access as ArchiveGate['reason'],
            edition: projectPublicRecord(body.edition),
          });
          setLoading(false);
          return null;
        }
        throw new Error(body?.error || `API error: ${res.status}`);
      }
      if (!res.headers.get('content-type')?.includes('application/json')) {
          throw new Error(translate('Today’s Vibe Atlas data service is unavailable in this preview.', '此预览暂时无法连接今日九宫格数据服务。'));
      }
      return projectPublicRecord(await res.json() as StarOfDayData);
    }

    async function fetchStarOfDay() {
      try {
        let data: StarOfDayData | null;
        if (!editionDate) {
          data = await fetchLegacyStarOfDay();
        } else {
          const query = new URLSearchParams({ date: editionDate });
          const response = await fetch(`/.netlify/functions/public-archive-inventory?${query.toString()}`);
          const body: unknown = await response.json().catch(() => null);
          if (shouldFallbackToLegacyArchiveEdition(response.status, body)) {
            data = await fetchLegacyStarOfDay();
          } else if (!response.ok) {
            const message = body && typeof body === 'object' && 'error' in body
              && typeof body.error === 'string'
              ? body.error
              : `The public Archive edition could not be loaded (HTTP ${response.status}).`;
            throw new Error(localizedPublicArchiveMessage(message, getLocale()));
          } else {
            if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
              throw new Error(localizedPublicArchiveMessage('The public Archive returned a response that was not JSON.', getLocale()));
            }
            try {
              data = normalizePublicArchiveEdition(body, editionDate);
            } catch (error) {
              throw new Error(localizedPublicArchiveMessage(error instanceof Error ? error.message : 'The public Archive returned an invalid edition record.', getLocale()));
            }
          }
        }

        if (cancelled || !data) return;

        if (data.building) {
          setError(translate('Today\'s grid is still being built — check back in a moment!', '今日九宫格还在整理中，请稍后再来。'));
          setLoading(false);
          return;
        }

        if (data.error === 'no_acceptable_batch') {
          setError(translate('Today’s Star of the Day is waiting for the exact editorial board to be published. Use the private approval desk to publish the rescue board for this edition.', '今日主角的九宫格尚待编辑确认发布，请稍后再来。'));
          setLoading(false);
          return;
        }

        if (!data.rankedBatches?.length) {
          setError(translate('No images found for today\'s vibe. Try refreshing!', '暂未找到今日氛围的图片，请刷新重试。'));
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
        setError(err instanceof Error ? err.message : translate('Failed to load', '加载失败'));
        setLoading(false);
      }
    }

    fetchStarOfDay();
    return () => { cancelled = true; };
  }, [editionDate]);

  const fetchArchivePage = useCallback(async (cursor: string | null, append: boolean) => {
    archiveRequestCount.current += 1;
    setArchiveLoading(true);
    setArchiveError(null);
    try {
      const query = new URLSearchParams({ archive: '1' });
      if (cursor) query.set('cursor', cursor);
      const res = await fetch(`/.netlify/functions/star-of-day?${query}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error(translate('The Vibe Atlas archive is unavailable in this preview.', '此预览暂时无法连接往期档案。'));
      }
      const data: {
        editions?: StarOfDayArchiveEntry[];
        page?: { nextCursor?: string | null; hasMore?: boolean; total?: number };
      } = await res.json();
      const editions = Array.isArray(data.editions)
        ? data.editions.map(projectPublicRecord)
        : [];
      setArchive(current => append
        ? [...current, ...editions.filter(edition =>
          !current.some(existing => existing.date === edition.date))]
        : editions);
      setArchiveNextCursor(data.page?.nextCursor || null);
      setArchiveHasMore(data.page?.hasMore === true);
      setArchiveTotal(Number.isInteger(data.page?.total) ? data.page!.total! : null);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : translate('Failed to load the archive', '往期档案加载失败'));
    } finally {
      archiveRequestCount.current -= 1;
      setArchiveLoading(archiveRequestCount.current > 0);
    }
  }, []);

  const loadArchive = useCallback(async () => {
    if (archiveFirstPageRequest.current) {
      return archiveFirstPageRequest.current;
    }

    const request = fetchArchivePage(null, false);
    archiveFirstPageRequest.current = request;
    try {
      await request;
    } finally {
      if (archiveFirstPageRequest.current === request) {
        archiveFirstPageRequest.current = null;
      }
    }
  }, [fetchArchivePage]);

  const loadMoreArchive = useCallback(async () => {
    if (!archiveNextCursor) return;

    const cursor = archiveNextCursor;
    const inFlightRequest = archiveCursorRequests.current.get(cursor);
    if (inFlightRequest) {
      return inFlightRequest;
    }

    const request = fetchArchivePage(cursor, true);
    archiveCursorRequests.current.set(cursor, request);
    try {
      await request;
    } finally {
      if (archiveCursorRequests.current.get(cursor) === request) {
        archiveCursorRequests.current.delete(cursor);
      }
    }
  }, [archiveNextCursor, fetchArchivePage]);

  return {
    items,
    meta,
    rawData,
    archive,
    archiveLoading,
    archiveError,
    archiveHasMore,
    archiveTotal,
    loadArchive,
    loadMoreArchive,
    loading,
    error,
    gate,
  };
};
