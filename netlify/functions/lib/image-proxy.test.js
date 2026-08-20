import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createImageProxyHandler } from "../image-proxy.js";

function request(target, method = "GET") {
  return new Request(`https://fandom.justlikekatie.com/api/image-proxy?url=${encodeURIComponent(target)}`, {
    method,
  });
}

test("image proxy serves inspected public image bytes with canvas-safe headers", async () => {
  const source = await sharp({
    create: { width: 40, height: 40, channels: 3, background: "#173a3a" },
  }).png().toBuffer();
  const targets = [];
  const handler = createImageProxyHandler({
    fetchImageImpl: async target => {
      targets.push(target);
      return source;
    },
  });
  const response = await handler(request("https://images.example/shire.png"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.deepEqual(targets, ["https://images.example/shire.png"]);
});

test("image proxy rejects insecure, credentialed, and private targets without exposing upstream detail", async () => {
  const handler = createImageProxyHandler();
  for (const target of [
    "http://images.example/image.jpg",
    "https://user:pass@images.example/image.jpg",
  ]) {
    const response = await handler(request(target));
    assert.equal(response.status, 400);
  }

  const privateResponse = await handler(request("https://127.0.0.1/internal"));
  assert.equal(privateResponse.status, 502);
  assert.deepEqual(await privateResponse.json(), { error: "Image could not be fetched" });
});

test("image proxy rejects non-images even when the fetch layer returns bytes", async () => {
  const handler = createImageProxyHandler({
    fetchImageImpl: async () => Buffer.from("<html>not an image</html>"),
  });
  const response = await handler(request("https://images.example/not-image"));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "Image could not be fetched" });
});