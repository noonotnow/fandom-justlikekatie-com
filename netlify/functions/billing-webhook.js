import { createBillingHandlers, getBillingServices } from "./lib/billing.js";

// Webhooks intentionally bypass cookie auth and parse no JSON: Stripe signs bytes.
export default createBillingHandlers({ billing: getBillingServices() }).webhook;