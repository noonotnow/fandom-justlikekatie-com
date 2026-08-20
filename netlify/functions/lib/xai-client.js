const XAI_ORIGIN = "https://api.x.ai";

export class XaiClientConfigurationError extends Error {}

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