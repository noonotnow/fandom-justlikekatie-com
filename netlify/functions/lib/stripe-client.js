import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

/**
 * Replit connection credentials are deliberately fetched for each client
 * construction: connector credentials can rotate while a serverless instance
 * is warm. External Netlify deployments may instead provide the credentials
 * through server-only environment variables.
 */
export async function getStripeCredentials({ env = process.env, fetchImpl = fetch } = {}) {
  const directSecretKey = env.STRIPE_SECRET_KEY || env.FANDOM_STRIPE_SECRET_KEY;
  const directWebhookSecret = env.STRIPE_WEBHOOK_SECRET || env.FANDOM_STRIPE_WEBHOOK_SECRET;
  if (directSecretKey || directWebhookSecret) {
    if (!directSecretKey) throw new Error("STRIPE_SECRET_KEY is required for external Stripe billing.");
    if (!directWebhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is required for external Stripe billing.");
    return { secretKey: directSecretKey, webhookSecret: directWebhookSecret };
  }

  const hostname = env.REPLIT_CONNECTORS_HOSTNAME;
  const token = env.REPL_IDENTITY
    ? `repl ${env.REPL_IDENTITY}`
    : env.WEB_REPL_RENEWAL ? `depl ${env.WEB_REPL_RENEWAL}` : null;
  if (!hostname || !token) {
    throw new Error("Stripe is not connected to this Replit deployment.");
  }
  const response = await fetchImpl(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    { headers: { Accept: "application/json", X_REPLIT_TOKEN: token }, signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) throw new Error(`Unable to load Stripe connection credentials (${response.status}).`);
  const settings = (await response.json()).items?.[0]?.settings;
  if (!settings?.secret_key) throw new Error("Stripe integration is connected without a secret key.");
  return { secretKey: settings.secret_key, webhookSecret: settings.webhook_secret };
}

export async function getUncachableStripeClient(options) {
  const { secretKey } = await getStripeCredentials(options);
  return new Stripe(secretKey);
}

export async function getStripeSync(options = {}) {
  const env = options.env || process.env;
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required for Stripe billing.");
  const { secretKey, webhookSecret } = await getStripeCredentials(options);
  return new StripeSync({
    poolConfig: { connectionString: env.DATABASE_URL, max: 3 },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret || "",
    revalidateObjectsViaStripeApi: ["subscription"],
  });
}