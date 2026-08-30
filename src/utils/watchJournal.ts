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
  sourceSubmissionId?: string;
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

export type VeteranSubmissionStatus = 'pending' | 'approved' | 'rejected';
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

export async function fetchVeteranSubmissionTargets(publicJournalId: string): Promise<{
  series: WatchJournal['series'];
  targets: {
    entries: VeteranSubmissionTarget[];
    predictions: VeteranSubmissionTarget[];
  };
}> {
  const params = new URLSearchParams({ audience: 'targets', journal: publicJournalId });
  const response = await fetch(`${ENDPOINT}?${params}`, { credentials: 'same-origin' });
  return parseSubmissionResponse<{
    series: WatchJournal['series'];
    targets: {
      entries: VeteranSubmissionTarget[];
      predictions: VeteranSubmissionTarget[];
    };
  }>(response);
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

async function parseSubmissionResponse<T extends object>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : 'The veteran submission service could not be reached.';
    throw new WatchJournalError(message, response.status);
  }
  if (!body || typeof body !== 'object') {
    throw new WatchJournalError('The veteran submission response was invalid.', 500);
  }
  return body as T;
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

export async function fetchMyVeteranSubmissions(publicJournalId: string): Promise<VeteranSubmission[]> {
  const params = new URLSearchParams({ audience: 'submissions', journal: publicJournalId });
  const response = await fetch(`${ENDPOINT}?${params}`, { credentials: 'same-origin' });
  const body = await parseSubmissionResponse<{ submissions: VeteranSubmission[] }>(response);
  return body.submissions;
}

export async function fetchVeteranModeration(): Promise<{
  journal: WatchJournal;
  watchBoundary: number;
  submissions: VeteranSubmission[];
}> {
  const response = await fetch(`${ENDPOINT}?audience=moderation`, { credentials: 'same-origin' });
  return parseSubmissionResponse<{
    journal: WatchJournal;
    watchBoundary: number;
    submissions: VeteranSubmission[];
  }>(response);
}

export interface VeteranSubmission {
  id: string;
  entryId: string | null;
  predictionId: string | null;
  unlockEpisode: number;
  interpretation: string;
  submittedAt: string;
  status: VeteranSubmissionStatus;
  eligible?: boolean;
  relation?: string;
  moderatedAt?: string | null;
  moderationNote?: string | null;
}

export interface VeteranSubmissionTarget {
  id: string;
  entryId?: string;
  episodeStart?: number;
  episodeEnd?: number;
  filedAfterEpisode?: number;
}

export async function moderateVeteranSubmission(input: {
  submissionId: string;
  decision: 'approve' | 'reject' | 'correct-unlock';
  unlockEpisode?: number;
  moderationNote?: string;
}): Promise<VeteranSubmission> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'moderate-veteran-submission', ...input }),
  });
  const body = await parseSubmissionResponse<{ submission: VeteranSubmission }>(response);
  return body.submission;
}

export async function fetchVeteranPublicJournalId(): Promise<string> {
  const response = await fetch(`${ENDPOINT}?audience=public-link`, { credentials: 'same-origin' });
  const body = await parseSubmissionResponse<{ publicJournalId: string }>(response);
  if (typeof body.publicJournalId !== 'string') {
    throw new WatchJournalError('The public journal link response was invalid.', 500);
  }
  return body.publicJournalId;
}

export async function submitVeteranInterpretation(input: {
  journalId: string;
  entryId?: string;
  predictionId?: string;
  unlockEpisode: number;
  interpretation: string;
  consent: true;
  website?: string;
}): Promise<VeteranSubmission> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'submit-veteran', ...input }),
  });
  const body = await parseSubmissionResponse<{ submission: VeteranSubmission }>(response);
  return body.submission;
}
