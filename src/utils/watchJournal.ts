export type PredictionVerdict =
  | 'vindicated'
  | 'technically-correct'
  | 'catastrophically-wrong'
  | 'right-conclusion-deranged-reasoning'
  | 'drama-committed-a-crime';

export interface JournalFields {
  emotionalCondition: string;
  trustedPeople: string[];
  distrustedPeople: string[];
  relationshipMonitored: string;
  recurringSuspects: string[];
  currentTheory: string;
}

export interface WatchJournalEntry {
  schemaVersion: 1;
  id: string;
  seriesId: 'the-untamed';
  seriesTitle: 'The Untamed';
  episodeStart: number;
  episodeEnd: number;
  watchedThroughEpisode: number;
  recordedAt: string;
  fields: JournalFields;
}

export interface PredictionResolution {
  resolutionEpisode: number;
  verdict: PredictionVerdict;
  postRevealReaction: string;
  resolvedAt: string;
}

export interface WatchJournalPrediction {
  schemaVersion: 1;
  id: string;
  entryId: string;
  originalText: string;
  filedAfterEpisode: number;
  filedAt: string;
  resolution: PredictionResolution | null;
}

export interface SealedEvidence {
  schemaVersion: 1;
  id: string;
  entryId: string | null;
  predictionId: string | null;
  unlockEpisode: number;
  interpretation: string;
  submittedAt: string;
}

export interface WatchJournal {
  schemaVersion: 1;
  series: { id: 'the-untamed'; title: 'The Untamed' };
  entries: WatchJournalEntry[];
  predictions: WatchJournalPrediction[];
  evidence: SealedEvidence[];
}

export class WatchJournalError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const ENDPOINT = '/.netlify/functions/watch-journal';

export async function fetchWatchJournal(
  audience: 'admin' | 'reader' = 'admin',
  safeThroughEpisode?: number,
): Promise<{ journal: WatchJournal; safeThroughEpisode?: number }> {
  const params = new URLSearchParams({ audience });
  if (audience === 'reader' && safeThroughEpisode !== undefined) {
    params.set('safeThroughEpisode', String(safeThroughEpisode));
  }
  return parseResponse(await fetch(`${ENDPOINT}?${params}`, { credentials: 'same-origin' }));
}

export async function fileWatchJournalEntry(input: {
  episodeStart: number;
  episodeEnd: number;
  emotionalCondition: string;
  trustedPeople: string[];
  distrustedPeople: string[];
  relationshipMonitored: string;
  recurringSuspects: string[];
  currentTheory: string;
  predictions: string[];
}): Promise<WatchJournal> {
  const result = await post({ action: 'file-entry', ...input });
  return result.journal;
}

export async function resolveWatchJournalPrediction(input: {
  predictionId: string;
  resolutionEpisode: number;
  verdict: PredictionVerdict;
  postRevealReaction: string;
}): Promise<WatchJournal> {
  const result = await post({ action: 'resolve-prediction', ...input });
  return result.journal;
}

export async function addWatchJournalEvidence(input: {
  entryId?: string;
  predictionId?: string;
  unlockEpisode: number;
  interpretation: string;
}): Promise<WatchJournal> {
  const result = await post({ action: 'add-evidence', ...input });
  return result.journal;
}

export async function publishWatchJournal(input: {
  approvedThroughEpisode: number;
}): Promise<{ journal: WatchJournal; publishedThroughEpisode: number }> {
  return post({ action: 'publish', ...input }) as Promise<{
    journal: WatchJournal;
    publishedThroughEpisode: number;
  }>;
}

async function post(input: Record<string, unknown>): Promise<{ journal: WatchJournal }> {
  return parseResponse(await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }));
}

async function parseResponse(response: Response): Promise<{ journal: WatchJournal; safeThroughEpisode?: number }> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : 'The watch journal could not be reached.';
    throw new WatchJournalError(message, response.status);
  }
  if (!body || typeof body !== 'object' || !('journal' in body)) {
    throw new WatchJournalError('The watch journal response was invalid.', 500);
  }
  return body as { journal: WatchJournal; safeThroughEpisode?: number };
}