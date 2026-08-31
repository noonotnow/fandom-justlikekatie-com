import { useEffect, useState } from 'react';
import { getPublicSession, requestMagicLink, type PublicUser } from '../../utils/publicAccount';
import {
  createMembershipCheckout,
  createMembershipPortal,
  getMembershipStatus,
  logMembershipEvent,
  type MembershipStatus,
} from '../../utils/membership';

interface Props {
  onStatusChange?: (status: MembershipStatus) => void;
}

export function Membership({ onStatusChange }: Props) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<MembershipStatus | null>(null);
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const returnState = new URLSearchParams(window.location.search).get('membership');

  useEffect(() => {
    logMembershipEvent('membership_view');
    void getPublicSession().then(async session => {
      setUser(session);
      if (!session) return;
      const membership = await getMembershipStatus();
      setStatus(membership);
      onStatusChange?.(membership);
      if (membership.isMember) logMembershipEvent('membership_activated');
    }).catch(error => setNotice(error instanceof Error ? error.message : 'Account status could not be checked.'));
  }, []);

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

  const returnNotice = returnState === 'success'
    ? 'Thanks — we’re confirming your payment. Membership activates after verification.'
    : returnState === 'cancelled'
      ? 'Checkout was cancelled. Your free Vibe Atlas is unchanged.'
      : returnState === 'payment_problem'
        ? 'We couldn’t confirm payment. Please review your billing details and try again.'
        : '';

  return (
    <main className="membership">
      <header className="membership__hero">
        <p className="membership__eyebrow">Vibe Atlas Membership</p>
        <h1>Keep every card<br /><em>worth saving.</em></h1>
        <p>Daily discovery stays free. Founding Members can sync collections across devices, build grids from saved cards, and export premium share cards.</p>
      </header>
      {(returnNotice || notice) && <p className="membership__notice" role="status">{returnNotice || notice}</p>}
      <section className="membership__plans" aria-label="Membership options">
        <article>
          <p className="membership__label">Free</p>
          <h2>Always yours to explore</h2>
          <ul><li>Daily browsing and sharing</li><li>Basic saves on this device</li><li>Every daily edition</li></ul>
        </article>
        <article className="membership__featured">
          <p className="membership__label">Founding Member</p>
          <h2>$9 <small>/ month</small></h2>
          <ul><li>Cloud Collection sync across devices</li><li>Grid Builder for your saved worlds</li><li>Premium share-card exports</li></ul>
          {!user ? (
            <form onSubmit={sendLink} className="membership__sign-in">
              <label htmlFor="membership-email">Sign in to join</label>
              <div><input id="membership-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /><button disabled={busy === 'link'}>{busy === 'link' ? 'Sending…' : 'Email sign-in link'}</button></div>
            </form>
          ) : status?.isMember ? (
            <div className="membership__member"><strong>Founding Member</strong><span>Signed in as {user.email}</span><button onClick={() => void openBilling('portal')} disabled={Boolean(busy)}>{busy === 'portal' ? 'Opening…' : 'Manage membership'}</button></div>
          ) : status?.state === 'past_due' ? (
            <div className="membership__join"><span>Signed in as {user.email}</span><b>Payment needs attention.</b><button onClick={() => void openBilling('portal')} disabled={Boolean(busy)}>{busy === 'portal' ? 'Opening…' : 'Review billing'}</button></div>
          ) : (
            <div className="membership__join"><span>Signed in as {user.email}</span><button onClick={() => void openBilling('checkout')} disabled={Boolean(busy)}>{busy === 'checkout' ? 'Opening checkout…' : 'Become a Founding Member'}</button></div>
          )}
        </article>
      </section>
    </main>
  );
}