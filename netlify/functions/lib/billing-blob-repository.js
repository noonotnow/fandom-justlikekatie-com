const STORE_NAME = "fandom-billing";

const keyPart = value => encodeURIComponent(String(value));

export function createBlobBillingRepository({ getStore, context }) {
  const store = () => getStore(STORE_NAME, context, { consistency: "strong" });

  return {
    async customerForAccount(accountId) {
      const account = await store().get(`accounts/${keyPart(accountId)}`, {
        type: "json",
        consistency: "strong",
      });
      return account?.stripeCustomerId || null;
    },

    async linkCustomer(accountId, customerId) {
      await store().setJSON(`accounts/${keyPart(accountId)}`, {
        accountId,
        stripeCustomerId: customerId,
        updatedAt: new Date().toISOString(),
      });
      await store().setJSON(`customers/${keyPart(customerId)}`, {
        accountId,
        stripeCustomerId: customerId,
        updatedAt: new Date().toISOString(),
      });
      return customerId;
    },

    async linkCustomerFromWebhook(accountId, customerId) {
      if (!accountId || !customerId) return;
      const existingAccountId = await accountIdForCustomer(store, customerId);
      if (!existingAccountId || existingAccountId === accountId) {
        await this.linkCustomer(accountId, customerId);
      }
    },

    async recordSubscription({
      accountId,
      customerId,
      subscriptionId,
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      eventCreated = 0,
    }) {
      if (!accountId || !customerId || !subscriptionId) return;
      const subscriptionKey = `subscriptions/${keyPart(accountId)}`;
      const existing = await store().get(subscriptionKey, {
        type: "json",
        consistency: "strong",
      });
      if (existing?.eventCreated > eventCreated) return;
      await this.linkCustomerFromWebhook(accountId, customerId);
      await store().setJSON(subscriptionKey, {
        accountId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        status: status || "inactive",
        currentPeriodEnd: currentPeriodEnd || null,
        cancelAtPeriodEnd: Boolean(cancelAtPeriodEnd),
        eventCreated,
        updatedAt: new Date().toISOString(),
      });
    },

    async accountForCustomer(customerId) {
      if (!customerId) return null;
      return accountIdForCustomer(store, customerId);
    },

    async membershipForAccount(accountId) {
      const subscription = await store().get(`subscriptions/${keyPart(accountId)}`, {
        type: "json",
        consistency: "strong",
      });
      return {
        status: membershipStatus(subscription?.status),
        stripeStatus: subscription?.status || null,
        currentPeriodEnd: subscription?.currentPeriodEnd || null,
        cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
      };
    },
  };
}

async function accountIdForCustomer(store, customerId) {
  const customer = await store().get(`customers/${keyPart(customerId)}`, {
    type: "json",
    consistency: "strong",
  });
  return customer?.accountId || null;
}

function membershipStatus(stripeStatus) {
  if (stripeStatus === "active" || stripeStatus === "trialing") return "active";
  if (stripeStatus === "past_due") return "past_due";
  if (stripeStatus === "incomplete") return "incomplete";
  return "inactive";
}
