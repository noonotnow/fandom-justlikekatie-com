const XAI_ORIGIN = "https://api.x.ai";

export class XaiClientConfigurationError extends Error {}

/** Research must work with Netlify's server key and retain cancellation in Replit. */
export async function createXaiResearchClient(options = {}) {
  return createXaiClient({
    connectorFactory: () => {
      let adapter;
      return {
        async proxy(name, path, init) {
          if (name !== "xai" || !String(path).startsWith("/v1/")) {
            throw new TypeError("Only xAI v1 API requests are supported.");
          }
          adapter ??= import("@replit/connectors-sdk").then(({ ReplitConnectors }) =>
            new ReplitConnectors().createProxyFetch("xai"));
          return (await adapter)(`${XAI_ORIGIN}${path}`, init);
        },
      };
    },
    ...options,
  });
}

export function createXaiClient({
  apiKey = process.env.XAI_API_KEY,
  fetchImpl = globalThis.fetch,
  connectorFactory,
  netlifyRuntime = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME),
} = {}) {
  const secret = typeof apiKey === "string" ? apiKey.trim() : "";
  if (secret) return createApiKeyClient(secret, fetchImpl);

  if (!netlifyRuntime && typeof connectorFactory === "function") {
    return connectorFactory();
  }

  return {
    async proxy() {
      throw new XaiClientConfigurationError(
        "xAI is not configured for this server runtime.",
      );
    },
  };
}

function createApiKeyClient(apiKey, fetchImpl) {
  return {
    async proxy(connectorName, path, options = {}) {
      if (connectorName !== "xai") {
        throw new TypeError("Only the xAI provider is supported.");
      }
      if (typeof path !== "string" || !path.startsWith("/v1/") || path.startsWith("//")) {
        throw new TypeError("Only xAI v1 API paths are supported.");
      }
      const url = new URL(path, XAI_ORIGIN);
      if (url.origin !== XAI_ORIGIN) {
        throw new TypeError("Only xAI API requests are supported.");
      }
      const headers = new Headers(options.headers);
      headers.set("Authorization", `Bearer ${apiKey}`);
      return fetchImpl(url, {
        ...options,
        headers,
      });
    },
  };
}