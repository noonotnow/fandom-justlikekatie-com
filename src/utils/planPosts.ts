export const PLAN_STATUSES = [
  'Draft',
  'In progress',
  'Ready',
  'Approved',
  'Published',
] as const;

export type PlanStatus = typeof PLAN_STATUSES[number];
export type ProductionStage =
  | 'Needs Media'
  | 'Needs Caption'
  | 'Review Packet'
  | 'Ready for XHS Admin'
  | 'Receipt Pending'
  | 'State Unavailable'
  | 'Published';

export type PlanExecutionState =
  | 'not_recorded'
  | 'operator_scheduled_receipt_pending'
  | 'reconciled'
  | 'unavailable';

export interface PlanExecution {
  state: PlanExecutionState;
  id?: string;
  notionPageId?: string;
  scheduledAt?: string;
  notionVersion?: string;
  recordedBy?: string;
  recordedAt?: string;
  reconciledAt?: string;
  warning?: string;
}

export interface PlanPost {
  id: string;
  version: string;
  headline: string;
  series: string;
  platform: string;
  status: string;
  scheduledDate: string;
  thumbnail?: string;
  imageUrls: string[];
  imageUrl?: string;
  caption: string;
  needsMedia: boolean | null;
  needsCaption: boolean | null;
  packetReady: boolean | null;
  mediaAttached: boolean;
  captionWritten: boolean;
  mediaBlocked: boolean;
  captionBlocked: boolean;
  execution: PlanExecution;
  productionStage: ProductionStage;
  nextAction: string;
  requirements: string;
  campaignNotes: string;
  notionUrl?: string;
  createUrl?: string;
  postUrl?: string;
}

export interface PlanPostMutation {
  scheduledDate?: string | null;
  status?: PlanStatus;
}

export class PlanPostsError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Fetch = typeof fetch;
const OPERATOR_TOKEN_KEY = 'plan_operator_token';

