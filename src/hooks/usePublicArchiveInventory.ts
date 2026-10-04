import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assertPublicArchiveRecord,
  type PublicArchiveRecord,
} from '../contracts/publicArchiveRecord.js';
import { isValidVibeAtlasEditionDate } from '../utils/fandomRoutes';
import type { StarOfDayData } from './useStarOfDay';
import {
  trackArchiveActorDirectoryOutcome,
  type ArchiveDiscoveryFailure,
  type ArchiveInventoryOutcome,
} from '../utils/analytics';

export interface PublicArchiveActor {
  id: string;
  name: string;
}

export interface PublicArchiveDirectoryFreshness {
  verifiedAt: string;
  expiresAt: string;
  freshness: 'verified' | 'refreshing' | 'partial';
  verifiedCandidates: number;
  totalCandidates: number;
}
interface PublicArchivePage {
  nextCursor: string | null;
  hasMore: boolean;
}

interface UsePublicArchiveInventoryOptions {
  /** When supplied, fetch the one publicly verified edition instead of a page. */
  date?: string;
  enabled?: boolean;
  actorId?: string;
  onInventoryOutcome?: (outcome: ArchiveInventoryOutcome) => void;
}

interface InventoryResponse {
  editions: StarOfDayData[];
  page: PublicArchivePage;
  actors: PublicArchiveActor[];
  notices: string[];
  partial: boolean;
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
  directoryActors: PublicArchiveActor[];
  directoryLoading: boolean;
  directoryComplete: boolean;
  directoryError: string | null;
  directoryNotices: string[];
  directoryFreshness: PublicArchiveDirectoryFreshness | null;
  retryDirectory: () => void;
  retryInventory: () => void;
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
    partial: publicArchiveInventoryNotices({
      ...value,
      actorInventory: undefined,
    }).length > 0,
  };
}

class ArchiveRequestError extends Error {
  readonly category: ArchiveDiscoveryFailure;
  constructor(message: string, category: ArchiveDiscoveryFailure) {
    super(message);
    this.category = category;
  }
}

function archiveFailure(caught: unknown): ArchiveDiscoveryFailure {
  return caught instanceof ArchiveRequestError ? caught.category
    : caught instanceof TypeError ? 'transport' : 'invalid_response';
}

async function requestPublicArchive(path: string): Promise<unknown> {
  const response = await fetch(`/.netlify/functions/public-archive-inventory${path}`);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === 'string' ? body.error : null;
    throw new ArchiveRequestError(message || `The public Archive could not be loaded (HTTP ${response.status}).`, 'http');
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('The public Archive returned a response that was not JSON.');
  }
  return body;
}

