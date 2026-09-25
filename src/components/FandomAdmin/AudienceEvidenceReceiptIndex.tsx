import React from 'react';
import { ReceiptIndexHealth } from './ReceiptIndexHealth';

type AnyRecord = Record<string, any>;

export type AudienceEvidenceResult = {
  summary: AnyRecord | null;
  archiveHealth: AnyRecord | null;
  billingOperations: AnyRecord | null;
};

export async function loadAudienceEvidence(): Promise<AudienceEvidenceResult> {
  const [engagementResponse, archiveResponse, billingResponse] = await Promise.all([
    fetch('/.netlify/functions/engagement-export?records=0', { credentials: 'include' }),
    fetch('/.netlify/functions/archive-access-operations', { credentials: 'include' }),
    fetch('/.netlify/functions/billing-operations', { credentials: 'include' }),
  ]);
  const [engagementResult, archiveResult, billingResult] = await Promise.all([
    engagementResponse.json().catch(() => null),
    archiveResponse.json().catch(() => null),
    billingResponse.json().catch(() => null),
  ]);
  if (!engagementResponse.ok) throw new Error(engagementResult?.error || 'Audience evidence unavailable.');
  if (!archiveResponse.ok) throw new Error(archiveResult?.error || 'Archive access health unavailable.');
  if (!billingResponse.ok) throw new Error(billingResult?.error || 'Billing operations unavailable.');

  return {
    summary: engagementResult.summary ?? null,
    archiveHealth: archiveResult,
    billingOperations: billingResult,
  };
}

export const AudienceEvidenceReceiptIndex: React.FC<{
  billingOperations: AnyRecord;
  classes?: {
    container?: string;
    header?: string;
  };
}> = ({ billingOperations, classes }) => (
  <ReceiptIndexHealth
    health={billingOperations.receiptIndex}
    notifications={billingOperations.receiptIndexNotifications}
    classes={classes}
  />
);