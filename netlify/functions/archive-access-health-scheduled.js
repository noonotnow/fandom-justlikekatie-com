import { getBlobStore } from "./lib/blob-store.js";
import {
  archiveAccessHealth,
  notifyArchiveAccessTransitions,
  sendArchiveAccessNotification,
} from "./lib/archive-access-operations.js";

export function createArchiveAccessHealthScheduledHandler({
  getStore = context => getBlobStore("archive-access-operations", context),
  getHealth = archiveAccessHealth,
  notifyTransitions = notifyArchiveAccessTransitions,
  notify = payload => sendArchiveAccessNotification({ payload }),
  now = () => new Date(),
  logger = console,
} = {}) {
  return async (_req, context) => {
    try {
      const store = getStore(context);
      const generatedAt = now();
      const health = await getHealth(store, generatedAt);
      await notifyTransitions({
        store,
        health,
        now: generatedAt,
        notify,
      });
    } catch (error) {
      logger.error("[archive-access] scheduled health notification failed", {
        message: error instanceof Error ? error.message : "Unknown scheduled failure",
      });
    }
    return new Response(null, { status: 204 });
  };
}

export default createArchiveAccessHealthScheduledHandler();

export const config = { schedule: "@hourly" };
