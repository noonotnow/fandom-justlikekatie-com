import { getBlobStore } from "./lib/blob-store.js";
import {
  archiveAccessHealth,
  notifyArchiveAccessTransitions,
  sendArchiveAccessNotification,
} from "./lib/archive-access-operations.js";

export default async (_req, context) => {
  const store = getBlobStore("archive-access-operations", context);
  const now = new Date();
  try {
    const health = await archiveAccessHealth(store, now);
    await notifyArchiveAccessTransitions({
      store,
      health,
      now,
      notify: payload => sendArchiveAccessNotification({ payload }),
    });
  } catch (error) {
    console.error("[archive-access] scheduled health notification failed", {
      message: error instanceof Error ? error.message : "Unknown scheduled failure",
    });
  }
  return new Response(null, { status: 204 });
};

export const config = { schedule: "@hourly" };