export async function fetchPlanPosts(fetchImpl: Fetch = fetch): Promise<PlanPost[]> {
  const response = await fetchImpl('/api/plan-posts', {
    headers: planHeaders(),
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new PlanPostsError(stringField(body, 'error') || 'PLAN posts could not be loaded.', response.status);
  }
  const posts = body && typeof body === 'object' ? Reflect.get(body, 'posts') : undefined;
  if (!Array.isArray(posts)) throw new PlanPostsError('PLAN returned an invalid posts response.', 502);
  return posts as PlanPost[];
}

export async function fetchPlanPost(
  id: string,
  fetchImpl: Fetch = fetch,
): Promise<PlanPost> {
  const response = await fetchImpl(`/api/plan-posts?id=${encodeURIComponent(id)}`, {
    headers: planHeaders(),
  });
  const body = await readJson(response);
  if (!response.ok) throw responseError(response, body, 'PLAN post could not be refreshed.');
  const post = body && typeof body === 'object' ? Reflect.get(body, 'post') : undefined;
  if (!post || typeof post !== 'object') {
    throw new PlanPostsError('PLAN returned an invalid post response.', 502);
  }
  return post as PlanPost;
}

export async function markOperatorScheduled(
  post: PlanPost,
  idempotencyKey: string,
  fetchImpl: Fetch = fetch,
): Promise<PlanPost> {
  const response = await fetchImpl('/api/plan-operator-scheduled', {
    method: 'POST',
    headers: {
      ...planHeaders(),
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      notionPageId: post.id,
      expectedNotionVersion: post.version,
      expectedScheduledAt: post.scheduledDate,
    }),
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw responseError(
      response,
      body,
      `Operator scheduling could not be recorded (HTTP ${response.status}).`,
    );
  }
  const execution = body && typeof body === 'object' ? Reflect.get(body, 'execution') : undefined;
  if (!isExecution(execution, post)) {
    throw new PlanPostsError('PLAN returned an invalid operator scheduling response.', 502);
  }
  const refreshed = await fetchPlanPost(post.id, fetchImpl);
  if (
    refreshed.execution.state === 'reconciled'
    || refreshed.execution.state === 'operator_scheduled_receipt_pending'
  ) {
    return refreshed;
  }
  return applyExecution(refreshed, execution);
}

export async function updatePlanPost(
  post: PlanPost,
  mutation: PlanPostMutation,
  fetchImpl: Fetch = fetch,
): Promise<PlanPost> {
  const response = await fetchImpl('/api/plan-posts', {
    method: 'PATCH',
    headers: {
      ...planHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: post.id,
      expectedVersion: post.version || undefined,
      ...mutation,
    }),
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw responseError(response, body, `PLAN edit failed (HTTP ${response.status}).`);
  }

  const updated = body && typeof body === 'object' ? Reflect.get(body, 'post') : undefined;
  if (!updated || typeof updated !== 'object') {
    throw new PlanPostsError('PLAN returned an invalid updated post.', 502);
  }
  return updated as PlanPost;
}

export function setPlanOperatorToken(token: string): void {
  if (typeof sessionStorage === 'undefined') return;
  if (token) sessionStorage.setItem(OPERATOR_TOKEN_KEY, token);
  else sessionStorage.removeItem(OPERATOR_TOKEN_KEY);
}

function planHeaders(): Record<string, string> {
  const token = typeof sessionStorage === 'undefined'
    ? ''
    : sessionStorage.getItem(OPERATOR_TOKEN_KEY) ?? '';
  return {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function optimisticPost(
  posts: PlanPost[],
  id: string,
  mutation: PlanPostMutation,
): PlanPost[] {
  return posts.map(post => {
    if (post.id !== id) return post;
    const status = mutation.status ?? post.status;
    return {
      ...post,
      ...(Object.hasOwn(mutation, 'scheduledDate')
        ? { scheduledDate: mutation.scheduledDate ?? '' }
        : {}),
      ...(mutation.status ? { status } : {}),
      ...(status === 'Published'
        ? { productionStage: 'Published' as const }
        : {}),
    };
  });
}

export function replacePlanPost(posts: PlanPost[], updated: PlanPost): PlanPost[] {
  return posts.map(post => post.id === updated.id ? updated : post);
}

export function operatorScheduleEligibility(post: PlanPost): {
  eligible: boolean;
  reason: string;
} {
  if (!/^(rednote|both)$/i.test(post.platform)) {
    return { eligible: false, reason: 'Only Rednote posts use operator scheduling.' };
  }
  if (post.status !== 'Approved') {
    return { eligible: false, reason: 'Status must be Approved before operator scheduling.' };
  }
  if (!isTimezoneBearingInstant(post.scheduledDate)) {
    return {
      eligible: false,
      reason: 'ScheduledDate must be an exact time with a timezone.',
    };
  }
  if (post.execution.state === 'unavailable') {
    return {
      eligible: false,
      reason: 'Execution state is unavailable. Refresh before recording operator scheduling.',
    };
  }
  if (post.execution.state === 'operator_scheduled_receipt_pending') {
    return { eligible: false, reason: 'Operator scheduling is already recorded.' };
  }
  if (post.execution.state === 'reconciled') {
    return { eligible: false, reason: 'This post is already published and reconciled.' };
  }
  return { eligible: true, reason: '' };
}

export function executionLabel(post: PlanPost): string {
  if (post.execution.state === 'unavailable') return 'State unavailable';
  if (post.status === 'Published' || post.execution.state === 'reconciled') {
    return 'Published/reconciled';
  }
  if (post.execution.state === 'operator_scheduled_receipt_pending') {
    return 'Operator scheduled · receipt pending';
  }
  return 'Not recorded · Needs platform scheduling';
}

export function effectiveNextAction(post: PlanPost): string {
  return post.execution.state === 'operator_scheduled_receipt_pending'
    ? 'Backfill URL/metrics'
    : post.nextAction || 'Not recorded';
}

export function isNeedsPlatformScheduling(post: PlanPost): boolean {
  return post.productionStage === 'Ready for XHS Admin'
    && post.execution.state === 'not_recorded';
}

export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function operatorScheduleFingerprint(post: PlanPost): string {
  return JSON.stringify({
    notionPageId: post.id,
    expectedNotionVersion: post.version,
    expectedScheduledAt: post.scheduledDate,
  });
}

function applyExecution(post: PlanPost, execution: PlanExecution): PlanPost {
  const productionStage = post.status === 'Published' || execution.state === 'reconciled'
    ? 'Published'
    : execution.state === 'operator_scheduled_receipt_pending'
      ? 'Receipt Pending'
      : execution.state === 'unavailable' && post.productionStage === 'Ready for XHS Admin'
        ? 'State Unavailable'
        : post.productionStage;
  return { ...post, execution, productionStage };
}

function isTimezoneBearingInstant(value: string): boolean {
  return /T\d{2}:\d{2}/.test(value)
    && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    && !Number.isNaN(Date.parse(value));
}

function isExecution(value: unknown, post: PlanPost): value is PlanExecution {
  if (!value || typeof value !== 'object') return false;
  const state = Reflect.get(value, 'state');
  const scheduledAt = Reflect.get(value, 'scheduledAt');
  const notionVersion = Reflect.get(value, 'notionVersion');
  const recordedAt = Reflect.get(value, 'recordedAt');
  const reconciledAt = Reflect.get(value, 'reconciledAt');
  return (
    (state === 'operator_scheduled_receipt_pending' || state === 'reconciled')
    && Reflect.get(value, 'notionPageId') === post.id
    && scheduledAt === post.scheduledDate
    && notionVersion === post.version
    && typeof Reflect.get(value, 'id') === 'string'
    && Boolean(Reflect.get(value, 'id'))
    && typeof Reflect.get(value, 'recordedBy') === 'string'
    && Boolean(Reflect.get(value, 'recordedBy'))
    && typeof recordedAt === 'string'
    && !Number.isNaN(Date.parse(recordedAt))
    && (
      reconciledAt === undefined
      || (typeof reconciledAt === 'string' && !Number.isNaN(Date.parse(reconciledAt)))
    )
  );
}

function responseError(response: Response, body: unknown, fallback: string): PlanPostsError {
  return new PlanPostsError(
    stringField(body, 'message') || stringField(body, 'error') || fallback,
    response.status,
    stringField(body, 'code'),
  );
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new PlanPostsError(`PLAN returned invalid JSON (HTTP ${response.status}).`, 502);
  }
}

function stringField(value: unknown, field: string): string {
  if (!value || typeof value !== 'object') return '';
  const candidate = Reflect.get(value, field);
  return typeof candidate === 'string' ? candidate : '';
}
