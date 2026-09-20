import { getBlobStore } from "./lib/blob-store.js";
import { createArchiveAccessRetentionHandler } from "./lib/archive-access-operations.js";

export const config = { schedule: "@daily" };

export default createArchiveAccessRetentionHandler({
  getStore: context => getBlobStore("archive-access-operations", context),
});