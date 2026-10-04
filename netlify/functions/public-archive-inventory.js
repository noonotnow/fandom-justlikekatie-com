import { getBlobStore } from "./lib/blob-store.js";
import { createPublicArchiveInventoryHandler } from "./lib/public-archive-inventory.js";
import { createArchiveDiagnosticsFactory } from "./lib/public-archive-diagnostics.js";

// Store wrappers are created per request; this private scope identifies this
// function's one archive store without retaining credentials or sharing sites.
const refreshScope = {};
const createDiagnostics = createArchiveDiagnosticsFactory();

export default async function publicArchiveInventory(request, context) {
  const result = await createPublicArchiveInventoryHandler({
    getStore: getBlobStore,
    refreshScope,
    createDiagnostics,
  })(request, context);
  return new Response(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}