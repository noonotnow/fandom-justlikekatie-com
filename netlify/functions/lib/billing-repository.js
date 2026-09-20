const ENTITLED = new Set(["active", "trialing"]);
export const BILLING_EVENT_RETENTION_DAYS = 30;
const EVENT_CLEANUP_DELETE_LIMIT = 25;

export function membershipStatus(stripeStatus) {
  if (ENTITLED.has(stripeStatus)) return "active";
  if (stripeStatus === "past_due") return "past_due";
  if (stripeStatus === "incomplete") return "incomplete";
  return "inactive";
}

/** The only application SQL which links a passwordless account to Stripe. */
export function createBillingRepository({ query }) {
  return {
    async ensureApplicationSchema() {
      await query(
        `CREATE TABLE IF NOT EXISTS public.fandom_billing_events (
           stripe_event_id TEXT PRIMARY KEY,
           event_type TEXT,
           event_created BIGINT NOT NULL DEFAULT 0,
           state TEXT NOT NULL DEFAULT 'processing',
           claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
         );
         ALTER TABLE public.fandom_billing_events
           ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'processed',
           ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
      );
    },
    async hasProcessedEvent(eventId) {
      const result = await query(
        "SELECT 1 FROM public.fandom_billing_events WHERE stripe_event_id = $1 AND state = 'processed'",
        [eventId],
      );
      return Boolean(result.rows[0]);
    },
    async claimEvent(event) {
      const result = await query(
        `INSERT INTO public.fandom_billing_events
           (stripe_event_id, event_type, event_created, state, claimed_at)
         VALUES ($1, $2, $3, 'processing', NOW())
         ON CONFLICT (stripe_event_id) DO UPDATE
           SET event_type = EXCLUDED.event_type,
               event_created = EXCLUDED.event_created,
               state = 'processing',
               claimed_at = NOW()
         WHERE public.fandom_billing_events.state <> 'processed'
           AND public.fandom_billing_events.claimed_at < NOW() - INTERVAL '5 minutes'
         RETURNING stripe_event_id`,
        [event.id, event.type || null, event.created || 0],
      );
      return Boolean(result.rows[0]);
    },
    async releaseEvent(eventId) {
      await query(
        "DELETE FROM public.fandom_billing_events WHERE stripe_event_id = $1 AND state = 'processing'",
        [eventId],
      );
    },
    async recordProcessedEvent(event) {
      await query(
        `UPDATE public.fandom_billing_events
            SET state = 'processed', processed_at = NOW()
          WHERE stripe_event_id = $1 AND state = 'processing'`,
        [event.id],
      );
    },
    async pruneProcessedEvents() {
      const result = await query(
        `WITH expired AS (
           SELECT stripe_event_id
             FROM public.fandom_billing_events
            WHERE state = 'processed'
              AND processed_at < NOW() - ($1 * INTERVAL '1 day')
             ORDER BY processed_at, stripe_event_id
            LIMIT $2
         )
         DELETE FROM public.fandom_billing_events events
          USING expired
          WHERE events.stripe_event_id = expired.stripe_event_id
         RETURNING events.stripe_event_id`,
        [BILLING_EVENT_RETENTION_DAYS, EVENT_CLEANUP_DELETE_LIMIT],
      );
      return result.rows.length;
    },
    async linkCustomer(accountId, customerId) {
      const result = await query(
        `INSERT INTO public.fandom_billing_accounts (account_id, stripe_customer_id)
         VALUES ($1, $2)
         ON CONFLICT (account_id) DO UPDATE
           SET stripe_customer_id = public.fandom_billing_accounts.stripe_customer_id,
               updated_at = NOW()
         RETURNING stripe_customer_id`,
        [accountId, customerId],
      );
      return result.rows[0]?.stripe_customer_id;
    },
    async customerForAccount(accountId) {
      const result = await query(
        "SELECT stripe_customer_id FROM public.fandom_billing_accounts WHERE account_id = $1",
        [accountId],
      );
      return result.rows[0]?.stripe_customer_id || null;
    },
    async membershipForAccount(accountId) {
      const result = await query(
         `SELECT s.id, s.status, s.current_period_end, s.cancel_at_period_end,
                  s.metadata
           FROM public.fandom_billing_accounts b
           JOIN stripe.subscriptions s ON s.customer = b.stripe_customer_id
          WHERE b.account_id = $1
          ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'trialing' THEN 1 ELSE 2 END,
                   s.current_period_end DESC NULLS LAST
          LIMIT 1`,
        [accountId],
      );
      const subscription = result.rows[0];
      return {
        subscriptionId: subscription?.id || null,
        status: membershipStatus(subscription?.status),
        stripeStatus: subscription?.status || null,
        currentPeriodEnd: subscription?.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString() : null,
        cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
        metadata: subscription?.metadata || {},
      };
    },
  };
}
