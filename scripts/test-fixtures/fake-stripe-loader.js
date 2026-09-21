const FAKE_STRIPE_URL = new URL("./fake-stripe.js", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "stripe") {
    return {
      url: FAKE_STRIPE_URL,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}