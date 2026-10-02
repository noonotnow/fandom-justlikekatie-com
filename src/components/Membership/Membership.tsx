import { useEffect, useState } from 'react';
import { getPublicSession, requestMagicLink, type PublicUser } from '../../utils/publicAccount';
import {
  createMembershipCheckout,
  createMembershipPortal,
  logCreatorOsInterest,
  hasCollectorCapability,
  logMembershipEvent,
  type CreatorOsInterestStep,
  type MembershipStatus,
} from '../../utils/membership';
import { useLocale } from '../../i18n/LocaleProvider';

interface Props {
  status: MembershipStatus | null;
}

export function Membership({ status }: Props) {
  const { t } = useLocale();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [publishingInterest, setPublishingInterest] = useState<CreatorOsInterestStep | null>(null);
  const returnState = new URLSearchParams(window.location.search).get('membership');

  useEffect(() => {
    logMembershipEvent('membership_view');
    void getPublicSession().then(session => {
      setUser(session);
    }).catch(error => setNotice(error instanceof Error ? error.message : t('Account status could not be checked.', '无法检查账户状态。')));
  }, []);

  useEffect(() => {
    if (hasCollectorCapability(status)) logMembershipEvent('membership_activated');
  }, [status]);

  async function sendLink(event: React.FormEvent) {
    event.preventDefault();
    setBusy('link');
    try {
      setNotice(await requestMagicLink(email, 'membership'));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('Could not send the sign-in link.', '无法发送登录链接。'));
    } finally { setBusy(''); }
  }

  async function openBilling(kind: 'checkout' | 'portal') {
    setBusy(kind);
    try {
      if (kind === 'checkout') {
        logMembershipEvent('upgrade_click');
        logMembershipEvent('checkout_started');
      }
      window.location.assign(await (kind === 'checkout' ? createMembershipCheckout() : createMembershipPortal()));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('Billing could not be opened.', '无法打开账单页面。'));
      setBusy('');
    }
  }

  function recordPublishingInterest(step: CreatorOsInterestStep) {
    logCreatorOsInterest(step);
    setPublishingInterest(step);
  }

  const returnNotice = returnState === 'success'
    ? t('Thanks — we’re confirming your payment. Membership activates after verification.', '感谢加入！我们正在确认付款，验证完成后会员权益将自动启用。')
    : returnState === 'cancelled'
      ? t('Checkout was cancelled. Your free Vibe Atlas is unchanged.', '结账已取消，免费的氛围图鉴不会受到影响。')
      : returnState === 'payment_problem'
        ? t('We couldn’t confirm payment. Please review your billing details and try again.', '无法确认付款。请检查账单信息后重试。')
        : '';
  const hasCollectorAccess = hasCollectorCapability(status);

  return (
    <main className="membership">
      <header className="membership__hero">
        <p className="membership__label">{t('Vibe Atlas Collector Membership', '氛围图鉴收藏会员')}</p>
        <h1>{t('Today’s drop is free.', '今日卡组免费开放。')}<br /><em>{t('Keep recent cards. Go deeper with Collector.', '收藏近期心动，再用收藏会员留住更早的那一张。')}</em></h1>
        <p>{t('Browse, build, and export from every published Archive edition for free. Save individual cards from editions no more than three days old; Collector unlocks verified saves from older published editions, plus more ways to style and export what you make.', '所有已发布典藏卡组均可免费浏览、拼图和导出。发布不超过三天的卡片可免费保存；收藏会员可经核验保存更早期的单张卡片，并享有更多设计与导出方式。')}</p>
      </header>
      {(returnNotice || notice) && <p className="membership__notice" role="status">{returnNotice || notice}</p>}
      <section className="membership__journey" aria-label={t('How Vibe Atlas grows with you', '氛围图鉴如何陪你一路探索')}>
        <article>
          <span>{t('Discover', '发现')}</span>
          <h2>{t('Today’s drop is for everybody.', '今日卡组，人人可看。')}</h2>
          <p>{t('Come for the star, save the cards that get you, and catch up on the last few drops.', '为喜爱的演员而来，收藏让你心动的卡片，再补看最近几期卡组。')}</p>
        </article>
        <article>
          <span>{t('Collect', '收藏')}</span>
          <h2>{t('Missed one? Go back for it.', '错过了一期？随时回看。')}</h2>
          <p>{t('Collector membership unlocks verified saves for older published cards, actor collections, and the vibes you weren’t ready to let go. Every published historical board stays free to browse, build from, and export.', '收藏会员可经核验保存更早期的单张卡片、探索演员合集，留住那些舍不得错过的氛围。每期已发布历史卡组始终可以免费浏览、拼图和导出。')}</p>
        </article>
        <article>
          <span>{t('Create', '创作')}</span>
          <h2>{t('Make your own legendary grid.', '创作属于你的传奇九宫格。')}</h2>
          <p>{t('Start with the Vibe Atlas Canvas, then unlock premium styles, saved versions, and collector-quality exports for your most shareable grids.', '从氛围图鉴画布开始，为最值得分享的九宫格解锁高级设计、版本保存和收藏级导出。')}</p>
        </article>
      </section>
      <section className="membership__plans" aria-label={t('Membership options', '会员方案')}>
        <article>
          <p className="membership__label">{t('Free', '免费')}</p>
          <h2>{t('Catch today’s vibe', '感受今日氛围')}</h2>
          <ul><li>{t('Today’s complete card drop', '今日完整卡组')}</li><li>{t('Browse every published historical edition board', '浏览所有已发布的历史卡组')}</li><li>{t('Build and export grids from the public Archive', '使用公开典藏素材拼图和导出')}</li><li>{t('Individual card saves from editions no more than three days old', '保存发布不超过三天的单张卡片')}</li><li>{t('A basic Canvas and standard share export', '基础画布与标准分享导出')}</li><li>{t('Collection sync after sign-in and device merge', '登录后，选择合并本机保存的记录并同步收藏')}</li></ul>
        </article>
        <article className="membership__featured">
          <p className="membership__label">{t('Vibe Atlas Collector', '氛围图鉴收藏会员')}</p>
          <h2>$9 <small>{t('/ month', '/ 月')}</small></h2>
          <ul><li>{t('Verified individual-card saves from older published editions', '经核验保存更早期已发布卡组中的单张卡片')}</li><li>{t('Released actor × vibe pack library', '已发布的演员氛围包库')}</li><li>{t('Expanded actor and vibe collections', '更丰富的演员与氛围合集')}</li><li>{t('Premium Canvas layouts and treatments', '高级画布布局与设计')}</li><li>{t('Persistent grids and saved versions', '长期保存九宫格与版本')}</li><li>{t('Collector-quality exports', '收藏级导出')}</li><li>{t('Early access to new Fandom studio features', '抢先体验 Fandom 工作室新功能')}</li></ul>
          <p className="membership__rollout">{t('Additional Collector and Canvas tools will expand in stages. Founding members keep access as these benefits roll out.', '更多收藏会员与画布工具将分阶段开放。创始会员可持续享有陆续推出的会员权益。')}</p>
          {!user ? (
            <form onSubmit={sendLink} className="membership__sign-in">
              <label htmlFor="membership-email">{t('Sign in to join', '登录并加入')}</label>
              <div><input id="membership-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder={t('you@example.com', 'you@example.com')} /><button disabled={busy === 'link'}>{busy === 'link' ? t('Sending…', '正在发送…') : t('Email sign-in link', '发送登录链接')}</button></div>
            </form>
          ) : hasCollectorAccess ? (
            <div className="membership__member"><strong>{t('Founding Member', '创始会员')}</strong><span>{t('Signed in as', '当前登录账户：')} {user.email}</span><button onClick={() => void openBilling('portal')} disabled={Boolean(busy)}>{busy === 'portal' ? t('Opening…', '正在打开…') : t('Manage membership', '管理会员')}</button></div>
          ) : status?.state === 'past_due' ? (
            <div className="membership__join"><span>{t('Signed in as', '当前登录账户：')} {user.email}</span><b>{t('Payment needs attention.', '付款需要处理。')}</b><button onClick={() => void openBilling('portal')} disabled={Boolean(busy)}>{busy === 'portal' ? t('Opening…', '正在打开…') : t('Review billing', '查看账单')}</button></div>
          ) : (
             <div className="membership__join"><span>{t('Signed in as', '当前登录账户：')} {user.email}</span><button onClick={() => void openBilling('checkout')} disabled={Boolean(busy)}>{busy === 'checkout' ? t('Opening checkout…', '正在打开结账页面…') : t('Become a Founding Collector', '成为创始收藏会员')}</button></div>
          )}
        </article>
      </section>
      <section className="membership__research" aria-labelledby="publishing-interest-title">
        <p className="membership__label">{t('A question for collectors', '想听听收藏会员的想法')}</p>
        <h2 id="publishing-interest-title">{t('Do your finished grids become posts?', '你会把完成的九宫格发布成帖子吗？')}</h2>
        <p>{t('We’re exploring an optional way to take a finished Vibe Atlas grid into captioning, planning, and publishing tools. It would be optional—your Vibe Atlas collection would still stand on its own.', '我们正在探索一种可选方式，让完成的氛围图鉴九宫格进入文案、排期和发布工具。此功能完全自愿使用，你的氛围图鉴收藏仍可独立使用。')}</p>
        {publishingInterest === null ? (
          <>
            <button type="button" onClick={() => recordPublishingInterest('interest')}>{t('I’d use this', '我会使用此功能')}</button>
            <small>{t('Research only—no access or release date promised.', '目前仅作调研，尚未承诺开放权限或发布日期。')}</small>
          </>
        ) : publishingInterest === 'interest' ? (
          <div className="membership__research-steps">
            <strong>{t('What would you most want to do next?', '你最希望接下来使用哪项功能？')}</strong>
            <div>
              <button type="button" onClick={() => recordPublishingInterest('caption')}>{t('Write a caption', '撰写文案')}</button>
              <button type="button" onClick={() => recordPublishingInterest('plan')}>{t('Plan a post', '规划帖子')}</button>
              <button type="button" onClick={() => recordPublishingInterest('publish')}>{t('Publish', '发布')}</button>
              <button type="button" onClick={() => recordPublishingInterest('performance')}>{t('Track performance', '查看发布效果')}</button>
            </div>
          </div>
        ) : <p className="membership__research-thanks" role="status">{t('Thanks—this helps us decide whether a future publishing handoff is worth building.', '谢谢！你的反馈将帮助我们决定是否开发把作品转入发布工具的功能。')}</p>}
      </section>
    </main>
  );
}