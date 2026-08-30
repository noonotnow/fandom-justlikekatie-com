import type { CreatorDraftSource } from './creatorDraft.ts';

export interface CreateReceipt {
  createUrl: string;
  postId: string;
  status: 'Draft';
  workflow: 'creator-draft';
  sourceId: string;
  sourceVersion: string;
  mediaSyncState: 'synced';
  disposition?: string;
}

export const CREATE_HANDOFF_URL = '/api/create-handoff';
type Fetch = typeof fetch;

/** Send the versioned saved-grid source directly; the server resolves its media. */
export async function completeCreatorDraftHandoff(
  source: CreatorDraftSource,
  fetchImpl: Fetch = fetch,
): Promise<CreateReceipt> {
  const response = await fetchImpl(CREATE_HANDOFF_URL, {
    method: 'POST',
    credentials: 'same-origin',
    // Direct grid handoffs are account-scoped and must authenticate via the
    // same-origin admin session, not the legacy packet operator token.
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  });
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
    throw new Error(`CREATE handoff returned invalid JSON (HTTP ${response.status})`);
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
    throw new Error('CREATE handoff returned an invalid Open in CREATE URL.');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.hostname !== 'create.justlikekatie.com'
    || parsed.pathname !== '/compose'
    || parsed.searchParams.get('postId') !== postId
    || stringField(receipt, 'status') !== 'Draft'
    || stringField(receipt, 'workflow') !== 'creator-draft'
    || stringField(receipt, 'sourceVersion') !== source.sourceVersion
    || stringField(receipt, 'sourceId') !== source.sourceId
    || stringField(receipt, 'mediaSyncState') !== 'synced'
  ) {
    throw new Error('CREATE handoff returned an invalid Creator Draft receipt.');
  }
  return receipt as CreateReceipt;
}

function stringField(value: unknown, field: string): string {
  if (!value || typeof value !== 'object') return '';
  const candidate = Reflect.get(value, field);
  return typeof candidate === 'string' ? candidate : '';
}
