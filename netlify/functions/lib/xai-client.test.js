import assert from "node:assert/strict";
import test from "node:test";
import {
  XaiClientConfigurationError,
  createXaiClient,
} from "./xai-client.js";

test("Netlify uses a server-side xAI key without relying on Replit identity", async () => {
  let request;
  const client = createXaiClient({
    apiKey: "server-secret",
    netlifyRuntime: true,
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return Response.json({ data: [{ id: "grok-test" }] });
    },
    connectorFactory: () => {
      throw new Error("Replit connector must not be created in Netlify.");
    },
  });

  const response = await client.proxy("xai", "/v1/models", { method: "GET" });
  assert.equal(response.status, 200);
  assert.equal(request.url, "https://api.x.ai/v1/models");
  assert.equal(request.options.headers.get("Authorization"), "Bearer server-secret");
});

test("native xAI requests preserve structured bodies and content type", async () => {
  let request;
  const client = createXaiClient({
    apiKey: "server-secret",
    netlifyRuntime: true,
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return Response.json({ choices: [] });
    },
  });
  const body = JSON.stringify({ model: "grok-test", response_format: { type: "json_schema" } });
  await client.proxy("xai", "/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  assert.equal(request.url, "https://api.x.ai/v1/chat/completions");
  assert.equal(request.options.body, body);
  assert.equal(request.options.headers.get("Content-Type"), "application/json");
});

test("Netlify fails explicitly when its server-side xAI key is absent", async () => {
  const client = createXaiClient({
    apiKey: "",
    netlifyRuntime: true,
    connectorFactory: () => ({ proxy: async () => Response.json({}) }),
  });
  await assert.rejects(
    () => client.proxy("xai", "/v1/models"),
    XaiClientConfigurationError,
  );
});

test("Replit development falls back to the attached connector", () => {
  const connector = { proxy: async () => Response.json({ ok: true }) };
  const client = createXaiClient({
    apiKey: "",
    netlifyRuntime: false,
    connectorFactory: () => connector,
  });
  assert.equal(client, connector);
});

test("native client rejects other providers and paths", async () => {
  const client = createXaiClient({
    apiKey: "server-secret",
    netlifyRuntime: true,
    fetchImpl: async () => Response.json({}),
  });
  await assert.rejects(() => client.proxy("github", "/v1/models"), /Only the xAI provider/);
  await assert.rejects(() => client.proxy("xai", "//evil.example/v1/models"), /Only xAI v1/);
  await assert.rejects(() => client.proxy("xai", "/v2/models"), /Only xAI v1/);
});