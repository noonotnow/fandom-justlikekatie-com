const FAKE_STRIPE_URL = new URL("./fake-stripe.js", import.meta.url).href;
const FAKE_BLOBS_URL = new URL("./fake-netlify-blobs.js", import.meta.url).href;
const AUDIT_MODULE_SUFFIX = "/netlify/functions/lib/subscription-product-audit.js";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "stripe") {
    return {
      url: FAKE_STRIPE_URL,
      shortCircuit: true,
    };
  }
  if (specifier === "@netlify/blobs") {
    return {
      url: FAKE_BLOBS_URL,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context);
  if (
    process.env.FAKE_STRIPE_SCENARIO !== "progress_reporting_failure"
    || !url.endsWith(AUDIT_MODULE_SUFFIX)
  ) {
    return loaded;
  }

  const source = String(loaded.source).replace(
    "export async function auditSubscriptionProducts({",
    "async function auditSubscriptionProductsWithRealObserver({",
  );
  return {
    ...loaded,
    shortCircuit: true,
    source: `${source}
export async function auditSubscriptionProducts(options) {
  const realObserver = options.onUpdateProgress;
  return auditSubscriptionProductsWithRealObserver({
    ...options,
    onUpdateProgress: async progress => {
      await realObserver(progress);
      throw new Error("private observer failure with sub_private price_private StripeAPIError");
    },
  });
}
`,
  };
}