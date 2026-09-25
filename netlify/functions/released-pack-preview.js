import { createReleasedPackPreviewHandler } from "./lib/released-pack-preview.js";

// The preview handler accepts a Web Request and returns a Web Response.
// Export it as a Netlify Functions V2 entrypoint; a named `handler` invokes
// the classic event/response protocol and produces a 502 at the edge.
export default createReleasedPackPreviewHandler();
