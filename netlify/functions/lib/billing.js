import pg from "pg";
import { runMigrations } from "stripe-replit-sync";
import { createBillingRepository } from "./billing-repository.js";
import { createBlobBillingRepository } from "./billing-blob-repository.js";
import { applyBlobBillingEvent } from "./billing-blob-webhook.js";
import { getBlobStore } from "./blob-store.js";
import { getStripeCredentials, getStripeSync, getUncachableStripeClient } from "./stripe-client.js";
import { json } from "./public-auth.js";

let initialized;

export function createBillingServices({
  env = process.env,
  stripeClient = getUncachableStripeClient,
  stripeSync = getStripeSync,
  poolFactory = config => new pg.Pool(config),
  runStripeMigrations = runMigrations,
  getStore = getBlobStore,
} = {}) {
  const useBlobBilling = env.NETLIFY === "true"
    || Boolean(env.AWS_LAMBDA_FUNCTION_NAME)
    || Boolean(env.STRIPE_SECRET_KEY || env.FANDOM_STRIPE_SECRET_KEY)
    || !env.REPLIT_CONNECTORS_HOSTNAME;
  let pool;
  let ready;
  const database = () => {
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required for billing.");
    pool ||= poolFactory({ connectionString: env.DATABASE_URL, max: 3 });
    return pool;
  };
  const initialize = async () => {
    if (useBlobBilling) return null;
    ready ||= (async () => {
      await runStripeMigrations({ databaseUrl: env.DATABASE_URL });
      const sync = await stripeSync({ env });
      const webhookOrigin = env.FANDOM_PUBLIC_ORIGIN || env.URL;
      if (!webhookOrigin) throw new Error("FANDOM_PUBLIC_ORIGIN is required for managed Stripe webhooks.");
      const origin = new URL(webhookOrigin).origin;
      await sync.findOrCreateManagedWebhook(`${origin}/api/billing/webhook`);
      await sync.syncBackfill();
      return sync;
    })().catch(error => { ready = undefined; throw error; });
    return ready;
  };
  const repository = context => useBlobBilling
    ? createBlobBillingRepository({ getStore, context })
    : createBillingRepository({ query: (...args) => database().query(...args) });
  const processWebhook = async (body, signature, context) => {
    if (!useBlobBilling) {
      const sync = await initialize(context);
      await sync.processWebhook(body, signature);
      return;
    }
    const { webhookSecret } = await getStripeCredentials({ env });
    const stripe = await stripeClient({ env });
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    await applyBlobBillingEvent({ event, repository: repository(context) });
  };
  return {
    initialize,
    repository,
    stripe: () => stripeClient({ env }),
    processWebhook,
  };
}

export function createEntitlementChecker({ billing }) {
  return async (session, context) => {
    await billing.initialize(context);
    const membership = await billing.repository(context).membershipForAccount(session.user.accountId);
    if (membership.status !== "active") {
      const error = new Error("An active membership is required.");
      error.status = 403;
      throw error;
    }
    return membership;
  };
}

