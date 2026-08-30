const ENTITLED = new Set(["active", "trialing"]);

export function membershipStatus(stripeStatus) {
  if (ENTITLED.has(stripeStatus)) return "active";
  if (stripeStatus === "past_due") return "past_due";
  if (stripeStatus === "incomplete") return "incomplete";
  return "inactive";
}

/** The only application SQL which links a passwordless account to Stripe. */
export function createBillingRepository({ query }) {
  return {
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
        `SELECT s.status, s.current_period_end, s.cancel_at_period_end
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
        status: membershipStatus(subscription?.status),
        stripeStatus: subscription?.status || null,
        currentPeriodEnd: subscription?.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString() : null,
        cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
      };
    },
  };
}