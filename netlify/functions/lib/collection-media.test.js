import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createCollectionMediaHandler } from "./collection-media.js";

const ORIGIN = "https://fandom.justlikekatie.com";
const ACCOUNT_ID = "usr_test";
const ITEM_ID = "11111111-2222-4333-8444-555555555555";
const ASSET_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHECKSUM = createHash("sha256").update(BYTES).digest("hex");

function request(overrides = {}) {
  return new Request(
    `${ORIGIN}/api/collection/media?collectionId=middle-earth&itemId=${ITEM_ID}`,
    {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "image/png" },
      body: BYTES,
      ...overrides,
    },
  );
}

function mediaResponse() {
  return new Response(JSON.stringify({
    data: {
      version: 1,
      assetId: ASSET_ID,
      mediaType: "image",
      mimeType: "image/png",
      sizeBytes: BYTES.byteLength,
      checksum: CHECKSUM,
      fileUrl: `https://media.justlikekatie.com/images/sha256/${CHECKSUM}.png`,
      deliveryUrl: `https://media.justlikekatie.com/images/sha256/${CHECKSUM}.png`,
      thumbnailUrl: `https://media.justlikekatie.com/images/sha256/${CHECKSUM}.png`,
      dimensions: { width: 1, height: 1 },
    },
  }), { status: 201, headers: { "content-type": "application/json" } });
}

test("registers collection uploads in MEDIA and returns a stable associated descriptor", async () => {
  let mediaMetadata;
  const handler = createCollectionMediaHandler({
    auth: { authenticate: async () => ({ user: { accountId: ACCOUNT_ID } }) },
    env: {
      MEDIA_ASSETS_TOKEN: "test-token",
      MEDIA_ASSETS_URL: "https://media.example/v1/assets/images",
    },
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://media.example/v1/assets/images");
      assert.equal(init.headers.Authorization, "Bearer test-token");
      assert.equal(init.body.get("file").type, "image/png");
      mediaMetadata = JSON.parse(init.body.get("metadata"));
      return mediaResponse();
    },
  });

  const response = await handler(request(), {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.media.assetId, ASSET_ID);
  assert.equal(body.media.deliveryUrl, `https://media.justlikekatie.com/images/sha256/${CHECKSUM}.png`);
  assert.deepEqual(body.media.association, {
    type: "collection",
    id: "middle-earth",
    itemId: ITEM_ID,
  });
  assert.equal(mediaMetadata.sourceType, "fandom-collection-upload");
  assert.equal(mediaMetadata.linkedPostIdentifiers.includes("fandom/collection/middle-earth"), true);
  assert.deepEqual(JSON.parse(mediaMetadata.rightsNotes).association, body.media.association);
});

test("rejects invalid uploads before MEDIA and never exposes its credential", async () => {
  let calls = 0;
  const handler = createCollectionMediaHandler({
    auth: { authenticate: async () => ({ user: { accountId: ACCOUNT_ID } }) },
    env: { MEDIA_ASSETS_TOKEN: "secret-token" },
    fetchImpl: async () => {
      calls += 1;
      return mediaResponse();
    },
  });
  const crossOrigin = await handler(request({
    headers: { origin: "https://evil.example", "content-type": "image/png" },
  }), {});
  assert.equal(crossOrigin.status, 403);
  assert.equal(JSON.stringify(await crossOrigin.json()).includes("secret-token"), false);

  const unsupported = await handler(request({
    headers: { origin: ORIGIN, "content-type": "image/gif" },
  }), {});
  assert.equal(unsupported.status, 415);
  assert.equal(calls, 0);
});