import { translate } from '../i18n/locale';

export type MembershipState = 'inactive' | 'active' | 'past_due' | 'cancelled';
export type CreatorOsInterestStep = 'interest' | 'caption' | 'plan' | 'publish' | 'performance';
export type MembershipCapability =
  | 'fandom_collector'
  | 'creator_os'
  | 'fandom_creator_bridge'
  | 'ecosystem_bundle';

function localizedMembershipError(message: string | undefined, fallbackEnglish: string, fallbackChinese: string): string {
  if (!message) return translate(fallbackEnglish, fallbackChinese);
  if (message === 'Membership service is unavailable. Please try again.' || message === 'Billing is temporarily unavailable.') {
    return translate(message, '会员服务暂时不可用，请重试。');
  }
  if (message === 'No billing account exists.') {
    return translate(message, '尚未找到账单账户。');
  }
  if (message === 'Method not allowed.') {
    return translate(message, '不支持此操作。');
  }
  if (message === 'Checkout could not be started.') {
    return translate(message, '无法开始结账。');
  }
  if (message === 'Billing management could not be opened.') {
    return translate(message, '无法打开账单管理页面。');
  }
  return message;
}

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
  if (!response.ok) {
    throw new Error(localizedMembershipError(
      body.error,
      'Membership service is unavailable. Please try again.',
      '会员服务暂时不可用，请重试。',
    ));
  }
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
  if (typeof body.url !== 'string' || !body.url) {
    throw new Error(localizedMembershipError(undefined, 'Checkout could not be started.', '无法开始结账。'));
  }
  return body.url;
}

export async function createMembershipPortal(): Promise<string> {
  const body = await readJson(await fetch('/api/membership/portal', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }));
  if (typeof body.url !== 'string' || !body.url) {
    throw new Error(localizedMembershipError(undefined, 'Billing management could not be opened.', '无法打开账单管理页面。'));
  }
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
  const internalPilot = typeof window !== 'undefined' && (() => {
    try { return localStorage.getItem('companion-pilot-internal') === '1'; }
    catch { return false; }
  })();
  const pilotPath = !internalPilot && typeof window !== 'undefined'
    && Date.now() - Number(sessionStorage.getItem('companion-pilot-time')) < 24 * 60 * 60 * 1000
    ? sessionStorage.getItem('companion-pilot-path') : null;
  void fetch('/.netlify/functions/log-engagement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event, batchKey: 'vibe-atlas-membership',
      ...(event !== 'paid_feature_used' && pilotPath && ['discover', 'context', 'collect'].includes(pilotPath)
        ? { pilotPath } : {}),
    }),
  }).catch(() => {});
}

export function logCreatorOsInterest(step: CreatorOsInterestStep): void {
  void fetch('/.netlify/functions/log-engagement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'click',
      batchKey: 'vibe-atlas-membership',
      imageUrl: `creator-os-interest:${step}`,
    }),
  }).catch(() => {});
}