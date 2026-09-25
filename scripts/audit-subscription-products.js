import Stripe from "stripe";
import {
  auditSubscriptionProducts,
  validateMembershipPriceMappings,
} from "../netlify/functions/lib/subscription-product-audit.js";

function reportStripeFailure(error) {
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

  try {
    const stripe = new Stripe(secretKey);
    const report = await auditSubscriptionProducts({ stripe, apply });
    console.log(JSON.stringify(report, null, 2));
    if (report.ambiguous.length) process.exitCode = 2;
  } catch (error) {
    reportStripeFailure(error);
  }
}