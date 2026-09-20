import pg from "pg";
import { runMigrations } from "stripe-replit-sync";
import { createBillingRepository } from "./billing-repository.js";
import { createBlobBillingRepository } from "./billing-blob-repository.js";
import { applyBlobBillingEvent } from "./billing-blob-webhook.js";
import { getBlobStore } from "./blob-store.js";
import { getStripeCredentials, getStripeSync, getUncachableStripeClient } from "./stripe-client.js";
import { json } from "./public-auth.js";
import { capabilitiesForMembership, hasCapability } from "./capabilities.js";

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
      await repository().ensureApplicationSchema?.();
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
    const { webhookSecret } = await getStripeCredentials({ env });
    const stripe = await stripeClient({ env });
    let event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    if (!useBlobBilling) {
      const sync = await initialize(context);
      const repo = repository(context);
      if (!await repo.claimEvent(event)) return;
      try {
        await sync.processWebhook(body, signature);
        await repo.recordProcessedEvent?.(event);
      } catch (error) {
        await repo.releaseEvent?.(event.id);
        throw error;
      }
      return;
    }
    if (event.type.startsWith("customer.subscription.") && event.type !== "customer.subscription.deleted") {
      const current = await stripe.subscriptions.retrieve(event.data.object.id);
      event = { ...event, data: { ...event.data, object: current } };
    }
    await applyBlobBillingEvent({ event, repository: repository(context) });
  };
  return {
    initialize,
    repository,
    stripe: () => stripeClient({ env }),
    processWebhook,
  };
}

export function createCapabilityChecker({ billing, capability = "fandom_collector", env = process.env }) {
  return async (session, context) => {
    await billing.initialize(context);
    const membership = await billing.repository(context).membershipForAccount(session.user.accountId);
    const allowed = Array.isArray(capability)
      ? capability.some(item => hasCapability(membership, item, env))
      : hasCapability(membership, capability, env);
    if (!allowed) {
      const error = new Error(`The ${capability} capability is required.`);
      error.status = 403;
      throw error;
    }
    return membership;
  };
}

export const createEntitlementChecker = options => createCapabilityChecker(options);

export function createBillingHandlers({ auth, billing, env = process.env }) {
  const sameOrigin = req => {
    if (req.headers.get("origin") !== new URL(req.url).origin) {
      const error = new Error("Cross-origin requests are not allowed."); error.status = 403; throw error;
    }
  };
  const safeErrorDetails = error => {
    const providerCode = typeof error?.code === "string"
      ? error.code
      : typeof error?.raw?.code === "string" ? error.raw.code : undefined;
    const providerStatus = Number.isInteger(error?.statusCode)
      ? error.statusCode
      : Number.isInteger(error?.raw?.statusCode) ? error.raw.statusCode : undefined;
    const details = {
      name: typeof error?.name === "string" ? error.name : "Error",
      code: providerCode,
      status: Number.isInteger(error?.status) ? error.status : undefined,
      providerStatus,
      stage: typeof error?.billingStage === "string" ? error.billingStage : undefined,
    };
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
      return json(status, { error: status >= 500 ? "Billing is temporarily unavailable." : error.message });
    }
  };
  return {
    status: guarded(async (req, context) => {
      if (req.method !== "GET") return json(405, { error: "Method not allowed." }, { Allow: "GET" });
      const session = await auth.authenticate(req, context);
      await atStage("initialize", () => billing.initialize(context));
      const repository = await atStage("repository", () => billing.repository(context));
      const membership = await atStage("membership-read", () => repository.membershipForAccount(session.user.accountId));
      return json(200, {
        state: membership.status,
        isMember: membership.status === "active",
        capabilities: capabilitiesForMembership(membership, env),
        ...(membership.currentPeriodEnd ? { renewsAt: membership.currentPeriodEnd } : {}),
      });
    }),
    checkout: guarded(async (req, context) => {
      if (req.method !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
      sameOrigin(req);
      const input = await req.json().catch(() => ({}));
      const returnDate = typeof input?.returnDate === "string"
        && /^\d{4}-\d{2}-\d{2}$/.test(input.returnDate)
        ? input.returnDate
        : null;
      const campaign = typeof input?.campaign === "string"
        && (env.FANDOM_STRIPE_CAMPAIGNS || "").split(",").map(value => value.trim()).includes(input.campaign)
        ? input.campaign
        : null;
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
      if (customer) {
        try {
          const existing = await atStage("customer-verify", () => stripe.customers.retrieve(customer));
          if (existing.deleted) customer = null;
        } catch (error) {
          if (error?.code === "resource_missing") customer = null;
          else throw error;
        }
      }
      if (!customer) {
        const created = await atStage("customer-create", () => stripe.customers.create({ email: session.user.email, metadata: { fandom_account_id: session.user.accountId } }));
        customer = await atStage("customer-link", () => repository.linkCustomer(session.user.accountId, created.id));
      }
      const origin = new URL(req.url).origin;
      const checkoutInput = {
        mode: "subscription", customer, line_items: [{ price, quantity: 1 }],
        managed_payments: { enabled: false },
        success_url: returnDate
          ? `${origin}/vibe-atlas?date=${encodeURIComponent(returnDate)}&membership=success`
          : `${origin}/vibe-atlas?view=membership&membership=success`,
        cancel_url: returnDate
          ? `${origin}/vibe-atlas?date=${encodeURIComponent(returnDate)}&membership=cancelled`
          : `${origin}/vibe-atlas?view=membership&membership=cancelled`,
        metadata: {
          fandom_account_id: session.user.accountId,
          capability: "fandom_collector",
          product: "fandom_collector",
          ...(campaign ? { campaign } : {}),
        },
        subscription_data: {
          metadata: {
            fandom_account_id: session.user.accountId,
            capability: "fandom_collector",
            product: "fandom_collector",
            ...(campaign ? { campaign } : {}),
          },
        },
        ...(env.FANDOM_STRIPE_ALLOW_PROMOTION_CODES === "true" ? { allow_promotion_codes: true } : {}),
      };
      const checkoutOptions = {
        idempotencyKey: `collector-checkout:${session.user.accountId}:${price}:${returnDate || "membership"}:${campaign || "direct"}`,
      };
      let checkout;
      try {
        checkout = await atStage("checkout-session", () => stripe.checkout.sessions.create(checkoutInput, checkoutOptions));
      } catch (error) {
        const resourceMissing = error?.code === "resource_missing" || error?.raw?.code === "resource_missing";
        if (!customer || !resourceMissing) throw error;
        const { customer: ignoredCustomer, ...emailCheckoutInput } = checkoutInput;
        checkout = await atStage("checkout-session-retry", () => stripe.checkout.sessions.create({
          ...emailCheckoutInput, customer_email: session.user.email,
        }, { ...checkoutOptions, idempotencyKey: `${checkoutOptions.idempotencyKey}:email` }));
      }
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
