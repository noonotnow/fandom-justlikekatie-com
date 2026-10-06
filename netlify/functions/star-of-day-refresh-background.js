import { createDailyDropRefreshWorker } from "./lib/daily-drop-refresh-worker.js";

// The suffix keeps background mode compatible with the pinned Netlify CLI.
export default createDailyDropRefreshWorker();
