import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from '../../i18n/LocaleProvider';
import styles from './DailyImageReportQueue.module.css';

type QueueStatus = 'pending_review' | 'active';
type ReportStatus = 'pending_review' | 'active' | 'approved' | 'rejected' | 'retracted';

interface QueueReport {
  actorId: string;
  vibeKey: string;
  receiptId: string;
  status: ReportStatus;
  reason: string;
  note?: string;
  actualIdentity?: string;
  date: string;
  imageId: string;
  actorName: string;
  vibeLabel: string;
  candidate: { publishedThumbnail?: string; thumbnail?: string; link?: string; query?: string };
  sourceCollectionId?: string;
  sourceGridId?: string;
  publication?: { date: string; imageId: string; boardHash: string; position: number };
}

function safeHttpUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined;
  } catch { return undefined; }
}

export function DailyImageReportQueue() {
  const { t, locale } = useLocale();
  const [status, setStatus] = useState<QueueStatus>('pending_review');
  const [reports, setReports] = useState<QueueReport[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyReceipt, setBusyReceipt] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const requestVersion = useRef(0);

  const load = useCallback(async (requestedCursor: string | null, requestedStatus = status) => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        reports: 'queue',
        status: requestedStatus,
        limit: '20',
      });
      if (requestedCursor) params.set('cursor', requestedCursor);
      const response = await fetch(`/.netlify/functions/actor-audits?${params}`, { credentials: 'include' });
      if (!response.ok) {
        throw new Error(response.status === 401 || response.status === 403
          ? t('Operator access is required to view this private queue.', '查看此私人队列需要运营人员权限。')
          : t('The report queue could not be loaded.', '无法加载报告队列。'));
      }
      const payload = await response.json() as { reports?: QueueReport[]; nextCursor?: string | null };
      if (version !== requestVersion.current) return;
      setReports(Array.isArray(payload.reports) ? payload.reports : []);
      setCursor(requestedCursor);
      setNextCursor(payload.nextCursor || null);
    } catch (cause) {
      if (version !== requestVersion.current) return;
      setReports([]);
      const message = cause instanceof Error ? cause.message : t('The report queue could not be loaded.', '无法加载报告队列。');
      setError(locale === 'zh-CN' && !/\p{Script=Han}/u.test(message)
        ? `${t('Original error: ', '英文错误信息：')}${message}`
        : message);
    } finally { if (version === requestVersion.current) setLoading(false); }
  }, [locale, status, t]);

  useEffect(() => { void load(null, status); }, [load, status]);

  async function review(report: QueueReport, decision: 'approved' | 'rejected' | 'retracted') {
    const note = (reasons[report.receiptId] || '').trim();
    if (decision === 'retracted' && !note) {
      setError(t('A reason is required to retract an active correction.', '撤回已生效更正时必须填写原因。'));
      return;
    }
    setBusyReceipt(report.receiptId);
    setError('');
    setNotice('');
    try {
      const body = decision === 'retracted'
        ? { action: 'retract_misprint', actorId: report.actorId, vibeKey: report.vibeKey, receiptId: report.receiptId, note }
        : { action: 'review_collection_misprint', actorId: report.actorId, vibeKey: report.vibeKey, receiptId: report.receiptId, decision, ...(note ? { note } : {}) };
      const response = await fetch('/.netlify/functions/actor-audits', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { message?: string; error?: string };
        const message = payload.message || payload.error || '';
        throw new Error(message && locale === 'zh-CN' && !/\p{Script=Han}/u.test(message)
          ? `${t('Original error: ', '英文错误信息：')}${message}`
          : message || t('The review action failed. Nothing was changed.', '审核操作失败，未作任何更改。'));
      }
      setNotice(t('Review decision saved. The queue has been refreshed.', '审核决定已保存，队列已刷新。'));
      await load(null, status);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t('The review action failed.', '审核操作失败。');
      setError(locale === 'zh-CN' && !/\p{Script=Han}/u.test(message)
        ? `${t('Original error: ', '英文错误信息：')}${message}`
        : message);
    } finally { setBusyReceipt(''); }
  }

  const linkFor = (report: QueueReport) => safeHttpUrl(report.candidate?.link);

  async function copyReceipt(receiptId: string) {
    setError('');
    setNotice('');
    try {
      await navigator.clipboard.writeText(receiptId);
      setNotice(t('Receipt reference copied.', '报告凭据编号已复制。'));
    } catch {
      setError(t('Could not copy the receipt reference. Select the reference and copy it manually.', '无法复制报告凭据编号。请选择该编号并手动复制。'));
    }
  }

  return (
    <section className={styles.queue} aria-label={t('Daily image report review', '每日图片报告审核')}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t('Private operator queue', '运营人员私人队列')}</p>
          <h3>{t('Daily image reports', '每日图片报告')}</h3>
          <p>{t('Reports are evidence to review, not a vote. Approval alone does not guarantee exclusions; reason-specific scope applies.', '报告是待核查的信息，不是投票。审核通过本身不保证排除图片，实际作用取决于原因的具体范围。')}</p>
        </div>
        <div className={styles.controls}>
          <label>{t('Queue', '队列')}
            <select aria-label={t('Queue', '队列')} value={status} disabled={Boolean(busyReceipt)} onChange={event => setStatus(event.target.value as QueueStatus)}>
              <option value="pending_review">{t('Pending review', '待审核')}</option>
              <option value="active">{t('Active corrections', '已生效更正')}</option>
            </select>
          </label>
          <button type="button" onClick={() => void load(null, status)} disabled={loading}>{t('Refresh', '刷新')}</button>
        </div>
      </header>
      {error && <p className={styles.error} role="alert">{error} <button type="button" onClick={() => void load(cursor, status)}>{t('Retry', '重试')}</button></p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {loading ? (
        <div className={styles.loading} aria-label={t('Loading reports', '正在加载报告')}><span /><span /><span /></div>
      ) : reports.length === 0 ? (
        <div className={styles.empty}><strong>{nextCursor ? t('No reports on this scan page.', '此扫描页没有报告。') : t('No reports in this queue.', '此队列中没有报告。')}</strong><p>{nextCursor ? t('This bounded scan page was empty; continue to check later pages.', '此有界扫描页为空；可继续检查后续页面。') : t('New reports will appear here after submission.', '提交的新报告会显示在这里。')}</p></div>
      ) : (
        <div className={styles.list}>
          {reports.map(report => {
            const image = safeHttpUrl(report.candidate?.thumbnail);
            const source = linkFor(report);
            const busy = Boolean(busyReceipt);
            return (
              <article className={styles.item} key={report.receiptId}>
                <div className={styles.imageCell}>
                  {safeHttpUrl(report.candidate?.publishedThumbnail) || image ? <img src={safeHttpUrl(report.candidate?.publishedThumbnail) || image} alt={t('Reported Daily Drop image', '被报告的每日精选图片')} loading="lazy" /> : <div className={styles.noImage}>{t('Image unavailable', '图片不可用')}</div>}
                  {report.publication && <span>{t('Position', '位置')} {report.publication.position + 1}</span>}
                </div>
                <div className={styles.details}>
                  <h4>{report.actorName} × {report.vibeLabel}</h4>
                  <p>{report.publication
                    ? <>{t('Edition', '期刊')} {report.publication.date} · </>
                    : <>{t('Collection evidence', '收藏证据')} · {report.sourceCollectionId || report.sourceGridId || report.receiptId} · </>}
                    {t('Reason', '原因')}: <strong>{report.reason}</strong></p>
                  {report.actualIdentity && <p>{t('Suggested identity', '建议身份')}: {report.actualIdentity}</p>}
                  {report.note && <blockquote>{report.note}</blockquote>}
                  <dl>
                    <div className={styles.receipt}>
                      <dt>{t('Receipt reference', '报告凭据编号')}</dt>
                      <dd>
                        <code>{report.receiptId}</code>
                        <button type="button" aria-label={`${t('Copy receipt reference', '复制报告凭据编号')} ${report.receiptId}`} onClick={() => void copyReceipt(report.receiptId)}>
                          {t('Copy reference', '复制编号')}
                        </button>
                      </dd>
                    </div>
                    <div><dt>{t('Source query', '来源搜索')}</dt><dd>{report.candidate?.query || t('Unavailable', '不可用')}</dd></div>
                    {report.publication && <>
                      <div><dt>{t('Image ID', '图片 ID')}</dt><dd>{report.publication.imageId}</dd></div>
                      <div><dt>{t('Board hash', '九宫格哈希')}</dt><dd>{report.publication.boardHash}</dd></div>
                    </>}
                  </dl>
                  {source && <a href={source} target="_blank" rel="noreferrer">{t('Open image source', '打开图片来源')}</a>}
                  <label className={styles.decisionNote}>
                    <span>{t('Decision note', '审核说明')} {status === 'active' ? t('(required to retract)', '（撤回时必填）') : t('(optional)', '（选填）')}</span>
                    <textarea rows={2} maxLength={400} value={reasons[report.receiptId] || ''} onChange={event => setReasons(value => ({ ...value, [report.receiptId]: event.target.value }))} />
                  </label>
                  <div className={styles.actions}>
                    {status === 'pending_review' ? <>
                      <button type="button" disabled={busy} onClick={() => void review(report, 'approved')}>{t('Approve correction', '批准更正')}</button>
                      <button type="button" disabled={busy} onClick={() => void review(report, 'rejected')}>{t('Reject report', '拒绝报告')}</button>
                    </> : (report.status === 'active' || report.status === 'approved') && (
                      <button type="button" disabled={busy || !reasons[report.receiptId]?.trim()} onClick={() => void review(report, 'retracted')}>{t('Retract correction', '撤回更正')}</button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <footer className={styles.pagination}>
        <button type="button" disabled={loading || !cursor} onClick={() => void load(null, status)}>{t('First page', '第一页')}</button>
        <button type="button" disabled={loading || !nextCursor} onClick={() => void load(nextCursor, status)}>{t('Next page', '下一页')}</button>
        <span>{t('Bounded pages; report frequency is not proof.', '分页有界；报告数量不能证明其正确性。')}</span>
      </footer>
    </section>
  );
}