export function createBillingHandlers({ auth, billing, env = process.env }) {
  const sameOrigin = req => {
    if (req.headers.get("origin") !== new URL(req.url).origin) {
      const error = new Error("Cross-origin requests are not allowed."); error.status = 403; throw error;
    }
  };
  const safeErrorDetails = error => {
    const details = {
      name: typeof error?.name === "string" ? error.name : "Error",
      code: typeof error?.code === "string" ? error.code : undefined,
      status: Number.isInteger(error?.status) ? error.status : undefined,
      stage: typeof error?.billingStage === "string" ? error.billingStage : undefined,
    };
    if (typeof error?.message === "string" && !String(error?.type || "").startsWith("Stripe")) {
      details.message = error.message
        .replace(/\b[A-Za-z][A-Za-z0-9]{1,12}_[A-Za-z0-9]+\b/g, "[redacted]")
        .replace(/https?:\/\/[^/\s]*:[^@\s]+@/gi, "[redacted-url]@");
    }
    return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
  };
  const atStage = async (stage, callback) => {
    try {
      return await callback();
    } catch (error) {
      if (error && typeof error === "object") error.billingStage ||= stage;
      throw error;
    }
  };
  const guarded = handler => async (req, context) => {
    try { return await handler(req, context); }
    catch (error) {
      const status = error?.status || 503;
      if (status >= 500) console.error("[billing] request failed", safeErrorDetails(error));
      const diagnostic = new URL(req.url).searchParams.has("health")
        && status >= 500
        && typeof error?.billingStage === "string"
        ? ` [${error.billingStage}]`
        : "";
      return json(status, { error: status >= 500 ? `Billing is temporarily unavailable.${diagnostic}` : error.message });
    }
  };
  return {
    status: guarded(async (req, context) => {
      if (req.method !== "GET") return json(405, { error: "Method not allowed." }, { Allow: "GET" });
      if (new URL(req.url).searchParams.get("health") === "billing-stripe-price") {
        const price = await atStage("price-config", () => {
          const configured = env.FANDOM_STRIPE_MEMBERSHIP_PRICE_ID;
          if (!/^price_[A-Za-z0-9]+$/.test(configured || "")) {
            throw new Error("FANDOM_STRIPE_MEMBERSHIP_PRICE_ID must be a Stripe Price ID.");
          }
          return configured;
        });
        const stripe = await atStage("stripe-client", () => billing.stripe());
        const record = await atStage("price-read", () => stripe.prices.retrieve(price));
        return json(200, {
          ok: true,
          active: Boolean(record.active),
          livemode: Boolean(record.livemode),
          recurring: Boolean(record.recurring),
          product: typeof record.product === "string" ? "present" : "expanded",
        });
      }
      const session = await auth.authenticate(req, context);
      await atStage("initialize", () => billing.initialize(context));
      const repository = await atStage("repository", () => billing.repository(context));
      const membership = await atStage("membership-read", () => repository.membershipForAccount(session.user.accountId));
      return json(200, {
        state: membership.status,
        isMember: membership.status === "active",
        ...(membership.currentPeriodEnd ? { renewsAt: membership.currentPeriodEnd } : {}),
      });
    }),
    checkout: guarded(async (req, context) => {
      if (req.method !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
      sameOrigin(req);
      const session = await atStage("auth", () => auth.authenticate(req, context));
      const price = await atStage("price-config", () => {
        const configured = env.FANDOM_STRIPE_MEMBERSHIP_PRICE_ID;
        if (!/^price_[A-Za-z0-9]+$/.test(configured || "")) {
          throw new Error("FANDOM_STRIPE_MEMBERSHIP_PRICE_ID must be a Stripe Price ID.");
        }
        return configured;
      });
      await atStage("initialize", () => billing.initialize(context));
      const repository = await atStage("repository", () => billing.repository(context));
      let customer = await atStage("customer-read", () => repository.customerForAccount(session.user.accountId));
      const stripe = await atStage("stripe-client", () => billing.stripe());
      if (!customer) {
        const created = await atStage("customer-create", () => stripe.customers.create({ email: session.user.email, metadata: { fandom_account_id: session.user.accountId } }));
        customer = await atStage("customer-link", () => repository.linkCustomer(session.user.accountId, created.id));
      }
      const origin = new URL(req.url).origin;
      const checkout = await atStage("checkout-session", () => stripe.checkout.sessions.create({
        mode: "subscription", customer, line_items: [{ price, quantity: 1 }],
        success_url: `${origin}/vibe-atlas?view=membership&membership=success`,
        cancel_url: `${origin}/vibe-atlas?view=membership&membership=cancelled`,
        metadata: { fandom_account_id: session.user.accountId },
        subscription_data: { metadata: { fandom_account_id: session.user.accountId } },
      }));
      return json(200, { url: checkout.url });
    }),
    portal: guarded(async (req, context) => {
      if (req.method !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
      sameOrigin(req);
      const session = await atStage("auth", () => auth.authenticate(req, context));
      await atStage("initialize", () => billing.initialize(context));
      const customer = await atStage("customer-read", () => billing.repository(context).customerForAccount(session.user.accountId));
      if (!customer) { const error = new Error("No billing account exists."); error.status = 404; throw error; }
      const stripe = await atStage("stripe-client", () => billing.stripe());
      const portal = await atStage("portal-session", () => stripe.billingPortal.sessions.create({
        customer, return_url: `${new URL(req.url).origin}/vibe-atlas?view=membership`,
      }));
      return json(200, { url: portal.url });
    }),
    webhook: guarded(async (req, context) => {
      if (req.method !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
      const signature = req.headers.get("stripe-signature");
      if (!signature) { const error = new Error("Missing Stripe signature."); error.status = 400; throw error; }
      const body = Buffer.from(await req.arrayBuffer());
      if (typeof billing.processWebhook === "function") {
        await billing.processWebhook(body, signature, context);
      } else {
        const sync = await billing.initialize(context);
        await sync.processWebhook(body, signature);
      }
      return json(200, { received: true });
    }),
  };
}

export function getBillingServices() {
  initialized ||= createBillingServices();
  return initialized;
}