import { getBlobStore } from "./lib/blob-store.js";
import { createIdeaPacketMigrationHandler } from "./lib/idea-packet-migration.js";

export default createIdeaPacketMigrationHandler({
  getStore: (name, context) => getBlobStore(name, context, { consistency: "strong" }),
});