export function usePublicArchiveInventory({
  date,
  enabled = true,
  actorId,
  onInventoryOutcome,
}: UsePublicArchiveInventoryOptions = {}): UsePublicArchiveInventoryReturn {
  const outcomeCallback = useRef(onInventoryOutcome);
  outcomeCallback.current = onInventoryOutcome;
  // An optional observer must never turn a verified response into a UI error.
  const reportOutcome = (outcome: ArchiveInventoryOutcome) => {
    try { outcomeCallback.current?.(outcome); } catch { /* Optional measurement. */ }
  };
  const [editions, setEditions] = useState<StarOfDayData[]>([]);
  const [actors, setActors] = useState<PublicArchiveActor[]>([]);
  const [page, setPage] = useState<PublicArchivePage>({ nextCursor: null, hasMore: false });
  const [loading, setLoading] = useState(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const pageRequest = useRef<Promise<void> | null>(null);
  const generation = useRef(0);
  const [inventoryAttempt, setInventoryAttempt] = useState(0);
  const retryInventory = useCallback(() => setInventoryAttempt(value => value + 1), []);
  const [directoryActors, setDirectoryActors] = useState<PublicArchiveActor[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryComplete, setDirectoryComplete] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [directoryNotices, setDirectoryNotices] = useState<string[]>([]);
  const [directoryFreshness, setDirectoryFreshness] = useState<PublicArchiveDirectoryFreshness | null>(null);
  const [directoryAttempt, setDirectoryAttempt] = useState(0);
  const retryDirectory = useCallback(() => setDirectoryAttempt(value => value + 1), []);

  // Directory discovery is independent of edition pages and actor selection.
  // Shared snapshots and bounded re-verification return names only.
  useEffect(() => {
    let cancelled = false;
    // Keep verified choices usable during a retry; replace them on the first
    // successful response rather than blanking the selector while waiting.
    if (!enabled || date) setDirectoryActors([]);
    setDirectoryComplete(false);
    setDirectoryError(null);
    setDirectoryNotices([]);
    setDirectoryFreshness(null);
    setDirectoryLoading(enabled && !date);
    if (!enabled || date) return;
    void (async () => {
      const byId = new Map<string, PublicArchiveActor>();
      const notices = new Set<string>();
      let cursor: string | null = null;
      let allVerified = true;
      let directoryGeneration: string | null = null;
      try {
        do {
          const query = new URLSearchParams({ directory: 'actors' });
          if (cursor) query.set('cursor', cursor);
          const body = await requestPublicArchive(`?${query}`);
          if (cancelled) return;
          if (!isRecord(body) || !isRecord(body.actorInventory)
            || body.actorInventory.scope !== 'verified-directory'
            || typeof body.actorInventory.complete !== 'boolean') {
            throw new Error('The public Archive returned an invalid actor directory.');
          }
          const nextPage = parsePage(body.page);
          const inventory = body.actorInventory;
          const nextGeneration = typeof inventory.generation === 'string' ? inventory.generation : null;
          const restarted = inventory.restart === true
            || (nextGeneration !== null && directoryGeneration !== null && nextGeneration !== directoryGeneration);
          if (restarted) {
            byId.clear();
            notices.clear();
            allVerified = true;
            cursor = null;
          }
          directoryGeneration = nextGeneration;
          if (typeof inventory.verifiedAt === 'string'
            && Number.isFinite(Date.parse(inventory.verifiedAt))
            && typeof inventory.expiresAt === 'string'
            && Number.isFinite(Date.parse(inventory.expiresAt))
            && ['verified', 'refreshing', 'partial'].includes(String(inventory.freshness))
            && typeof inventory.verifiedCandidates === 'number'
            && typeof inventory.totalCandidates === 'number') {
            setDirectoryFreshness({
              verifiedAt: inventory.verifiedAt,
              expiresAt: inventory.expiresAt,
              freshness: inventory.freshness as PublicArchiveDirectoryFreshness['freshness'],
              verifiedCandidates: inventory.verifiedCandidates,
              totalCandidates: inventory.totalCandidates,
            });
          }
          // A continuing scan is not an omission; other verification failures are.
          const pageInfo = isRecord(body.page) ? body.page : {};
          if (pageInfo.unavailable === true || Number(pageInfo.unavailableCount) > 0
            || publicArchiveInventoryNotices({ partialFailures: body.partialFailures }).length > 0
            || publicArchiveInventoryNotices({ partialFailures: pageInfo.partialFailures }).length > 0
            || (!nextPage.hasMore && body.actorInventory.complete !== true)) {
            allVerified = false;
            notices.add('The actor directory is partial; some public actors could not be verified.');
          }
          for (const actor of normalizeActors(body.actors)) byId.set(actor.id, actor);
          setDirectoryActors([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)));
          setDirectoryNotices([...notices]);
          if (pageInfo.unavailable === true) {
            throw new ArchiveRequestError('The actor directory could not finish loading. Retry to verify missing actors.', 'unavailable');
          }
          if (nextPage.hasMore && (!isValidVibeAtlasEditionDate(nextPage.nextCursor!)
            || (cursor && nextPage.nextCursor! >= cursor))) {
            throw new Error('The public Archive returned invalid pagination details.');
          }
          cursor = nextPage.hasMore ? nextPage.nextCursor : null;
        } while (cursor && !cancelled);
        if (!cancelled) {
          setDirectoryComplete(allVerified);
          trackArchiveActorDirectoryOutcome(
            !allVerified ? 'partial' : byId.size ? 'verified' : 'verified_empty',
            byId.size,
          );
        }
      } catch (caught) {
        if (!cancelled) {
          setDirectoryError(caught instanceof Error
            ? caught.message : 'The actor directory could not be loaded.');
          trackArchiveActorDirectoryOutcome('failed', byId.size, archiveFailure(caught));
        }
      } finally {
        if (!cancelled) setDirectoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date, enabled, directoryAttempt]);

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

        const query = new URLSearchParams();
        if (actorId) query.set('actorId', actorId);
        const response = normalizePageResponse(await requestPublicArchive(`?${query}`));
        if (actorId && response.editions.some(edition => edition.actorId !== actorId)) {
          throw new Error('The public Archive returned editions for a different actor.');
        }
        if (!cancelled) {
          setEditions(response.editions);
          setActors(response.actors);
          setPage(response.page);
          setNotices(response.notices);
          if (actorId) reportOutcome({
            actorId, phase: 'initial',
            result: response.partial ? 'partial' : response.editions.length ? 'verified' : 'verified_empty',
            editionCount: response.editions.length, hasMore: response.page.hasMore,
          });
        }
      } catch (caught) {
        if (!cancelled && generation.current === requestGeneration) {
          setError(caught instanceof Error ? caught.message : 'The public Archive inventory could not be loaded.');
          if (actorId && !date) reportOutcome({
            actorId, phase: 'initial', result: 'failed', failure: archiveFailure(caught),
            editionCount: 0, hasMore: false,
          });
        }
      } finally {
        if (!cancelled && generation.current === requestGeneration) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (generation.current === requestGeneration) generation.current += 1;
    };
  }, [date, enabled, actorId, inventoryAttempt]);

  const loadMore = useCallback(async () => {
    if (!enabled || date || !page.hasMore || !page.nextCursor || pageRequest.current) return;
    const cursor = page.nextCursor;
    const requestGeneration = generation.current;
    const query = new URLSearchParams({ cursor });
    if (actorId) query.set('actorId', actorId);
    const request = (async () => {
      setLoadingMore(true);
      setError(null);
      try {
        const response = normalizePageResponse(await requestPublicArchive(`?${query.toString()}`));
        if (actorId && response.editions.some(edition => edition.actorId !== actorId)) {
          throw new Error('The public Archive returned editions for a different actor.');
        }
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
        if (actorId) reportOutcome({
          actorId, phase: 'more',
          result: response.partial ? 'partial' : response.editions.length ? 'verified' : 'verified_empty',
          editionCount: response.editions.length, hasMore: response.page.hasMore,
        });
      } catch (caught) {
        if (generation.current !== requestGeneration) return;
        setError(caught instanceof Error
          ? caught.message
          : 'The next public Archive page could not be loaded.');
        if (actorId) reportOutcome({
          actorId, phase: 'more', result: 'failed', failure: archiveFailure(caught),
          editionCount: 0, hasMore: page.hasMore,
        });
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
  }, [date, enabled, actorId, page.hasMore, page.nextCursor]);

  return {
    editions,
    actors,
    loading,
    loadingMore,
    error,
    hasMore: page.hasMore,
    notices,
    loadMore,
    directoryActors,
    directoryLoading,
    directoryComplete,
    directoryError,
    directoryNotices,
    directoryFreshness,
    retryDirectory,
    retryInventory,
  };
}
