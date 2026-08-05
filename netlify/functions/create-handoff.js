import { getBlobStore } from "./lib/blob-store.js";
import { createCreateHandoffHandler } from "./lib/create-handoff.js";

export default createCreateHandoffHandler({ getStore: getBlobStore });
