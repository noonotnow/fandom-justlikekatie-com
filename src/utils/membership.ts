export type MembershipState = 'inactive' | 'active' | 'past_due' | 'cancelled';
export type MembershipCapability =
  | 'fandom_collector'
  | 'creator_os'
  | 'fandom_creator_bridge'
  | 'ecosystem_bundle';

/** Deliberately small, payment-detail-free shape returned by the billing API. */
export interface MembershipStatus {
  state: MembershipState;
  isMember: boolean;
  /** Explicit product entitlements. This is intentionally independent of billing state. */
  capabilities?: MembershipCapability[];
  renewsAt?: string;
}

interface MembershipResponse {
  error?: string;
  state?: string;
  renewsAt?: string;
  url?: string;
  capabilities?: unknown;
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
  const capabilities = parseMembershipCapabilities(body.capabilities);
  return {
    state,
    isMember: state === 'active',
    ...(capabilities.length > 0 ? { capabilities } : {}),
    ...(typeof body.renewsAt === 'string' ? { renewsAt: body.renewsAt } : {}),
  };
}

export function parseMembershipCapabilities(value: unknown): MembershipCapability[] {
  if (!Array.isArray(value)) return [];
  const known: MembershipCapability[] = [
    'fandom_collector',
    'creator_os',
    'fandom_creator_bridge',
    'ecosystem_bundle',
  ];
  return known.filter(capability => value.includes(capability));
}

/** Return true only when the explicit Collector entitlement is present. */
export function hasCollectorCapability(status: Pick<MembershipStatus, 'capabilities'> | null | undefined): boolean {
  const capabilities = status?.capabilities ?? [];
  return capabilities.includes('fandom_collector') || capabilities.includes('ecosystem_bundle');
}

/** Return true only when a Creator-side product can hand off to Creator OS. */
export function hasCreatorOsHandoffCapability(
  status: Pick<MembershipStatus, 'capabilities'> | null | undefined,
): boolean {
  const capabilities = status?.capabilities ?? [];
  return capabilities.includes('creator_os')
    || capabilities.includes('fandom_creator_bridge')
    || capabilities.includes('ecosystem_bundle');
}

// Short aliases for feature callers that do not need to know the billing shape.
export const canUseCollectorFeatures = hasCollectorCapability;
export const canUseCreatorOsHandoff = hasCreatorOsHandoffCapability;
export const hasCollectorAccess = hasCollectorCapability;
export const hasCreatorOsHandoffAccess = hasCreatorOsHandoffCapability;

export async function createMembershipCheckout(returnDate?: string): Promise<string> {
  const body = await readJson(await fetch('/api/membership/checkout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(returnDate ? { returnDate } : {}),
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

/** Poll the cached capability record after returning from Stripe without calling Stripe directly. */
export async function refreshMembershipAfterBilling(
  attempts = 5,
  delayMs = 500,
): Promise<MembershipStatus> {
  let status = await getMembershipStatus();
  for (let attempt = 1; attempt < attempts && status.state !== 'active'; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    status = await getMembershipStatus();
  }
  return status;
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