import { getStore } from "@netlify/blobs";
import {
  recordSharedProgressReportingHealth,
} from "../../netlify/functions/lib/subscription-product-audit.js";

const [progressReportingFailures, key] = process.argv.slice(2);
const siteID = process.env.SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_SITE_ID?.trim();
const token = process.env.SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_TOKEN?.trim();

if (!siteID || !token || !key) {
  throw new Error("Blob integration worker is missing its isolated store configuration.");
}

const store = getStore({
  name: "subscription-product-audit-health",
  siteID,
  token,
});
const transition = await recordSharedProgressReportingHealth(
  store,
  Number(progressReportingFailures),
  { key },
);

process.stdout.write(`${JSON.stringify(transition)}\n`);