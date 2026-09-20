import {
  CAPABILITIES,
  MEMBERSHIP_PRICE_MAPPINGS,
  explicitProductForMembership,
  productForPrice,
} from "./capabilities.js";

const ACTIVE_STATUSES = ["active", "trialing"];

export function validateMembershipPriceMappings(env = process.env) {
  const configured = MEMBERSHIP_PRICE_MAPPINGS.flatMap(({ product, envKeys }) =>
    envKeys
      .filter(envKey => typeof env[envKey] === "string" && env[envKey].trim())
      .map(envKey => ({ product, envKey, priceId: env[envKey].trim() })));
  const missing = CAPABILITIES.filter(product =>
    !configured.some(mapping => mapping.product === product));
  const duplicate = [];
  const conflicting = [];

  for (const product of CAPABILITIES) {
    const mappings = configured.filter(mapping => mapping.product === product);
    if (mappings.length > 1) {
      const issue = { product, envKeys: mappings.map(mapping => mapping.envKey) };
      if (new Set(mappings.map(mapping => mapping.priceId)).size === 1) duplicate.push(issue);
      else conflicting.push(issue);
    }
  }

  for (const priceId of new Set(configured.map(mapping => mapping.priceId))) {
    const mappings = configured.filter(mapping => mapping.priceId === priceId);
    const products = [...new Set(mappings.map(mapping => mapping.product))];
    if (products.length > 1) {
      conflicting.push({
        products,
        envKeys: mappings.map(mapping => mapping.envKey),
      });
    }
  }

  return {
    valid: missing.length === 0 && duplicate.length === 0 && conflicting.length === 0,
    configured: configured.map(({ product, envKey }) => ({ product, envKey })),
    missing,
    duplicate,
    conflicting,
  };
}

export async function auditSubscriptionProducts({
  stripe,
  env = process.env,
  apply = false,
  now = () => new Date().toISOString(),
}) {
  const report = {
    auditedAt: now(),
    apply,
    activeSubscriptions: 0,
    identified: 0,
    updated: 0,
    ambiguous: [],
  };

  for (const status of ACTIVE_STATUSES) {
    for await (const subscription of stripe.subscriptions.list({ status, limit: 100 })) {
      report.activeSubscriptions += 1;
      const decision = classifySubscription(subscription, env);
      if (!decision.product) {
        report.ambiguous.push({
          subscriptionId: subscription.id,
          status,
          reason: decision.reason,
          priceIds: decision.priceIds,
        });
        continue;
      }
      report.identified += 1;
      const metadata = subscription.metadata || {};
      if (metadata.product === decision.product && metadata.capability === decision.product) continue;
      if (apply) {
        await stripe.subscriptions.update(subscription.id, {
          metadata: { ...metadata, product: decision.product, capability: decision.product },
        });
        report.updated += 1;
      }
    }
  }
  return report;
}

export function classifySubscription(subscription, env = process.env) {
  const items = subscription?.items?.data || [];
  const priceIds = [...new Set(items.map(item => item?.price?.id).filter(Boolean))];
  if (items.length !== 1 || priceIds.length !== 1) {
    return { product: null, reason: "subscription_must_have_one_identifiable_price", priceIds };
  }
  const priceProduct = productForPrice(priceIds[0], env);
  const metadata = subscription.metadata || {};
  const metadataProduct = explicitProductForMembership({ metadata }, {});
  const hasProductMetadata = [
    "capabilities", "capability", "products", "product_capability", "product", "product_name",
  ].some(key => metadata[key]);
  if (!priceProduct) return { product: null, reason: "unconfigured_price", priceIds };
  if (hasProductMetadata && !metadataProduct) {
    return { product: null, reason: "invalid_product_metadata", priceIds };
  }
  if (metadataProduct && metadataProduct !== priceProduct) {
    return { product: null, reason: "metadata_price_conflict", priceIds };
  }
  return { product: priceProduct, reason: null, priceIds };
}