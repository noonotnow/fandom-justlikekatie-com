import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { MISPRINT_REASONS } from '../../utils/misprintReasons';
import type { MisprintReason } from '../../utils/collectionDB';
import { requestMagicLink } from '../../utils/publicAccount';
import { useLocale } from '../../i18n/LocaleProvider';
import styles from './Lightbox.module.css';

interface Props {
  date: string;
  imageId: string;
  imageTitle: string;
  actorName: string;
  vibeLabel: string;
  recoverAfterAuth?: boolean;
  onRecoveryComplete?: () => void;
}

interface OwnReport {
  receiptId: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'retracted';
  reason: MisprintReason;
  note?: string;
  actualIdentity?: string;
  date: string;
  imageId: string;
}

interface Draft {
  reason: MisprintReason;
  actualIdentity: string;
  note: string;
}

const recoveryKey = (date: string, imageId: string) => `fandom_daily_report_draft:${date}:${imageId}`;
const recoveryTargetKey = 'fandom_daily_report_return';
const RECOVERY_LIFETIME_MS = 6 * 60 * 60 * 1000;

function localizedReason(reason: MisprintReason, t: (english: string, chinese: string) => string): string {
  const def = MISPRINT_REASONS.find(item => item.value === reason)!;
  const descriptions: Record<MisprintReason, string> = {
    wrong_actor: t('Some Other Man™ — wrong actor', 'Some Other Man™：演员认错了'),
    wrong_vibe: t('Technically Him, Spiritually Incorrect — right actor, wrong vibe', 'Technically Him, Spiritually Incorrect：演员没错，氛围不对'),
    query_mismatch: t('The Search Has Wandered — this result does not match the search', '搜索跑偏了：图片与搜索内容不符'),
    misleading_metadata: t('Metadata Committed Perjury — the listing details are misleading', '元数据说了谎：图片信息具有误导性'),
    composite_or_collage: t('Nine Men in a Trench Coat — this is a collage or composite', '九人风衣：这是拼贴或合成图'),
    bad_asset: t('Cursed Asset — broken, tiny, or unusable image', '图片损坏：图片破损、过小或无法使用'),
    duplicate: t('Same Man, Same Photo — duplicate within this board', '同一张照片：本期九宫格内重复'),
    ranking_bug: t('The Machine Has Become Confused — product or ranking issue', '系统迷糊了：产品或排序问题'),
    other: t('Other Misprint — another specific issue', '其他错版：其他具体问题'),
  };
  return t(`${def.label} — ${descriptions[reason].split(' — ').slice(-1)[0]}`, descriptions[reason]);
}

function reasonOptionLabel(reason: MisprintReason, t: (english: string, chinese: string) => string): string {
  const labels: Record<MisprintReason, string> = {
    wrong_actor: t('Wrong actor', '演员认错了'),
    wrong_vibe: t('Wrong vibe', '氛围不对'),
    query_mismatch: t('Does not match the search', '图片与搜索不符'),
    misleading_metadata: t('Misleading listing details', '图片信息有误导性'),
    composite_or_collage: t('Collage or composite', '拼贴或合成图'),
    bad_asset: t('Broken or unusable image', '图片破损或无法使用'),
    duplicate: t('Duplicate image in this board', '本期九宫格内重复'),
    ranking_bug: t('Product or ranking issue', '产品或排序问题'),
    other: t('Other issue', '其他问题'),
  };
  return labels[reason];
}

