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
      if (!accountId || !customerId) return false;
      const existingAccountId = await accountIdForCustomer(store, customerId);
      if (!existingAccountId || existingAccountId === accountId) {
        await this.linkCustomer(accountId, customerId);
        return true;
      }
      return false;
    },

    async hasProcessedEvent(eventId) {
      if (!eventId) return false;
      return Boolean(await store().get(`events/${keyPart(eventId)}`, {
        type: "json",
        consistency: "strong",
      }));
    },

    async claimEvent(event) {
      if (!event?.id) return false;
      const key = `events/${keyPart(event.id)}`;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const existing = await store().getWithMetadata(key, {
          type: "json",
          consistency: "strong",
        });
        if (existing?.data?.state === "processed") return false;
        const claimedAt = Date.parse(existing?.data?.claimedAt || "");
        if (Number.isFinite(claimedAt) && Date.now() - claimedAt < 5 * 60_000) return false;
        const result = await store().setJSON(key, {
          eventId: event.id,
          type: event.type || null,
          created: event.created || 0,
          state: "processing",
          claimedAt: new Date().toISOString(),
        }, existing?.etag ? { onlyIfMatch: existing.etag } : { onlyIfNew: true });
        if (result?.modified !== false) return true;
      }
      throw new Error("Stripe event claim changed too frequently to acquire safely.");
    },

    async releaseEvent(eventId) {
      if (eventId) await store().delete(`events/${keyPart(eventId)}`);
    },

    async recordProcessedEvent(event) {
      if (!event?.id) return;
      await store().setJSON(`events/${keyPart(event.id)}`, {
        eventId: event.id,
        type: event.type || null,
        created: event.created || 0,
        state: "processed",
        processedAt: new Date().toISOString(),
      });
    },

    async recordSubscription({
      accountId,
      customerId,
      subscriptionId,
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      metadata = {},
      capabilities = null,
      priceId = null,
      product = null,
      eventCreated = 0,
      eventId = "",
      eventType = "",
    }) {
      if (!accountId || !customerId || !subscriptionId) return false;
      const linkedAccountId = await accountIdForCustomer(store, customerId);
      if (linkedAccountId && linkedAccountId !== accountId) return false;
      const subscriptionKey = `subscriptions/${keyPart(accountId)}`;
      if (!await this.linkCustomerFromWebhook(accountId, customerId)) return false;
      const incoming = {
        accountId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        status: status || "inactive",
        currentPeriodEnd: currentPeriodEnd || null,
        cancelAtPeriodEnd: Boolean(cancelAtPeriodEnd),
        metadata,
        capabilities,
        priceId,
        product,
        eventCreated,
        eventId,
        eventType,
        updatedAt: new Date().toISOString(),
      };
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const existing = await store().getWithMetadata(subscriptionKey, {
          type: "json",
          consistency: "strong",
        });
        if (existing?.data && compareSubscriptionEvents(existing.data, incoming) >= 0) return false;
        const write = await store().setJSON(
          subscriptionKey,
          incoming,
          existing?.etag ? { onlyIfMatch: existing.etag } : { onlyIfNew: true },
        );
        if (write?.modified !== false) return true;
      }
      throw new Error("Membership state changed too frequently to reconcile safely.");
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
      const membership = {
        status: membershipStatus(subscription?.status),
        stripeStatus: subscription?.status || null,
        currentPeriodEnd: subscription?.currentPeriodEnd || null,
        cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
      };
      if (subscription?.metadata && Object.keys(subscription.metadata).length) membership.metadata = subscription.metadata;
      if (subscription?.capabilities) membership.capabilities = subscription.capabilities;
      if (subscription?.priceId) membership.priceId = subscription.priceId;
      if (subscription?.product) membership.product = subscription.product;
      return membership;
    },
  };
}

function compareSubscriptionEvents(left, right) {
  const created = Number(left.eventCreated || 0) - Number(right.eventCreated || 0);
  if (created) return created;
  if (left.stripeSubscriptionId === right.stripeSubscriptionId) {
    const rank = type => type === "customer.subscription.deleted" ? 3
      : type === "customer.subscription.updated" ? 2 : 1;
    const typeOrder = rank(left.eventType) - rank(right.eventType);
    if (typeOrder) return typeOrder;
  } else {
    const rank = status => status === "active" || status === "trialing" ? 2 : 1;
    const statusOrder = rank(left.status) - rank(right.status);
    if (statusOrder) return statusOrder;
  }
  return String(left.eventId || "").localeCompare(String(right.eventId || ""));
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
