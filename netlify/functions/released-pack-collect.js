import { getBlobStore } from "./lib/blob-store.js";
import { createReleasedPackCollectHandler } from "./lib/released-pack-analytics.js";

export default createReleasedPackCollectHandler({ getStore: getBlobStore });