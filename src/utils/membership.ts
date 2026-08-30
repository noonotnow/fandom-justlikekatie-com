export type MembershipState = 'inactive' | 'active' | 'past_due' | 'cancelled';

/** Deliberately small, payment-detail-free shape returned by the billing API. */
export interface MembershipStatus {
  state: MembershipState;
  isMember: boolean;
  renewsAt?: string;
}

interface MembershipResponse {
  error?: string;
  state?: string;
  renewsAt?: string;
  url?: string;
}

async function readJson(response: Response): Promise<MembershipResponse> {
  const body = await response.json().catch(() => ({})) as MembershipResponse;
  if (!response.ok) throw new Error(body.error || 'Membership service is unavailable. Please try again.');
  return body;
}

export async function getMembershipStatus(): Promise<MembershipStatus> {
  const body = await readJson(await fetch('/api/membership/status', { credentials: 'same-origin' }));
  const state: MembershipState = body.state === 'active'
    || body.state === 'past_due'
    || body.state === 'cancelled'
    ? body.state
    : 'inactive';
  return { state, isMember: state === 'active', ...(typeof body.renewsAt === 'string' ? { renewsAt: body.renewsAt } : {}) };
}

export async function createMembershipCheckout(): Promise<string> {
  const body = await readJson(await fetch('/api/membership/checkout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }));
  if (typeof body.url !== 'string' || !body.url) throw new Error('Checkout could not be started.');
  return body.url;
}

export async function createMembershipPortal(): Promise<string> {
  const body = await readJson(await fetch('/api/membership/portal', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }));
  if (typeof body.url !== 'string' || !body.url) throw new Error('Billing management could not be opened.');
  return body.url;
}

export function logMembershipEvent(
  event: 'membership_view' | 'upgrade_click' | 'checkout_started' | 'membership_activated' | 'paid_feature_used',
): void {
  void fetch('/.netlify/functions/log-engagement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, batchKey: 'vibe-atlas-membership' }),
  }).catch(() => {});
}