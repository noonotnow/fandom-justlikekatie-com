const STORE_NAME = "fandom-billing";
const IDENTITY_CONFLICT_KEY = "operations/stripe-identity-conflict";
export const BILLING_EVENT_RETENTION_DAYS = 30;
const EVENT_RETENTION_MS = BILLING_EVENT_RETENTION_DAYS * 24 * 60 * 60_000;
const EVENT_CLEANUP_SCAN_LIMIT = 100;
const EVENT_CLEANUP_DELETE_LIMIT = 25;
const EVENT_EXPIRATIONS_PREFIX = "event-expirations/";

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
      const processedAt = new Date().toISOString();
      const eventKey = `events/${keyPart(event.id)}`;
      await store().setJSON(eventKey, {
        eventId: event.id,
        type: event.type || null,
        created: event.created || 0,
        state: "processed",
        processedAt,
      });
      await store().setJSON(expirationKey(processedAt, event.id), {
        eventKey,
        processedAt,
      });
    },

    async pruneProcessedEvents({ now = Date.now() } = {}) {
      const cutoff = now - EVENT_RETENTION_MS;
      const listing = await firstListingPage(store(), {
        prefix: EVENT_EXPIRATIONS_PREFIX,
      });
      let deleted = 0;
      for (const blob of (listing?.blobs || []).slice(0, EVENT_CLEANUP_SCAN_LIMIT)) {
        if (deleted >= EVENT_CLEANUP_DELETE_LIMIT) break;
        const expiration = await store().get(blob.key, {
          type: "json",
          consistency: "strong",
        });
        const indexedAt = Date.parse(expiration?.processedAt || "");
        if (!expiration?.eventKey || !Number.isFinite(indexedAt)) {
          await store().delete(blob.key);
          continue;
        }
        if (indexedAt >= cutoff) break;
        const receipt = await store().get(expiration.eventKey, {
          type: "json",
          consistency: "strong",
        });
        const processedAt = Date.parse(receipt?.processedAt || "");
        if (receipt?.state === "processed"
          && Number.isFinite(processedAt)
          && processedAt < cutoff) {
          await store().delete(expiration.eventKey);
          deleted += 1;
        }
        await store().delete(blob.key);
      }
      return deleted;
    },

    async recordIdentityConflict({ eventCategory }) {
      const category = eventCategory === "checkout" ? "checkout" : "subscription";
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const existing = await store().getWithMetadata(IDENTITY_CONFLICT_KEY, {
          type: "json",
          consistency: "strong",
        });
        const occurredAt = new Date().toISOString();
        const record = {
          schemaVersion: 1,
          type: "billing_reconciliation_rejected",
          reason: "stripe_identity_conflict",
          eventCategory: category,
          count: Math.min(Number(existing?.data?.count || 0) + 1, Number.MAX_SAFE_INTEGER),
          firstOccurredAt: existing?.data?.firstOccurredAt || occurredAt,
          lastOccurredAt: occurredAt,
        };
        const write = await store().setJSON(
          IDENTITY_CONFLICT_KEY,
          record,
          existing?.etag ? { onlyIfMatch: existing.etag } : { onlyIfNew: true },
        );
        if (write?.modified !== false) return record;
      }
      throw new Error("Billing identity conflict record changed too frequently to update safely.");
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
      if (!accountId || !customerId || !subscriptionId) return { outcome: "invalid" };
      const linkedAccountId = await accountIdForCustomer(store, customerId);
      if (linkedAccountId && linkedAccountId !== accountId) return { outcome: "identity_conflict" };
      const subscriptionKey = `subscriptions/${keyPart(accountId)}`;
      if (!await this.linkCustomerFromWebhook(accountId, customerId)) return { outcome: "identity_conflict" };
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
        if (existing?.data && compareSubscriptionEvents(existing.data, incoming) >= 0) return { outcome: "stale" };
        const write = await store().setJSON(
          subscriptionKey,
          incoming,
          existing?.etag ? { onlyIfMatch: existing.etag } : { onlyIfNew: true },
        );
        if (write?.modified !== false) return { outcome: "applied" };
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

async function firstListingPage(blobStore, options) {
  const pages = blobStore.list({ ...options, paginate: true });
  for await (const page of pages) return page;
  return { blobs: [] };
}

function expirationKey(processedAt, eventId) {
  const expiresAt = new Date(Date.parse(processedAt) + EVENT_RETENTION_MS).toISOString();
  return `${EVENT_EXPIRATIONS_PREFIX}${expiresAt}/${keyPart(eventId)}`;
}
