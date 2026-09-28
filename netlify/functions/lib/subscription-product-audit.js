import {
  CAPABILITIES,
  MEMBERSHIP_PRICE_MAPPINGS,
  explicitProductForMembership,
  productForPrice,
} from "./capabilities.js";
import { getWithResolvedEtag } from "./blob-store.js";

const ACTIVE_STATUSES = ["active", "trialing"];

const PROGRESS_REPORTING_STATE_KEY = "progress-reporting-health";
const PROGRESS_REPORTING_STATE_UPDATE_ATTEMPTS = 8;
export const PROGRESS_REPORTING_ALERT_THRESHOLD = 2;
export const PROGRESS_REPORTING_OPERATOR_ALERT =
  "Operator alert: Stripe audit progress reporting failed in repeated runs. Audit results and completed subscription updates were not affected.";
export const PROGRESS_REPORTING_NOTIFICATION_REJECTED =
  "Operator alert delivery was rejected. Stripe audit results and completed subscription updates were not affected.";

export async function sendProgressReportingOperatorAlert({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const recipients = String(env.FANDOM_ADMIN_EMAILS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  if (!env.RESEND_API_KEY || !env.FANDOM_AUTH_FROM_EMAIL || recipients.length === 0) {
    throw new Error("Stripe reporting notifications are not configured.");
  }
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "stripe-progress-reporting:persistent-failure",
    },
    body: JSON.stringify({
      from: env.FANDOM_AUTH_FROM_EMAIL,
      to: recipients,
      subject: "[Fandom operations] Stripe audit reporting needs attention",
      text: [
        "Stripe audit progress reporting failed in repeated runs.",
        "Audit results and completed subscription updates were not affected.",
        "Review the private audit environment before the next unattended run.",
      ].join("\n"),
    }),
  });
  if (!response.ok) {
    throw new Error(`Stripe reporting notification delivery failed (${response.status}).`);
  }
}

export function settleProgressReportingAlertDelivery(state, delivered) {
  return {
    consecutiveFailureRuns: Number.isSafeInteger(state?.consecutiveFailureRuns)
      ? state.consecutiveFailureRuns
      : 0,
    alertDelivery: delivered ? "delivered" : "rejected",
  };
}

export function progressReportingAlertTransition(
  previousState,
  progressReportingFailures,
  threshold = PROGRESS_REPORTING_ALERT_THRESHOLD,
) {
  const safeThreshold = Number.isSafeInteger(threshold) && threshold > 0
    ? threshold
    : PROGRESS_REPORTING_ALERT_THRESHOLD;
  const previousRuns = Number.isSafeInteger(previousState?.consecutiveFailureRuns)
    && previousState.consecutiveFailureRuns > 0
    ? Math.min(previousState.consecutiveFailureRuns, safeThreshold)
    : 0;
  const hasFailures = Number.isSafeInteger(progressReportingFailures)
    && progressReportingFailures > 0;
  const consecutiveFailureRuns = hasFailures
    ? Math.min(previousRuns + 1, safeThreshold)
    : 0;
  const shouldAlert = hasFailures
    && previousRuns < safeThreshold
    && consecutiveFailureRuns === safeThreshold;
  const previousDelivery = ["pending", "delivered", "rejected"].includes(
    previousState?.alertDelivery,
  )
    ? previousState.alertDelivery
    : "not_attempted";
  const alertDelivery = !hasFailures
    ? (previousRuns >= safeThreshold ? "recovered" : "not_attempted")
    : shouldAlert
      ? "pending"
      : previousRuns >= safeThreshold
        ? previousDelivery
        : "not_attempted";

  return {
    state: { consecutiveFailureRuns, alertDelivery },
    shouldAlert,
  };
}

export async function recordSharedProgressReportingHealth(
  store,
  progressReportingFailures,
  { key = PROGRESS_REPORTING_STATE_KEY } = {},
) {
  for (let attempt = 0; attempt < PROGRESS_REPORTING_STATE_UPDATE_ATTEMPTS; attempt += 1) {
    const current = await getWithResolvedEtag(store, key, {
      type: "json",
    });
    if (current?.data && !current.etag) {
      throw new Error("Progress reporting health state cannot be updated safely.");
    }
    const transition = progressReportingAlertTransition(
      current?.data,
      progressReportingFailures,
    );
    const write = await store.setJSON(
      key,
      transition.state,
      current?.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true },
    );
    if (write?.modified === false) continue;
    return transition;
  }
  throw new Error("Progress reporting health state update was contended.");
}

export async function settleSharedProgressReportingAlertDelivery(
  store,
  expectedState,
  delivered,
  { key = PROGRESS_REPORTING_STATE_KEY } = {},
) {
  for (let attempt = 0; attempt < PROGRESS_REPORTING_STATE_UPDATE_ATTEMPTS; attempt += 1) {
    const current = await getWithResolvedEtag(store, key, {
      type: "json",
    });
    if (!current?.etag) {
      throw new Error("Progress reporting alert delivery cannot be updated safely.");
    }
    if (
      current.data?.consecutiveFailureRuns !== expectedState?.consecutiveFailureRuns
      || current.data?.alertDelivery !== "pending"
    ) {
      return current.data;
    }
    const state = settleProgressReportingAlertDelivery(current.data, delivered);
    const write = await store.setJSON(
      key,
      state,
      { onlyIfMatch: current.etag },
    );
    if (write?.modified === false) continue;
    return state;
  }
  throw new Error("Progress reporting alert delivery update was contended.");
}

export function validateMembershipPriceMappings(env = process.env) {
  const configured = MEMBERSHIP_PRICE_MAPPINGS.flatMap(({ product, envKeys }) =>
    envKeys
      .filter(envKey => typeof env[envKey] === "string" && env[envKey].trim())
      .map(envKey => ({ product, envKey, priceId: env[envKey].trim() })));
  const missing = CAPABILITIES.filter(product =>
    !configured.some(mapping => mapping.product === product));
  const conflicting = [];

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
    valid: missing.length === 0 && conflicting.length === 0,
    configured: configured.map(({ product, envKey }) => ({ product, envKey })),
    missing,
    conflicting,
  };
}

export async function auditSubscriptionProducts({
  stripe,
  env = process.env,
  apply = false,
  now = () => new Date().toISOString(),
  onUpdateProgress = () => {},
}) {
  const report = {
    auditedAt: now(),
    apply,
    activeSubscriptions: 0,
    identified: 0,
    updated: 0,
    progressReportingFailures: 0,
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
        try {
          await onUpdateProgress({ updated: report.updated });
        } catch {
          report.progressReportingFailures += 1;
          // Progress reporting must not change the outcome of a completed Stripe write.
        }
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
