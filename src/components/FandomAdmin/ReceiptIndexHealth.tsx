import React, { type FC } from 'react';

type ReceiptIndexHealthValue = {
  status?: unknown;
  releaseReady?: unknown;
} | null;

type ReceiptIndexHealthClasses = {
  container?: string;
  header?: string;
};

const labels: Record<string, string> = {
  release_ready: 'Release-ready',
  missing: 'Missing',
  invalid: 'Invalid',
  not_ready: 'Not ready',
  unavailable: 'Unavailable',
};

const messages: Record<string, string> = {
  release_ready: 'The processed-receipt retention index is valid and ready.',
  missing: 'The processed-receipt retention index is missing. Do not consider this release complete.',
  invalid: 'The processed-receipt retention index is invalid. The concurrent migration must be retried.',
  not_ready: 'The processed-receipt retention index is not ready. The concurrent migration did not finish.',
  unavailable: 'Receipt index readiness could not be checked because the production database is unavailable.',
};

export const ReceiptIndexHealth: FC<{
  health: ReceiptIndexHealthValue;
  classes?: ReceiptIndexHealthClasses;
}> = ({ health, classes }) => {
  const status = typeof health?.status === 'string' ? health.status : 'unavailable';
  const releaseReady = status === 'release_ready' && health?.releaseReady === true;

  return (
    <section className={classes?.container} aria-labelledby="receipt-index-health-title">
      <div className={classes?.header}>
        <h5 id="receipt-index-health-title">Processed receipt retention</h5>
        <strong data-status={releaseReady ? 'resolved' : 'active'}>
          {labels[status] ?? labels.unavailable}
        </strong>
      </div>
      <p role={releaseReady ? undefined : 'alert'}>
        {messages[status] ?? messages.unavailable}
      </p>
    </section>
  );
};