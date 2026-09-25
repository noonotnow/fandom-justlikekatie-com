import React from 'react';

type ReceiptIndexHealthValue = {
  status?: unknown;
  releaseReady?: unknown;
} | null;

type ReceiptIndexNotificationHealthValue = {
  status?: unknown;
  lastAttemptAt?: unknown;
  lastDeliveredAt?: unknown;
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

export const ReceiptIndexHealth: React.FC<{
  health: ReceiptIndexHealthValue;
  notifications?: ReceiptIndexNotificationHealthValue;
  classes?: ReceiptIndexHealthClasses;
}> = ({ health, notifications, classes }) => {
  const status = typeof health?.status === 'string' ? health.status : 'unavailable';
  const releaseReady = status === 'release_ready' && health?.releaseReady === true;
  const deliveryStatus = typeof notifications?.status === 'string' ? notifications.status : 'unavailable';
  const deliveryHealthy = deliveryStatus === 'delivered' || deliveryStatus === 'not_attempted';
  const deliveryLabels: Record<string, string> = {
    delivered: 'Delivered',
    failed: 'Delivery failed',
    pending: 'Delivery in progress',
    not_attempted: 'No delivery required',
    unavailable: 'Unavailable',
  };
  const deliveryMessages: Record<string, string> = {
    delivered: 'The most recent scheduled notification was delivered.',
    failed: 'The most recent scheduled notification could not be delivered.',
    pending: 'A scheduled notification delivery is currently in progress.',
    not_attempted: 'Monitoring is active. No index transition has required a notification yet.',
    unavailable: 'Notification delivery health could not be read.',
  };
  const formatTimestamp = (value: unknown) => (
    typeof value === 'string' && Number.isFinite(Date.parse(value))
      ? new Date(value).toLocaleString()
      : 'None recorded'
  );

  return (
    <>
      <section className={classes?.container} aria-labelledby="receipt-index-health-title">
        <div className={classes?.header}>
          <div>
            <small>Index readiness</small>
            <h5 id="receipt-index-health-title">Processed receipt retention</h5>
          </div>
          <strong data-status={releaseReady ? 'resolved' : 'active'}>
            {labels[status] ?? labels.unavailable}
          </strong>
        </div>
        <p role={releaseReady ? undefined : 'alert'}>
          {messages[status] ?? messages.unavailable}
        </p>
      </section>
      <section className={classes?.container} aria-labelledby="receipt-index-notification-health-title">
        <div className={classes?.header}>
          <div>
            <small>Notification delivery</small>
            <h5 id="receipt-index-notification-health-title">Scheduled index alerts</h5>
          </div>
          <strong data-status={deliveryHealthy ? 'resolved' : 'active'}>
            {deliveryLabels[deliveryStatus] ?? deliveryLabels.unavailable}
          </strong>
        </div>
        <p role={deliveryHealthy ? undefined : 'alert'}>
          {deliveryMessages[deliveryStatus] ?? deliveryMessages.unavailable}
        </p>
        <p>
          Last attempt: {formatTimestamp(notifications?.lastAttemptAt)}
          {' · '}
          Last delivered: {formatTimestamp(notifications?.lastDeliveredAt)}
        </p>
      </section>
    </>
  );
};