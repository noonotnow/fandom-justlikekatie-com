import { getBlobStore } from "./lib/blob-store.js";
import { createCompanionInterest } from "./lib/companion-interest.js";

export default createCompanionInterest({ getStore: getBlobStore });