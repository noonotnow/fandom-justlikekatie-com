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

interface Props {
  status: MembershipStatus | null;
}

export function Membership({ status }: Props) {
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
    }).catch(error => setNotice(error instanceof Error ? error.message : 'Account status could not be checked.'));
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
      setNotice(error instanceof Error ? error.message : 'Could not send the sign-in link.');
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
      setNotice(error instanceof Error ? error.message : 'Billing could not be opened.');
      setBusy('');
    }
  }

  function recordPublishingInterest(step: CreatorOsInterestStep) {
    logCreatorOsInterest(step);
    setPublishingInterest(step);
  }

  const returnNotice = returnState === 'success'
    ? 'Thanks — we’re confirming your payment. Membership activates after verification.'
    : returnState === 'cancelled'
      ? 'Checkout was cancelled. Your free Vibe Atlas is unchanged.'
      : returnState === 'payment_problem'
        ? 'We couldn’t confirm payment. Please review your billing details and try again.'
        : '';
  const hasCollectorAccess = hasCollectorCapability(status);

  return (
    <main className="membership">
      <header className="membership__hero">
        <p className="membership__label">Vibe Atlas Collector Membership</p>
        <h1>Today’s drop is free.<br /><em>The whole Atlas is for collectors.</em></h1>
        <p>Browse today’s edition, save the cards that catch you, and build a grid that feels like yours. Collector Membership opens the back catalog and gives you more ways to style, save, and export what you make.</p>
      </header>
      {(returnNotice || notice) && <p className="membership__notice" role="status">{returnNotice || notice}</p>}
      <section className="membership__journey" aria-label="How Vibe Atlas grows with you">
        <article>
          <span>Discover</span>
          <h2>Today’s drop is for everybody.</h2>
          <p>Come for the star, save the cards that get you, and catch up on the last few drops.</p>
        </article>
        <article>
          <span>Collect</span>
          <h2>Missed one? Go back for it.</h2>
          <p>Collector membership opens past editions, actor collections, and the vibes you weren’t ready to let go.</p>
        </article>
        <article>
          <span>Create</span>
          <h2>Make your own legendary grid.</h2>
          <p>Start with the Vibe Atlas Canvas, then unlock premium styles, saved versions, and collector-quality exports for your most shareable grids.</p>
        </article>
      </section>
      <section className="membership__plans" aria-label="Membership options">
        <article>
          <p className="membership__label">Free</p>
          <h2>Catch today’s vibe</h2>
          <ul><li>Today’s complete card drop</li><li>Recent free editions</li><li>Individual card saves and a basic Canvas</li><li>Standard share export</li><li>Full Collection sync after sign-in</li></ul>
        </article>
        <article className="membership__featured">
          <p className="membership__label">Vibe Atlas Collector</p>
          <h2>$9 <small>/ month</small></h2>
          <ul><li>Complete historical edition archive</li><li>Expanded actor and vibe collections</li><li>Premium Canvas layouts and treatments</li><li>Persistent grids and saved versions</li><li>Collector-quality exports</li><li>Early access to new Fandom studio features</li></ul>
          <p className="membership__rollout">Archive and Canvas access will expand in stages. Founding members keep access as these benefits roll out.</p>
          {!user ? (
            <form onSubmit={sendLink} className="membership__sign-in">
              <label htmlFor="membership-email">Sign in to join</label>
              <div><input id="membership-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /><button disabled={busy === 'link'}>{busy === 'link' ? 'Sending…' : 'Email sign-in link'}</button></div>
            </form>
          ) : hasCollectorAccess ? (
            <div className="membership__member"><strong>Founding Member</strong><span>Signed in as {user.email}</span><button onClick={() => void openBilling('portal')} disabled={Boolean(busy)}>{busy === 'portal' ? 'Opening…' : 'Manage membership'}</button></div>
          ) : status?.state === 'past_due' ? (
            <div className="membership__join"><span>Signed in as {user.email}</span><b>Payment needs attention.</b><button onClick={() => void openBilling('portal')} disabled={Boolean(busy)}>{busy === 'portal' ? 'Opening…' : 'Review billing'}</button></div>
          ) : (
             <div className="membership__join"><span>Signed in as {user.email}</span><button onClick={() => void openBilling('checkout')} disabled={Boolean(busy)}>{busy === 'checkout' ? 'Opening checkout…' : 'Become a Founding Collector'}</button></div>
          )}
        </article>
      </section>
      <section className="membership__research" aria-labelledby="publishing-interest-title">
        <p className="membership__label">A question for collectors</p>
        <h2 id="publishing-interest-title">Do your finished grids become posts?</h2>
        <p>We’re exploring an optional way to take a finished Vibe Atlas grid into captioning, planning, and publishing tools. It would be optional—your Vibe Atlas collection would still stand on its own.</p>
        {publishingInterest === null ? (
          <>
            <button type="button" onClick={() => recordPublishingInterest('interest')}>I’d use this</button>
            <small>Research only—no access or release date promised.</small>
          </>
        ) : publishingInterest === 'interest' ? (
          <div className="membership__research-steps">
            <strong>What would you most want to do next?</strong>
            <div>
              <button type="button" onClick={() => recordPublishingInterest('caption')}>Write a caption</button>
              <button type="button" onClick={() => recordPublishingInterest('plan')}>Plan a post</button>
              <button type="button" onClick={() => recordPublishingInterest('publish')}>Publish</button>
              <button type="button" onClick={() => recordPublishingInterest('performance')}>Track performance</button>
            </div>
          </div>
        ) : <p className="membership__research-thanks" role="status">Thanks—this helps us decide whether a future publishing handoff is worth building.</p>}
      </section>
    </main>
  );
}