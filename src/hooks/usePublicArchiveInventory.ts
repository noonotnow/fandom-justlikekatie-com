import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assertPublicArchiveRecord,
  type PublicArchiveRecord,
} from '../contracts/publicArchiveRecord.js';
import { isValidVibeAtlasEditionDate } from '../utils/fandomRoutes';
import type { StarOfDayData } from './useStarOfDay';

export interface PublicArchiveActor {
  id: string;
  name: string;
}

interface PublicArchivePage {
  nextCursor: string | null;
  hasMore: boolean;
}

interface UsePublicArchiveInventoryOptions {
  /** When supplied, fetch the one publicly verified edition instead of a page. */
  date?: string;
  enabled?: boolean;
}

interface InventoryResponse {
  editions: StarOfDayData[];
  page: PublicArchivePage;
  actors: PublicArchiveActor[];
  notices: string[];
}

export interface UsePublicArchiveInventoryReturn {
  editions: StarOfDayData[];
  actors: PublicArchiveActor[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  notices: string[];
  loadMore: () => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function normalizePublicArchiveEdition(
  value: unknown,
  expectedDate?: string,
): StarOfDayData {
  if (!isRecord(value)
    || typeof value.date !== 'string'
    || !isValidVibeAtlasEditionDate(value.date)
    || (expectedDate && value.date !== expectedDate)
    || typeof value.actorId !== 'string'
    || typeof value.actorName !== 'string'
    || typeof value.actorShortNameEn !== 'string'
    || typeof value.actorAccentColor !== 'string'
    || typeof value.vibeEmoji !== 'string'
    || typeof value.vibeLabel !== 'string'
    || typeof value.vibeLabelEn !== 'string'
    || typeof value.vibeSubtitle !== 'string'
    || typeof value.vibeSubtitleEn !== 'string'
    || !Array.isArray(value.rankedBatches)) {
    throw new Error('The public Archive returned an invalid edition record.');
  }

  const editionDate = value.date;
  let publicRecord: PublicArchiveRecord;
  try {
    publicRecord = assertPublicArchiveRecord(value.publicRecord, { expectedDate: editionDate });
  } catch {
    throw new Error(`The public Archive edition for ${editionDate} is missing a verified edition link.`);
  }

  const normalizeResults = (results: unknown[], date: string) => results.map(result => {
    if (!isRecord(result) || typeof result.thumbnail !== 'string' || !result.thumbnail) {
      throw new Error(`The public Archive edition for ${date} has an invalid image reference.`);
    }
    return {
      ...result,
      archiveSource: { date, publicRecord },
    };
  });
  const rankedBatches = value.rankedBatches.map(batch => {
    if (!isRecord(batch) || !Array.isArray(batch.results)) {
      throw new Error(`The public Archive edition for ${editionDate} has invalid image inventory.`);
    }
    return { ...batch, results: normalizeResults(batch.results, editionDate) };
  });
  const displayResults = value.displayResults === undefined
    ? undefined
    : Array.isArray(value.displayResults)
      ? normalizeResults(value.displayResults, editionDate)
      : (() => { throw new Error(`The public Archive edition for ${editionDate} has invalid display images.`); })();

  return {
    ...(value as unknown as StarOfDayData),
    rankedBatches: rankedBatches as unknown as StarOfDayData['rankedBatches'],
    ...(displayResults ? { displayResults: displayResults as unknown as StarOfDayData['displayResults'] } : {}),
    publicRecord,
  };
}

function normalizeActors(value: unknown): PublicArchiveActor[] {
  if (!Array.isArray(value)) {
    throw new Error('The public Archive did not return its actor inventory.');
  }
  return value.map(actor => {
    if (!isRecord(actor) || typeof actor.id !== 'string' || typeof actor.name !== 'string') {
      throw new Error('The public Archive returned an invalid actor inventory.');
    }
    return { id: actor.id, name: actor.name };
  });
}

function parsePage(value: unknown): PublicArchivePage {
  if (!isRecord(value)
    || typeof value.hasMore !== 'boolean'
    || (value.nextCursor !== null && typeof value.nextCursor !== 'string')
    || (value.hasMore && !value.nextCursor)) {
    throw new Error('The public Archive returned invalid pagination details.');
  }
  return {
    nextCursor: value.nextCursor,
    hasMore: value.hasMore,
  };
}

export function publicArchiveInventoryNotices(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const page = isRecord(value.page) ? value.page : {};
  const partialFailures = [value.partialFailures, page.partialFailures]
    .filter(failures => Array.isArray(failures)
      ? failures.length > 0
      : isRecord(failures)
        ? Object.keys(failures).length > 0
        : typeof failures === 'number' && failures > 0);
  const unavailableCount = typeof page.unavailableCount === 'number'
    && Number.isFinite(page.unavailableCount)
    ? Math.max(0, page.unavailableCount)
    : 0;
  const partial = page.partial === true
    || page.status === 'partial'
    || unavailableCount > 0
    || page.scanLimitReached === true
    || page.unavailable === true
    || partialFailures.length > 0;
  const notices: string[] = [];

  if (partial) {
    const failureCount = partialFailures.reduce<number>((total, failures: unknown) => total + (
      Array.isArray(failures)
        ? failures.length
        : isRecord(failures)
          ? (typeof failures.count === 'number' && failures.count > 0 ? failures.count : 1)
          : typeof failures === 'number' ? failures : 0
    ), 0);
    const omittedCount: number = unavailableCount || failureCount;
    notices.push(omittedCount === 1
      ? '1 Archive edition was omitted because its public record could not be verified.'
      : omittedCount > 1
        ? `${omittedCount} Archive editions were omitted because their public records could not be verified.`
        : 'Some Archive editions were omitted because their public records could not be verified.');
  }
  if (page.unavailable === true) {
    notices.push('Archive storage was temporarily unavailable during verification; additional editions may be missing.');
  }
  if (page.scanLimitReached === true) {
    notices.push('The safe Archive scan limit was reached; additional editions may be available on later pages.');
  }
  if (isRecord(value.actorInventory) && value.actorInventory.complete === false) {
    notices.push('The star count covers loaded editions only, not the complete Archive.');
  }
  return [...new Set(notices)];
}

function normalizePageResponse(value: unknown): InventoryResponse {
  if (!isRecord(value) || !Array.isArray(value.editions)) {
    throw new Error('The public Archive returned an invalid inventory page.');
  }
  return {
    editions: value.editions.map(edition => normalizePublicArchiveEdition(edition)),
    page: parsePage(value.page),
    actors: normalizeActors(value.actors),
    notices: publicArchiveInventoryNotices(value),
  };
}

async function requestPublicArchive(path: string): Promise<unknown> {
  const response = await fetch(`/.netlify/functions/public-archive-inventory${path}`);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === 'string' ? body.error : null;
    throw new Error(message || `The public Archive could not be loaded (HTTP ${response.status}).`);
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('The public Archive returned a response that was not JSON.');
  }
  return body;
}

export function usePublicArchiveInventory({
  date,
  enabled = true,
}: UsePublicArchiveInventoryOptions = {}): UsePublicArchiveInventoryReturn {
  const [editions, setEditions] = useState<StarOfDayData[]>([]);
  const [actors, setActors] = useState<PublicArchiveActor[]>([]);
  const [page, setPage] = useState<PublicArchivePage>({ nextCursor: null, hasMore: false });
  const [loading, setLoading] = useState(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const pageRequest = useRef<Promise<void> | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const requestGeneration = ++generation.current;
    setEditions([]);
    setActors([]);
    setPage({ nextCursor: null, hasMore: false });
    setError(null);
    setNotices([]);
    setLoading(enabled);
    setLoadingMore(false);
    pageRequest.current = null;
    if (!enabled) return () => { cancelled = true; };

    const load = async () => {
      try {
        if (date) {
          if (!isValidVibeAtlasEditionDate(date)) {
            throw new Error('Choose a valid public Archive edition date.');
          }
          const query = new URLSearchParams({ date });
          const body = await requestPublicArchive(`?${query.toString()}`);
          const editionValue = isRecord(body) && Array.isArray(body.editions)
            ? body.editions[0]
            : isRecord(body) && 'edition' in body
              ? body.edition
              : body;
          if (!editionValue) throw new Error(`No public Archive edition exists for ${date}.`);
          const edition = normalizePublicArchiveEdition(editionValue, date);
          if (!cancelled) setEditions([edition]);
          return;
        }

        const response = normalizePageResponse(await requestPublicArchive(''));
        if (!cancelled) {
          setEditions(response.editions);
          setActors(response.actors);
          setPage(response.page);
          setNotices(response.notices);
        }
      } catch (caught) {
        if (!cancelled && generation.current === requestGeneration) setError(caught instanceof Error
          ? caught.message
          : 'The public Archive inventory could not be loaded.');
      } finally {
        if (!cancelled && generation.current === requestGeneration) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (generation.current === requestGeneration) generation.current += 1;
    };
  }, [date, enabled]);

  const loadMore = useCallback(async () => {
    if (!enabled || date || !page.hasMore || !page.nextCursor || pageRequest.current) return;
    const cursor = page.nextCursor;
    const requestGeneration = generation.current;
    const query = new URLSearchParams({ cursor });
    const request = (async () => {
      setLoadingMore(true);
      setError(null);
      try {
        const response = normalizePageResponse(await requestPublicArchive(`?${query.toString()}`));
        if (generation.current !== requestGeneration) return;
        setEditions(current => {
          const existingDates = new Set(current.map(edition => edition.date));
          return [
            ...current,
            ...response.editions.filter(edition => !existingDates.has(edition.date)),
          ];
        });
        setActors(current => {
          const byId = new Map(current.map(actor => [actor.id, actor]));
          for (const actor of response.actors) byId.set(actor.id, actor);
          return [...byId.values()];
        });
        setPage(response.page);
        setNotices(current => [...new Set([...current, ...response.notices])]);
      } catch (caught) {
        if (generation.current !== requestGeneration) return;
        setError(caught instanceof Error
          ? caught.message
          : 'The next public Archive page could not be loaded.');
      } finally {
        if (generation.current === requestGeneration) setLoadingMore(false);
      }
    })();
    pageRequest.current = request;
    try {
      await request;
    } finally {
      if (pageRequest.current === request) pageRequest.current = null;
    }
  }, [date, enabled, page.hasMore, page.nextCursor]);

  return {
    editions,
    actors,
    loading,
    loadingMore,
    error,
    hasMore: page.hasMore,
    notices,
    loadMore,
  };
}