function subscription(id, priceId, metadata = {}) {
  return {
    id,
    metadata,
    items: { data: [{ price: { id: priceId } }] },
  };
}

export default class FakeStripe {
  constructor(secretKey) {
    if (secretKey !== "sk_test_local") {
      throw new Error("The audit command did not construct Stripe with the test key.");
    }

    this.subscriptions = {
      list: ({ status }) => {
        if (status !== "active") return [];
        if (process.env.FAKE_STRIPE_SCENARIO === "ambiguous") {
          return [subscription("sub_ambiguous", "price_unknown")];
        }
        return [subscription("sub_clean", "price_collector")];
      },
      update: async () => {},
    };
  }
}