export function DailyImageReport({ date, imageId, imageTitle, actorName, vibeLabel, recoverAfterAuth = false, onRecoveryComplete }: Props) {
  const { t, locale } = useLocale();
  const key = useMemo(() => recoveryKey(date, imageId), [date, imageId]);
  const [reason, setReason] = useState<MisprintReason>('wrong_actor');
  const [actualIdentity, setActualIdentity] = useState('');
  const [note, setNote] = useState('');
  const [email, setEmail] = useState('');
  const [ownReports, setOwnReports] = useState<OwnReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorKind, setErrorKind] = useState<'sign_in' | 'failure' | ''>('');
  const [open, setOpen] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const sessionVersion = useRef(0);

  useEffect(() => {
    const clearAccountEvidence = () => {
      sessionVersion.current += 1;
      setOwnReports([]);
      setNotice('');
      setErrorKind('');
      setBusy(false);
    };
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel('fandom-collection') : null;
    channel?.addEventListener('message', event => {
      if (event.data?.type === 'session-changed') clearAccountEvidence();
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'fandom-collection-notify' && event.newValue?.startsWith('session-changed:')) clearAccountEvidence();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      sessionVersion.current += 1;
      channel?.close();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const draft = JSON.parse(saved) as Partial<Draft> & { expiresAt?: number };
        if (typeof draft.expiresAt === 'number' && draft.expiresAt > Date.now()) {
          if (draft.reason && MISPRINT_REASONS.some(item => item.value === draft.reason)) setReason(draft.reason);
          if (typeof draft.actualIdentity === 'string') setActualIdentity(draft.actualIdentity.slice(0, 200));
          if (typeof draft.note === 'string') setNote(draft.note.slice(0, 1000));
        } else {
          localStorage.removeItem(key);
        }
      }
    } catch { /* Ignore an invalid local recovery draft. */ }
    setDraftLoaded(true);
  }, [key]);

  useEffect(() => {
    if (!draftLoaded) return;
    try {
      localStorage.setItem(key, JSON.stringify({ reason, actualIdentity, note, expiresAt: Date.now() + RECOVERY_LIFETIME_MS }));
    } catch { /* Reporting remains usable if storage is unavailable. */ }
  }, [actualIdentity, draftLoaded, key, note, reason]);

  const localizedError = (message: string, fallback: string) =>
    !message
      ? fallback
      : locale === 'zh-CN' && !/\p{Script=Han}/u.test(message)
        ? `${t('Original error: ', '英文错误信息：')}${message}`
        : message;

  async function refreshStatus() {
    const version = sessionVersion.current;
    setBusy(true);
    setNotice('');
    setErrorKind('');
    try {
      const query = new URLSearchParams({ reports: 'own', date, imageId });
      const response = await fetch(`/.netlify/functions/actor-audits?${query}`, { credentials: 'include' });
      if (version !== sessionVersion.current) return;
      if (response.status === 401) {
        setErrorKind('sign_in');
        setNotice(t('Sign in to check your private report status.', '登录后查看你的私人报告状态。'));
        setOwnReports([]);
      } else if (!response.ok) {
        throw new Error(response.status === 403
          ? t('This report status is not available to this account.', '此账号无法查看该报告状态。')
          : t('Could not refresh report status. Try again.', '无法刷新报告状态，请重试。'));
      } else {
        const payload = await response.json() as { reports?: OwnReport[] };
        if (version !== sessionVersion.current) return;
        setOwnReports(Array.isArray(payload.reports) ? payload.reports : []);
      }
    } catch (error) {
      if (version !== sessionVersion.current) return;
      setErrorKind('failure');
      setNotice(error instanceof Error ? error.message : t('Could not refresh report status.', '无法刷新报告状态。'));
    } finally { if (version === sessionVersion.current) setBusy(false); }
  }

  async function submitReport(event: FormEvent) {
    event.preventDefault();
    const version = sessionVersion.current;
    setBusy(true);
    setNotice('');
    setErrorKind('');
    try {
      const response = await fetch('/.netlify/functions/actor-audits', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'report_daily_image',
          date,
          imageId,
          reason,
          ...(actualIdentity.trim() ? { actualIdentity: actualIdentity.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({})) as { report?: OwnReport; error?: string; message?: string };
      if (version !== sessionVersion.current) return;
      if (response.status === 401) {
        setErrorKind('sign_in');
        setNotice(t('Sign in to send this report. Your selected image and draft will be kept.', '登录后即可提交报告；所选图片和草稿会保留。'));
      } else if (!response.ok) {
        throw new Error(localizedError(payload.message || payload.error || '', t('The report was not submitted. Your draft is still here.', '报告未能提交，草稿仍会保留。')));
      } else {
        const report = payload.report;
        const validStatus = report && ['pending_review', 'approved', 'rejected', 'retracted'].includes(report.status);
        const validReason = report && MISPRINT_REASONS.some(item => item.value === report.reason);
        if (!report || !report.receiptId || !validStatus || !validReason || report.date !== date || report.imageId !== imageId) {
          throw new Error(t('The server returned an invalid report receipt. Your draft is still here.', '服务器返回的报告回执无效，草稿仍会保留。'));
        }
        setOwnReports(current => [report, ...current.filter(item => item.receiptId !== report.receiptId)]);
        try { localStorage.removeItem(key); } catch { /* A saved report remains successful if storage is unavailable. */ }
        setNotice(({
          pending_review: t('Report received. It is pending operator review; the image and edition have not changed.', '报告已收到，正在等待运营审核；图片和期刊均未更改。'),
          approved: t('This report is already approved. Reason scope determines whether future runs are affected; this image and edition were not changed.', '此报告已获批准。是否影响后续生成取决于原因范围；当前图片和期刊未更改。'),
          rejected: t('This report was not approved. The image and edition were not changed.', '此报告未获批准，图片和期刊均未更改。'),
          retracted: t('This correction was retracted. The image and edition were not changed.', '此更正已撤回，图片和期刊均未更改。'),
        } as const)[report.status]);
      }
    } catch (error) {
      if (version !== sessionVersion.current) return;
      setErrorKind('failure');
      setNotice(localizedError(error instanceof Error ? error.message : '', t('The report could not be submitted. Your draft is still here.', '报告提交失败，草稿仍会保留。')));
    } finally { if (version === sessionVersion.current) setBusy(false); }
  }

  async function sendSignIn(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      localStorage.setItem(recoveryTargetKey, JSON.stringify({ date, imageId, expiresAt: Date.now() + RECOVERY_LIFETIME_MS }));
      localStorage.setItem(key, JSON.stringify({ reason, actualIdentity, note, expiresAt: Date.now() + RECOVERY_LIFETIME_MS }));
      setNotice(await requestMagicLink(email.trim(), `archive:${date}`));
      setErrorKind('');
    } catch (error) {
      setErrorKind('failure');
      setNotice(localizedError(error instanceof Error ? error.message : '', t('Could not send the sign-in link.', '无法发送登录链接。')));
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (!recoverAfterAuth) return;
    try {
      const target = JSON.parse(localStorage.getItem(recoveryTargetKey) || 'null') as { date?: string; imageId?: string; expiresAt?: number } | null;
      if (target?.date === date && target.imageId === imageId && target.expiresAt && target.expiresAt > Date.now()) {
        setOpen(true);
        localStorage.removeItem(recoveryTargetKey);
        localStorage.removeItem(key);
        void refreshStatus();
        onRecoveryComplete?.();
      }
    } catch { /* Ignore invalid recovery context. */ }
  // App restores this component only after consuming the magic link, and both identifiers must match.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, imageId, recoverAfterAuth]);

  return (
    <details className={styles.report} open={open} onToggle={event => {
      const isOpen = event.currentTarget.open;
      setOpen(isOpen);
      if (isOpen) void refreshStatus();
    }}>
      <summary>{t('Report an image issue', '报告图片问题')}</summary>
      <p className={styles.reportContext}>{t('Exact Daily Drop image', '当前每日精选图片')} · {imageTitle} · {actorName} × {vibeLabel} · {date}</p>
      {ownReports.map(report => {
        const reportStatus = ({
          pending_review: t('Pending review', '待审核'),
          approved: t('Approved review decision — reason scope determines whether future runs are affected.', '审核已批准；是否影响后续生成取决于原因的作用范围。'),
          rejected: t('Not approved', '未批准'),
          retracted: t('Correction retracted', '更正已撤回'),
        } as const)[report.status];
        const reasonLabel = localizedReason(report.reason, t);
        return <p className={styles.reportStatus} role="status" key={report.receiptId}>
          {t('Your report:', '你的报告：')} <strong>{reasonLabel}</strong> · {reportStatus}
        </p>;
      })}
      {notice && <p className={errorKind ? styles.reportError : styles.reportNotice} role={errorKind ? 'alert' : 'status'}>{notice}</p>}
      <form onSubmit={submitReport} className={styles.reportForm}>
        <label>
          <span>{t('What went wrong?', '问题类型')}</span>
          <select value={reason} onChange={event => setReason(event.target.value as MisprintReason)}>
            {MISPRINT_REASONS.map(item => <option key={item.value} value={item.value}>{reasonOptionLabel(item.value, t)}</option>)}
          </select>
          <span className={styles.reasonDescription}>{localizedReason(reason, t)}</span>
        </label>
        <label>
          <span>{t('Actual identity, if known (optional)', '实际人物（如知道，选填）')}</span>
          <input value={actualIdentity} maxLength={200} onChange={event => setActualIdentity(event.target.value)} />
          <small>{actualIdentity.length}/200</small>
        </label>
        <label>
          <span>{t('Add context (optional)', '补充说明（选填）')}</span>
          <textarea value={note} maxLength={1000} rows={3} onChange={event => setNote(event.target.value)} />
          <small>{note.length}/1000</small>
        </label>
        <div className={styles.reportActions}>
          <button type="submit" disabled={busy}>{busy ? t('Sending…', '正在提交…') : t('Send report', '提交报告')}</button>
          <button type="button" onClick={() => void refreshStatus()} disabled={busy}>{t('Refresh my status', '刷新我的状态')}</button>
        </div>
      </form>
      {errorKind === 'sign_in' && (
        <form className={styles.reportSignIn} onSubmit={sendSignIn}>
          <label><span>{t('Email for a sign-in link', '接收登录链接的邮箱')}</span><input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
          <button type="submit" disabled={busy || !email.trim()}>{t('Send sign-in link', '发送登录链接')}</button>
        </form>
      )}
      <p className={styles.reportFootnote}>{t('Reports are private and reviewed by an operator. Pending reports do not train curation or change the published grid. No notifications are sent.', '报告仅自己和运营人员可见。待审核报告不会训练策展或更改已发布九宫格；不会发送通知。')}</p>
    </details>
  );
}