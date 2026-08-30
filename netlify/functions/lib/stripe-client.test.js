import test from "node:test";
import assert from "node:assert/strict";
import { getStripeCredentials } from "./stripe-client.js";

test("external deployment credentials do not require the Replit connector", async () => {
  let connectorRequested = false;
  const credentials = await getStripeCredentials({
    env: {
      STRIPE_SECRET_KEY: "sk_test_external",
      STRIPE_WEBHOOK_SECRET: "whsec_external",
    },
    fetchImpl: async () => {
      connectorRequested = true;
      throw new Error("The Replit connector should not be requested.");
    },
  });

  assert.deepEqual(credentials, {
    secretKey: "sk_test_external",
    webhookSecret: "whsec_external",
  });
  assert.equal(connectorRequested, false);
});

test("external deployment credentials must be configured together", async () => {
  await assert.rejects(
    getStripeCredentials({ env: { STRIPE_SECRET_KEY: "sk_test_external" } }),
    /STRIPE_WEBHOOK_SECRET is required/,
  );
  await assert.rejects(
    getStripeCredentials({ env: { STRIPE_WEBHOOK_SECRET: "whsec_external" } }),
    /STRIPE_SECRET_KEY is required/,
  );
});