import type { CreatorDraftSource } from './creatorDraft.ts';

export interface WorkstationReceipt {
  deliverableId: string;
  postId: string;
  postUrl: string;
  deepLink: string;
  status: 'Draft';
  workflow: 'direct';
  sourceVersion: number;
  mediaSyncState: 'synced' | 'operator-diverged';
  disposition: 'created' | 'replayed' | 'updated';
  warnings: string[];
}

export const WORKSTATION_HANDOFF_URL = '/api/workstation-handoff';
type Fetch = typeof fetch;

/** Send the versioned saved-grid source directly; the server resolves its media. */
export async function completeWorkstationHandoff(
  source: CreatorDraftSource,
  fetchImpl: Fetch = fetch,
): Promise<WorkstationReceipt> {
  let response: Response;
  try {
    response = await fetchImpl(WORKSTATION_HANDOFF_URL, {
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
    const error = stringField(body, 'error') || `Workstation handoff failed (HTTP ${response.status})`;
    const stage = stringField(body, 'stage');
    throw new Error(stage ? `${error} (${stage} stage)` : error);
  }
  return validateCreatorDraftReceipt(body);
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
function validateCreatorDraftReceipt(value: unknown): WorkstationReceipt {
  if (!value || typeof value !== 'object') throw new Error('Workstation handoff returned an invalid receipt.');
  const receipt = Reflect.get(value, 'receipt');
  if (!receipt || typeof receipt !== 'object') throw new Error('Workstation handoff returned an invalid receipt.');
  const deepLink = stringField(receipt, 'deepLink');
  const postId = stringField(receipt, 'postId');
  const postUrl = stringField(receipt, 'postUrl');
  const warnings = Reflect.get(receipt, 'warnings');
  let parsed: URL;
  try {
    parsed = new URL(deepLink);
  } catch {
    throw new Error('Workstation returned an invalid composer URL.');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.origin !== 'https://workstation.justlikekatie.com'
    || Boolean(parsed.username)
    || Boolean(parsed.password)
    || Boolean(parsed.hash)
    || parsed.pathname !== '/compose'
    || [...parsed.searchParams.keys()].some(key => key !== 'postId')
    || parsed.searchParams.getAll('postId').length !== 1
    || parsed.searchParams.get('postId') !== postId
    || !isHttpsUrl(postUrl)
    || !stringField(receipt, 'deliverableId')
    || stringField(receipt, 'status') !== 'Draft'
    || stringField(receipt, 'workflow') !== 'direct'
    || !Number.isSafeInteger(Reflect.get(receipt, 'sourceVersion'))
    || Reflect.get(receipt, 'sourceVersion') < 0
    || !['synced', 'operator-diverged'].includes(stringField(receipt, 'mediaSyncState'))
    || !['created', 'replayed', 'updated'].includes(stringField(receipt, 'disposition'))
    || !Array.isArray(warnings)
    || warnings.some(warning => typeof warning !== 'string')
  ) {
    throw new Error('Workstation returned an invalid Creator Draft receipt.');
  }
  return receipt as WorkstationReceipt;
}

function stringField(value: unknown, field: string): string {
  if (!value || typeof value !== 'object') return '';
  const candidate = Reflect.get(value, field);
  return typeof candidate === 'string' ? candidate : '';
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
