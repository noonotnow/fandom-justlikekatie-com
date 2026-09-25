import { getBlobStore } from "./lib/blob-store.js";
import { createArchiveAccessRetentionHandler } from "./lib/archive-access-operations.js";

export const ARCHIVE_ACCESS_RETENTION_STORE = "archive-access-operations";
export const config = { schedule: "@daily" };

export default createArchiveAccessRetentionHandler({
  getStore: context => getBlobStore(ARCHIVE_ACCESS_RETENTION_STORE, context),
});