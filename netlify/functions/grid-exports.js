import { getBlobStore } from "./lib/blob-store.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { createGridExportHandlers } from "./lib/grid-exports.js";
import { createCapabilityChecker, getBillingServices } from "./lib/billing.js";
import { readCollection } from "./lib/collection-repository.js";

const auth = createPublicAuth({ getStore: getBlobStore });

async function verifyMasterAssets(accountId, gridId, assets, context) {
  const collection = await readCollection(
    getBlobStore("fandom-user-collections", context),
    accountId,
    0,
  );
  const grid = collection.items.find(item => (
    item?.kind === "grid" && (item.artifactId === gridId || item.id === gridId)
  ));
  if (!grid || !Array.isArray(grid.images) || grid.images.length !== 9) return false;
  const authoritative = new Map(grid.images.map(image => [image?.media?.assetId, image?.media]));
  const registered = await Promise.all(assets.map(asset => (
    getBlobStore("fandom-account-media", context).get(
      `accounts/${accountId}/assets/${asset.assetId}`,
      { type: "json", consistency: "strong" },
    ).catch(() => null)
  )));
  return assets.every((asset, index) => {
    const media = authoritative.get(asset.assetId);
    const accountMedia = registered[index];
    return media && accountMedia
      && media.checksum === asset.checksum
      && media.deliveryUrl === asset.deliveryUrl
      && accountMedia.checksum === asset.checksum
      && accountMedia.deliveryUrl === asset.deliveryUrl
      && accountMedia.association?.type === "collection";
  });
}

export default createGridExportHandlers({
  auth, getStore: getBlobStore,
  requireMembership: createCapabilityChecker({
    billing: getBillingServices(), capability: "fandom_collector",
  }),
  verifyMasterAssets,
}).handler;
