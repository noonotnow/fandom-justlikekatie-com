import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  RENDER_HEIGHT,
  RENDER_WIDTH,
  renderCanonicalOutput,
  validatedProxyTarget,
} from "./canonical-render.js";

function packet() {
  return {
    actor: { name: "Star" },
    vibe: { label: "Vibe", labelEn: "Vibe" },
    provenance: { generatedAt: "2026-08-05T12:00:00.000Z", gridId: "grid-1" },
    sourceCards: [{
      id: "card-1",
      title: "Persisted source",
      imageUrl: "/.netlify/functions/image-proxy?url=https%3A%2F%2Fimages.example%2Ftrusted.jpg",
    }],
  };
}

test("renders canonical PNG bytes only from the persisted source selection", async () => {
  const source = await sharp({
    create: { width: 400, height: 500, channels: 3, background: "#9b4f6f" },
  }).jpeg().toBuffer();
  const targets = [];
  const bytes = await renderCanonicalOutput(
    packet(),
    { id: "grid-output", kind: "grid", sourceId: "grid-1" },
    {
      requestUrl: "https://fandom.justlikekatie.com/api/create-handoff",
      fetchSourceImpl: async target => {
        targets.push(target);
        return source;
      },
    },
  );
  const metadata = await sharp(bytes).metadata();
  assert.deepEqual(targets, ["https://images.example/trusted.jpg"]);
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, RENDER_WIDTH);
  assert.equal(metadata.height, RENDER_HEIGHT);
});

test("rejects direct, cross-origin, private, and mismatched proxy source descriptors", () => {
  const requestUrl = "https://fandom.justlikekatie.com/api/create-handoff";
  assert.throws(
    () => validatedProxyTarget("https://attacker.example/arbitrary.png", requestUrl),
    /same-origin image proxy/,
  );
  assert.throws(
    () => validatedProxyTarget(
      "/.netlify/functions/image-proxy?url=http%3A%2F%2Fexample.com%2Fimage.jpg",
      requestUrl,
    ),
    /public HTTPS hostname/,
  );
  assert.throws(
    () => validatedProxyTarget(
      "/.netlify/functions/image-proxy?url=https%3A%2F%2F127.0.0.1%2Fsecret",
      requestUrl,
    ),
    /public HTTPS hostname/,
  );
});
