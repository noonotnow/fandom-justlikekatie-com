import { getBlobStore } from "./lib/blob-store.js";
import { checkDiscussionCapacity, sendDiscussionCapacityAlert } from "./lib/vibing-capacity.js";

export function createVibingCapacityScheduledHandler({
  getStore = context => getBlobStore("fandom-vibing-discussions", context),
  notify = payload => sendDiscussionCapacityAlert({ payload }),
  check = checkDiscussionCapacity,
  logger = console,
} = {}) {
  return async (_req, context) => {
    try {
      await check({ store: getStore(context), notify });
      return new Response(null, { status: 204 });
    } catch {
      // Do not log archive contents or email provider details.
      logger.error("[vibing-discussion] scheduled capacity check failed");
      return new Response(null, { status: 503 });
    }
  };
}

export default createVibingCapacityScheduledHandler();
export const config = { schedule: "@hourly" };