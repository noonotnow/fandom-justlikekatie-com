import { useEffect, useState } from 'react';
import styles from './FandomAdmin.module.css';

type ArchiveRepairOutcome = 'repaired' | 'no_op' | 'failed';

export type ArchiveRepairReceipt = {
  attemptedAt: string;
  operatorId: string;
  scanned: number;
  repairedDates: string[];
  outcome: ArchiveRepairOutcome;
  errorClassification?: string;
};

const OUTCOME_LABELS: Record<ArchiveRepairOutcome, string> = {
  repaired: 'Repaired',
  no_op: 'No changes',
  failed: 'Failed',
};

const FAILURE_LABELS: Record<string, string> = {
  safe_update_unavailable: 'Safe update unavailable',
  invalid_request: 'Invalid request',
  invalid_archive_data: 'Invalid archive data',
  storage_failure: 'Storage failure',
};

function isArchiveRepairReceipt(value: unknown): value is ArchiveRepairReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Record<string, unknown>;
  return typeof receipt.attemptedAt === 'string'
    && Number.isFinite(Date.parse(receipt.attemptedAt))
    && typeof receipt.operatorId === 'string'
    && receipt.operatorId.length > 0
    && Number.isSafeInteger(receipt.scanned)
    && Number(receipt.scanned) >= 0
    && Array.isArray(receipt.repairedDates)
    && receipt.repairedDates.every(date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date))
    && ['repaired', 'no_op', 'failed'].includes(String(receipt.outcome));
}

export async function loadArchiveRepairHistory(): Promise<ArchiveRepairReceipt[]> {
  const response = await fetch('/.netlify/functions/star-of-day?archiveRepairHistory=1', {
    credentials: 'include',
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || 'Archive repair history unavailable.');
  }
  if (!Array.isArray(result?.history)) {
    throw new Error('Archive repair history unavailable.');
  }
  return result.history
    .filter(isArchiveRepairReceipt)
    .sort((left: ArchiveRepairReceipt, right: ArchiveRepairReceipt) =>
      Date.parse(right.attemptedAt) - Date.parse(left.attemptedAt));
}

export function ArchiveRepairHistory() {
  const [history, setHistory] = useState<ArchiveRepairReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    void loadArchiveRepairHistory()
      .then(receipts => {
        if (!cancelled) setHistory(receipts);
      })
      .catch(error => {
        if (!cancelled) {
          setNotice(error instanceof Error ? error.message : 'Archive repair history unavailable.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className={styles.repairHistory} aria-labelledby="archive-repair-history-title">
      <header className={styles.repairHistoryHeader}>
        <div>
          <p className={styles.eyebrow}>Archive operations</p>
          <h3 id="archive-repair-history-title">Repair receipts</h3>
          <p>Recent reconciliation attempts, newest first. This history is available only in the private operator console.</p>
        </div>
        {!loading && !notice && <span className={styles.courtCount}>{history.length} recent attempts</span>}
      </header>

      {loading ? (
        <div className={styles.loading} aria-label="Loading archive repair receipts"><span /><span /></div>
      ) : notice ? (
        <div className={styles.notice} role="alert">{notice}</div>
      ) : history.length === 0 ? (
        <p className={styles.emptyState}>No archive repair attempts have been recorded.</p>
      ) : (
        <ol className={styles.repairReceiptList}>
          {history.map((receipt, index) => (
            <li
              key={`${receipt.attemptedAt}-${receipt.operatorId}-${index}`}
              className={styles.repairReceipt}
              data-outcome={receipt.outcome}
            >
              <div className={styles.repairReceiptSummary}>
                <strong>{OUTCOME_LABELS[receipt.outcome]}</strong>
                <time dateTime={receipt.attemptedAt}>
                  {new Date(receipt.attemptedAt).toLocaleString()}
                </time>
              </div>
              <dl className={styles.repairReceiptDetails}>
                <div><dt>Operator</dt><dd>{receipt.operatorId}</dd></div>
                <div><dt>Scanned</dt><dd>{receipt.scanned.toLocaleString()}</dd></div>
                <div>
                  <dt>Repaired dates</dt>
                  <dd>{receipt.repairedDates.length > 0 ? receipt.repairedDates.join(', ') : 'None'}</dd>
                </div>
                {receipt.outcome === 'failed' && (
                  <div>
                    <dt>Failure classification</dt>
                    <dd>{FAILURE_LABELS[receipt.errorClassification || ''] || 'Storage failure'}</dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}