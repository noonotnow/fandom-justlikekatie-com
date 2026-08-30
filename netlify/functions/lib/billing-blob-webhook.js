export async function applyBlobBillingEvent({ event, repository }) {
  const object = event?.data?.object;
  if (!object) return;

  if (event.type === "checkout.session.completed") {
    const accountId = object.metadata?.fandom_account_id;
    const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
    await repository.linkCustomerFromWebhook(accountId, customerId);
    return;
  }

  if (!event.type.startsWith("customer.subscription.")) return;

  const accountId = object.metadata?.fandom_account_id
    || await repository.accountForCustomer(typeof object.customer === "string" ? object.customer : object.customer?.id);
  const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
  const currentPeriodEnd = object.current_period_end
    ? new Date(object.current_period_end * 1000).toISOString()
    : null;
  await repository.recordSubscription({
    accountId,
    customerId,
    subscriptionId: object.id,
    status: event.type === "customer.subscription.deleted" ? "canceled" : object.status,
    currentPeriodEnd,
    cancelAtPeriodEnd: object.cancel_at_period_end,
    eventCreated: event.created,
  });
}
