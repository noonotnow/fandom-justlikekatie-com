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
  | 'Published';

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

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
    throw new PlanPostsError(
      stringField(body, 'error') || `PLAN edit failed (HTTP ${response.status}).`,
      response.status,
    );
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
