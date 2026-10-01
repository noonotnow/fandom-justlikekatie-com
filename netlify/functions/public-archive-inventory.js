import { getBlobStore } from "./lib/blob-store.js";
import { createPublicArchiveInventoryHandler } from "./lib/public-archive-inventory.js";

export default async function publicArchiveInventory(request, context) {
  const result = await createPublicArchiveInventoryHandler({
    getStore: getBlobStore,
  })(request, context);
  return new Response(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}