import { explicitProductForMembership } from "./capabilities.js";

export async function applyBlobBillingEvent({ event, repository, env = process.env }) {
  if (!event?.id) return { ignored: true };
  if (!await repository.claimEvent(event)) return { duplicate: true };
  try {
    const object = event?.data?.object;
    if (!object) {
      await repository.recordProcessedEvent?.(event);
      return { ignored: true };
    }

    if (event.type === "checkout.session.completed") {
      const accountId = object.metadata?.fandom_account_id;
      const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
      const linked = await repository.linkCustomerFromWebhook(accountId, customerId);
      if (!linked && accountId && customerId) {
        const operation = await repository.recordIdentityConflict({ eventCategory: "checkout" });
        await repository.recordProcessedEvent?.(event);
        return { rejected: true, reason: "stripe_identity_conflict", operation };
      }
      await repository.recordProcessedEvent?.(event);
      return { applied: true };
    }

    if (!event.type.startsWith("customer.subscription.")) {
      await repository.recordProcessedEvent?.(event);
      return { ignored: true };
    }

    const accountId = object.metadata?.fandom_account_id
      || await repository.accountForCustomer(typeof object.customer === "string" ? object.customer : object.customer?.id);
    const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
    const currentPeriodEnd = object.current_period_end
      ? new Date(object.current_period_end * 1000).toISOString()
      : null;
    const priceId = object.items?.data?.[0]?.price?.id || object.plan?.id || null;
    const metadata = capabilityMetadata(object.metadata);
    const result = await repository.recordSubscription({
      accountId,
      customerId,
      subscriptionId: object.id,
      status: event.type === "customer.subscription.deleted" ? "canceled" : object.status,
      currentPeriodEnd,
      cancelAtPeriodEnd: object.cancel_at_period_end,
      metadata,
      capabilities: object.metadata?.capabilities || object.metadata?.products || null,
      priceId,
      product: explicitProductForMembership({ metadata, priceId }, env),
      eventCreated: event.created,
      eventId: event.id,
      eventType: event.type,
    });
    if (result?.outcome === "identity_conflict") {
      const operation = await repository.recordIdentityConflict({ eventCategory: "subscription" });
      await repository.recordProcessedEvent?.(event);
      return { rejected: true, reason: "stripe_identity_conflict", operation };
    }
    await repository.recordProcessedEvent?.(event);
    return result?.outcome === "applied" ? { applied: true } : { ignored: true };
  } catch (error) {
    await repository.releaseEvent?.(event.id);
    throw error;
  }
}

function capabilityMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return {};
  return Object.fromEntries(Object.entries(metadata).filter(([key]) =>
    ["capabilities", "products", "product", "product_name", "price_id", "priceId"].includes(key)));
}
