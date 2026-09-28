import Stripe from "stripe";
import {
  auditSubscriptionProducts,
  PROGRESS_REPORTING_OPERATOR_ALERT,
  PROGRESS_REPORTING_NOTIFICATION_REJECTED,
  recordSharedProgressReportingHealth,
  sendProgressReportingOperatorAlert,
  settleSharedProgressReportingAlertDelivery,
  validateMembershipPriceMappings,
} from "../netlify/functions/lib/subscription-product-audit.js";
import { getBlobStore } from "../netlify/functions/lib/blob-store.js";

const PROGRESS_REPORTING_STORAGE_WARNING =
  "Operator warning: Stripe audit outage history was not updated in shared storage. Configure SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_SITE_ID and SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_TOKEN, then retry.";

function progressReportingStore(env = process.env) {
  const siteID = env.SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_SITE_ID?.trim();
  const token = env.SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_TOKEN?.trim();
  if (!siteID || !token) {
    throw new Error("Shared Stripe audit health storage is not configured.");
  }
  return getBlobStore("subscription-product-audit-health", undefined, {
    siteID,
    token,
  });
}

async function recordProgressReportingHealth(progressReportingFailures) {
  try {
    const store = progressReportingStore();
    const transition = await recordSharedProgressReportingHealth(
      store,
      progressReportingFailures,
    );
    if (!transition.shouldAlert) return;

    console.error(PROGRESS_REPORTING_OPERATOR_ALERT);
    let delivered = false;
    try {
      await sendProgressReportingOperatorAlert();
      delivered = true;
    } catch {
      console.error(PROGRESS_REPORTING_NOTIFICATION_REJECTED);
    }
    await settleSharedProgressReportingAlertDelivery(
      store,
      transition.state,
      delivered,
    );
  } catch {
    // Health tracking must not change Stripe writes or audit outcomes.
    console.error(PROGRESS_REPORTING_STORAGE_WARNING);
  }
}

function reportStripeFailure(error, appliedUpdates = 0) {
  if (appliedUpdates > 0) {
    const noun = appliedUpdates === 1 ? "update" : "updates";
    console.error(
      `Stripe subscription updates stopped after ${appliedUpdates} successful ${noun}. This run was partially applied. Review current Stripe subscription state before retrying.`,
    );
    process.exitCode = 1;
    return;
  }

  const authenticationFailure = error?.type === "StripeAuthenticationError"
    || error?.statusCode === 401;
  const transientFailure = error?.type === "StripeConnectionError"
    || error?.code === "ETIMEDOUT"
    || error?.code === "ECONNRESET";

  if (authenticationFailure) {
    console.error(
      "Stripe authentication failed. Verify the configured secret key and Stripe account, then retry the audit.",
    );
  } else if (transientFailure) {
    console.error(
      "Stripe connection failed. Check network access and Stripe service status, then retry the audit.",
    );
  } else {
    console.error(
      "Stripe audit request failed. Check Stripe access and service status, then retry the audit.",
    );
  }
  process.exitCode = 1;
}

const apply = process.argv.includes("--apply");
const configOnly = process.argv.includes("--config-only");
const allowMissing = process.argv.includes("--allow-missing");
const configuration = validateMembershipPriceMappings();
const configurationValid = configuration.valid
  || (allowMissing
    && configuration.conflicting.length === 0);
if (!configurationValid) {
  console.error(JSON.stringify({ configuration }, null, 2));
  process.exitCode = 2;
} else if (configOnly) {
  console.log(JSON.stringify({ configuration }, null, 2));
}

if (!configOnly && configurationValid) {
  const secretKey = process.env.STRIPE_SECRET_KEY || process.env.FANDOM_STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required.");

  let appliedUpdates = 0;
  try {
    const stripe = new Stripe(secretKey);
    const report = await auditSubscriptionProducts({
      stripe,
      apply,
      onUpdateProgress: ({ updated }) => {
        appliedUpdates = updated;
      },
    });
    console.log(JSON.stringify(report, null, 2));
    await recordProgressReportingHealth(report.progressReportingFailures);
    if (report.ambiguous.length) process.exitCode = 2;
  } catch (error) {
    reportStripeFailure(error, appliedUpdates);
  }
}
