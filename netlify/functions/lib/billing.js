import pg from "pg";
import { runMigrations } from "stripe-replit-sync";
import { createBillingRepository } from "./billing-repository.js";
import { getStripeSync, getUncachableStripeClient } from "./stripe-client.js";
import { json } from "./public-auth.js";

let initialized;

export function createBillingServices({
  env = process.env,
  stripeClient = getUncachableStripeClient,
  stripeSync = getStripeSync,
  poolFactory = config => new pg.Pool(config),
  runStripeMigrations = runMigrations,
} = {}) {
  let pool;
  let ready;
  const database = () => {
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required for billing.");
    pool ||= poolFactory({ connectionString: env.DATABASE_URL, max: 3 });
    return pool;
  };
  const initialize = async () => {
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
  return {
    initialize,
    repository: () => createBillingRepository({ query: (...args) => database().query(...args) }),
    stripe: () => stripeClient({ env }),
  };
}

export function createEntitlementChecker({ billing }) {
  return async (session) => {
    await billing.initialize();
    const membership = await billing.repository().membershipForAccount(session.user.accountId);
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
  const guarded = handler => async (req, context) => {
    try { return await handler(req, context); }
    catch (error) {
      const status = error?.status || 503;
      if (status >= 500) console.error("[billing] request failed", error);
      return json(status, { error: status >= 500 ? "Billing is temporarily unavailable." : error.message });
    }
  };
  return {
    status: guarded(async (req, context) => {
      if (req.method !== "GET") return json(405, { error: "Method not allowed." }, { Allow: "GET" });
      const session = await auth.authenticate(req, context);
      await billing.initialize();
      const membership = await billing.repository().membershipForAccount(session.user.accountId);
      return json(200, {
        state: membership.status,
        isMember: membership.status === "active",
        ...(membership.currentPeriodEnd ? { renewsAt: membership.currentPeriodEnd } : {}),
      });
    }),
    checkout: guarded(async (req, context) => {
      if (req.method !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
      sameOrigin(req);
      const session = await auth.authenticate(req, context);
      const price = env.FANDOM_STRIPE_MEMBERSHIP_PRICE_ID;
      if (!/^price_[A-Za-z0-9]+$/.test(price || "")) throw new Error("FANDOM_STRIPE_MEMBERSHIP_PRICE_ID must be a Stripe Price ID.");
      await billing.initialize();
      const repository = billing.repository();
      let customer = await repository.customerForAccount(session.user.accountId);
      const stripe = await billing.stripe();
      if (!customer) {
        const created = await stripe.customers.create({ email: session.user.email, metadata: { fandom_account_id: session.user.accountId } });
        customer = await repository.linkCustomer(session.user.accountId, created.id);
      }
      const origin = new URL(req.url).origin;
      const checkout = await stripe.checkout.sessions.create({
        mode: "subscription", customer, line_items: [{ price, quantity: 1 }],
        success_url: `${origin}/vibe-atlas?view=membership&membership=success`,
        cancel_url: `${origin}/vibe-atlas?view=membership&membership=cancelled`,
        metadata: { fandom_account_id: session.user.accountId },
        subscription_data: { metadata: { fandom_account_id: session.user.accountId } },
      });
      return json(200, { url: checkout.url });
    }),
    portal: guarded(async (req, context) => {
      if (req.method !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
      sameOrigin(req);
      const session = await auth.authenticate(req, context);
      await billing.initialize();
      const customer = await billing.repository().customerForAccount(session.user.accountId);
      if (!customer) { const error = new Error("No billing account exists."); error.status = 404; throw error; }
      const portal = await (await billing.stripe()).billingPortal.sessions.create({
        customer, return_url: `${new URL(req.url).origin}/vibe-atlas?view=membership`,
      });
      return json(200, { url: portal.url });
    }),
    webhook: guarded(async req => {
      if (req.method !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
      const signature = req.headers.get("stripe-signature");
      if (!signature) { const error = new Error("Missing Stripe signature."); error.status = 400; throw error; }
      const sync = await billing.initialize();
      await sync.processWebhook(Buffer.from(await req.arrayBuffer()), signature);
      return json(200, { received: true });
    }),
  };
}

export function getBillingServices() {
  initialized ||= createBillingServices();
  return initialized;
}