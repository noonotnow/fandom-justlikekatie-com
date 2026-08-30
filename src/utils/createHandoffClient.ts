import type { CreatorDraftSource } from './creatorDraft.ts';

export interface CreateReceipt {
  createUrl: string;
  postId: string;
  status: 'Draft';
  workflow: 'creator-draft';
  sourceId: string;
  sourceVersion: string;
  mediaSyncState: 'synced';
  distribution?: {
    primaryPlatform: 'rednote' | 'weibo';
    platforms: Array<'rednote' | 'weibo'>;
  };
  disposition?: string;
}

export const CREATE_HANDOFF_URL = '/api/create-handoff';
type Fetch = typeof fetch;

/** Send the versioned saved-grid source directly; the server resolves its media. */
export async function completeCreatorDraftHandoff(
  source: CreatorDraftSource,
  fetchImpl: Fetch = fetch,
): Promise<CreateReceipt> {
  let response: Response;
  try {
    response = await fetchImpl(CREATE_HANDOFF_URL, {
      method: 'POST',
      credentials: 'same-origin',
      // Direct grid handoffs are account-scoped and must authenticate via the
      // same-origin admin session, not the legacy packet operator token.
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error('Workstation handoff timed out or could not be reached.');
  }
  const body = await readJson(response);
  if (!response.ok) {
    const error = stringField(body, 'error') || `CREATE handoff failed (HTTP ${response.status})`;
    const stage = stringField(body, 'stage');
    throw new Error(stage ? `${error} (${stage} stage)` : error);
  }
  return validateCreatorDraftReceipt(body, source);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Workstation handoff returned invalid JSON.');
  }
}


function validateCreatorDraftReceipt(value: unknown, source: CreatorDraftSource): CreateReceipt {
  if (!value || typeof value !== 'object') throw new Error('CREATE handoff returned an invalid receipt.');
  const receipt = Reflect.get(value, 'receipt');
  if (!receipt || typeof receipt !== 'object') throw new Error('CREATE handoff returned an invalid receipt.');
  const createUrl = stringField(receipt, 'createUrl');
  const postId = stringField(receipt, 'postId');
  let parsed: URL;
  try {
    parsed = new URL(createUrl);
  } catch {
    throw new Error('Workstation returned an invalid composer URL.');
  }
  if (
    parsed.protocol !== 'https:'
    || !['https://create.justlikekatie.com', 'https://workstation.justlikekatie.com'].includes(parsed.origin)
    || Boolean(parsed.username)
    || Boolean(parsed.password)
    || Boolean(parsed.hash)
    || parsed.pathname !== '/compose'
    || [...parsed.searchParams.keys()].some(key => key !== 'postId')
    || parsed.searchParams.getAll('postId').length !== 1
    || parsed.searchParams.get('postId') !== postId
    || stringField(receipt, 'status') !== 'Draft'
    || stringField(receipt, 'workflow') !== 'creator-draft'
    || stringField(receipt, 'sourceVersion') !== source.sourceVersion
    || stringField(receipt, 'sourceId') !== source.sourceId
    || stringField(receipt, 'mediaSyncState') !== 'synced'
  ) {
    throw new Error('Workstation returned an invalid Creator Draft receipt.');
  }
  const distribution = Reflect.get(receipt, 'distribution');
  if (
    !distribution
    || typeof distribution !== 'object'
    || !Array.isArray(Reflect.get(distribution, 'platforms'))
    || Reflect.get(distribution, 'platforms').join(',') !== source.platforms.join(',')
    || stringField(distribution, 'primaryPlatform') !== source.platforms[0]
  ) {
    throw new Error('Workstation returned a receipt for different post destinations.');
  }
  return receipt as CreateReceipt;
}

function stringField(value: unknown, field: string): string {
  if (!value || typeof value !== 'object') return '';
  const candidate = Reflect.get(value, field);
  return typeof candidate === 'string' ? candidate : '';
}
