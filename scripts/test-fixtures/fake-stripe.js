function subscription(id, priceId, metadata = {}) {
  return {
    id,
    metadata,
    items: { data: [{ price: { id: priceId } }] },
  };
}

function paginatedSubscriptions(...pages) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const page of pages) {
        yield* page;
      }
    },
  };
}

export default class FakeStripe {
  constructor(secretKey) {
    if (secretKey !== "sk_test_local") {
      throw new Error("The audit command did not construct Stripe with the test key.");
    }
    if (process.env.FAKE_STRIPE_SCENARIO === "initialization_authentication_failure") {
      throw Object.assign(new Error(`Invalid key during initialization: ${secretKey}`), {
        type: "StripeAuthenticationError",
        statusCode: 401,
      });
    }
    if (process.env.FAKE_STRIPE_SCENARIO === "initialization_authentication_status_only") {
      throw Object.assign(new Error(`Status-only invalid key during initialization: ${secretKey}`), {
        statusCode: 401,
      });
    }
    if (process.env.FAKE_STRIPE_SCENARIO === "initialization_connection_timeout") {
      throw Object.assign(new Error(`Initialization timed out using ${secretKey}`), {
        type: "StripeConnectionError",
        code: "ETIMEDOUT",
      });
    }
    if (process.env.FAKE_STRIPE_SCENARIO === "initialization_connection_timeout_code_only") {
      throw Object.assign(new Error(`Code-only initialization timeout using ${secretKey}`), {
        code: "ETIMEDOUT",
      });
    }
    if (process.env.FAKE_STRIPE_SCENARIO === "initialization_connection_reset_code_only") {
      throw Object.assign(new Error(`Code-only initialization reset using ${secretKey}`), {
        code: "ECONNRESET",
      });
    }
    if (process.env.FAKE_STRIPE_SCENARIO === "initialization_failure") {
      throw Object.assign(new Error(`Provider initialization failed using ${secretKey}`), {
        type: "StripeAPIError",
        code: "client_initialization_failed",
      });
    }

    let updateCalls = 0;
    this.subscriptions = {
      list: ({ status }) => {
        if (
          process.env.FAKE_STRIPE_SCENARIO === "trialing_list_failure_after_one_update"
          || process.env.FAKE_STRIPE_SCENARIO === "trialing_list_failure_after_two_updates"
        ) {
          const expectedUpdates = process.env.FAKE_STRIPE_SCENARIO === "trialing_list_failure_after_one_update"
            ? 1
            : 2;
          if (status === "active") {
            return [
              subscription("sub_active_first_private", "price_collector", {
                active_private_note: "active_metadata_private_value",
              }),
              ...(expectedUpdates === 2
                ? [subscription("sub_active_second_private", "price_creator", {
                  second_private_note: "second_metadata_private_value",
                })]
                : []),
            ];
          }
          if (status === "trialing") {
            if (updateCalls !== expectedUpdates) {
              throw new Error("Trialing listing started before the expected active updates completed.");
            }
            throw Object.assign(
              new Error(
                `Provider rejected trialing list after ${updateCalls} updates for sub_active_first_private `
                + `price_collector active_metadata_private_value using ${secretKey}`,
              ),
              { type: "StripeAPIError", code: "trialing_subscription_list_failed" },
            );
          }
          return [];
        }
        if (process.env.FAKE_STRIPE_SCENARIO === "mixed_status_partial_update_failure") {
          if (status === "active") {
            return [
              subscription("sub_active_first_private", "price_collector", {
                active_private_note: "active_metadata_private_value",
              }),
              subscription("sub_active_second_private", "price_creator"),
            ];
          }
          if (status === "trialing") {
            return [
              subscription("sub_trialing_first_private", "price_bridge", {
                trialing_private_note: "trialing_metadata_private_value",
              }),
              subscription("sub_trialing_second_private", "price_bundle", {
                failing_trialing_private_note: "failing_trialing_metadata_private_value",
              }),
            ];
          }
          return [];
        }
        if (status !== "active") return [];
        if (process.env.FAKE_STRIPE_SCENARIO === "authentication_failure") {
          throw Object.assign(new Error(`Invalid key: ${secretKey}`), {
            type: "StripeAuthenticationError",
            statusCode: 401,
          });
        }
        if (process.env.FAKE_STRIPE_SCENARIO === "authentication_status_only") {
          throw Object.assign(new Error(`Status-only invalid list key: ${secretKey}`), {
            statusCode: 401,
          });
        }
        if (process.env.FAKE_STRIPE_SCENARIO === "connection_timeout") {
          throw Object.assign(new Error(`Timed out using ${secretKey}`), {
            type: "StripeConnectionError",
            code: "ETIMEDOUT",
          });
        }
        if (process.env.FAKE_STRIPE_SCENARIO === "connection_timeout_code_only") {
          throw Object.assign(new Error(`Code-only list timeout using ${secretKey}`), {
            code: "ETIMEDOUT",
          });
        }
        if (process.env.FAKE_STRIPE_SCENARIO === "connection_reset_code_only") {
          throw Object.assign(new Error(`Code-only list reset using ${secretKey}`), {
            code: "ECONNRESET",
          });
        }
        if (process.env.FAKE_STRIPE_SCENARIO === "api_failure") {
          throw Object.assign(new Error(`Provider rejected ${secretKey}`), {
            type: "StripeAPIError",
            code: "api_error",
          });
        }
        if (process.env.FAKE_STRIPE_SCENARIO === "ambiguous") {
          return [subscription("sub_ambiguous", "price_unknown")];
        }
        if (process.env.FAKE_STRIPE_SCENARIO === "paginated_partial_update_failure") {
          return paginatedSubscriptions(
            [
              subscription("sub_page_one_first_private", "price_collector"),
              subscription("sub_page_one_second_private", "price_creator", {
                first_page_private_note: "first_page_metadata_private_value",
              }),
            ],
            [
              subscription("sub_page_two_first_private", "price_bridge", {
                second_page_private_note: "second_page_metadata_private_value",
              }),
              subscription("sub_page_two_second_private", "price_bundle", {
                failing_page_private_note: "failing_page_metadata_private_value",
              }),
            ],
          );
        }
        if (
          process.env.FAKE_STRIPE_SCENARIO === "partial_update_failure"
          || process.env.FAKE_STRIPE_SCENARIO === "later_partial_update_failure"
        ) {
          return [
            subscription("sub_first_private", "price_collector"),
            subscription("sub_second_private", "price_creator", {
              private_note: "metadata_private_value",
            }),
            ...(process.env.FAKE_STRIPE_SCENARIO === "later_partial_update_failure"
              ? [subscription("sub_third_private", "price_bridge", {
                later_private_note: "later_metadata_private_value",
              })]
              : []),
          ];
        }
        return [subscription("sub_clean", "price_collector")];
      },
      update: async (subscriptionId, params) => {
        updateCalls += 1;
        if (process.env.FAKE_STRIPE_SCENARIO === "update_authentication_failure") {
          throw Object.assign(new Error(`Invalid update key: ${secretKey}`), {
            type: "StripeAuthenticationError",
            statusCode: 401,
          });
        }
        if (process.env.FAKE_STRIPE_SCENARIO === "update_connection_timeout") {
          throw Object.assign(new Error(`Update timed out using ${secretKey}`), {
            type: "StripeConnectionError",
            code: "ETIMEDOUT",
          });
        }
        if (process.env.FAKE_STRIPE_SCENARIO === "update_connection_timeout_code_only") {
          throw Object.assign(new Error(`Code-only update timeout using ${secretKey}`), {
            code: "ETIMEDOUT",
          });
        }
        if (process.env.FAKE_STRIPE_SCENARIO === "update_connection_reset_code_only") {
          throw Object.assign(new Error(`Code-only update reset using ${secretKey}`), {
            code: "ECONNRESET",
          });
        }
        if (process.env.FAKE_STRIPE_SCENARIO === "update_api_failure") {
          throw Object.assign(new Error(`Provider update rejected ${secretKey}`), {
            type: "StripeAPIError",
            code: "subscription_update_failed",
          });
        }
        if (
          process.env.FAKE_STRIPE_SCENARIO === "partial_update_failure"
          && updateCalls === 2
        ) {
          throw Object.assign(
            new Error(
              `Provider rejected ${subscriptionId} with ${JSON.stringify(params.metadata)} using ${secretKey}`,
            ),
            {
              type: "StripeAPIError",
              code: "later_subscription_update_failed",
            },
          );
        }
        if (
          process.env.FAKE_STRIPE_SCENARIO === "later_partial_update_failure"
          && updateCalls === 3
        ) {
          throw Object.assign(
            new Error(
              `Provider rejected ${subscriptionId} with ${JSON.stringify(params.metadata)} using ${secretKey}`,
            ),
            {
              type: "StripeAPIError",
              code: "third_subscription_update_failed",
            },
          );
        }
        if (
          process.env.FAKE_STRIPE_SCENARIO === "paginated_partial_update_failure"
          && updateCalls === 4
        ) {
          throw Object.assign(
            new Error(
              `Provider rejected ${subscriptionId} with ${JSON.stringify(params.metadata)} using ${secretKey}`,
            ),
            {
              type: "StripeAPIError",
              code: "paginated_subscription_update_failed",
            },
          );
        }
        if (
          process.env.FAKE_STRIPE_SCENARIO === "mixed_status_partial_update_failure"
          && updateCalls === 4
        ) {
          throw Object.assign(
            new Error(
              `Provider rejected ${subscriptionId} with ${JSON.stringify(params.metadata)} using ${secretKey}`,
            ),
            {
              type: "StripeAPIError",
              code: "trialing_subscription_update_failed",
            },
          );
        }
      },
    };
    if (process.env.FAKE_STRIPE_SCENARIO === "readonly_update_method") {
      Object.defineProperty(this.subscriptions, "update", {
        writable: false,
      });
    }
  }
}
