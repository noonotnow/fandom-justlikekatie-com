import { getBlobStore } from "./lib/blob-store.js";
import { createIdeaPacketsHandler } from "./lib/idea-packets.js";

export default createIdeaPacketsHandler({ getStore: getBlobStore });
