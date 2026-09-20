import Stripe from "stripe";
import {
  auditSubscriptionProducts,
  validateMembershipPriceMappings,
} from "../netlify/functions/lib/subscription-product-audit.js";

const apply = process.argv.includes("--apply");
const configOnly = process.argv.includes("--config-only");
const configuration = validateMembershipPriceMappings();
if (!configuration.valid) {
  console.error(JSON.stringify({ configuration }, null, 2));
  process.exitCode = 2;
} else if (configOnly) {
  console.log(JSON.stringify({ configuration }, null, 2));
}

if (!configOnly && configuration.valid) {
  const secretKey = process.env.STRIPE_SECRET_KEY || process.env.FANDOM_STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required.");

  const stripe = new Stripe(secretKey);
  const report = await auditSubscriptionProducts({ stripe, apply });
  console.log(JSON.stringify(report, null, 2));
  if (report.ambiguous.length) process.exitCode = 2;
}