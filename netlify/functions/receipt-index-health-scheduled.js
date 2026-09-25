import pg from "pg";
import { getBlobStore } from "./lib/blob-store.js";
import {
  createReceiptIndexHealthCheck,
  notifyReceiptIndexTransition,
  sendReceiptIndexNotification,
} from "./lib/billing-operations.js";

let pool;

function receiptIndexHealth() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Receipt index health database is not configured.");
  }
  pool ||= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  return createReceiptIndexHealthCheck({
    query: (...args) => pool.query(...args),
  })();
}

export function createReceiptIndexHealthScheduledHandler({
  getStore = context => getBlobStore("billing-operations", context),
  getHealth = receiptIndexHealth,
  notifyTransition = notifyReceiptIndexTransition,
  notify = payload => sendReceiptIndexNotification({ payload }),
  now = () => new Date(),
  logger = console,
} = {}) {
  return async (_req, context) => {
    try {
      const observedAt = now();
      await notifyTransition({
        store: getStore(context),
        health: await getHealth(context),
        notify,
        now: observedAt,
         logger,
      });
    } catch (error) {
      logger.error("[billing-operations] scheduled receipt index notification failed", {
        message: error instanceof Error ? error.message : "Unknown scheduled failure",
      });
    }
    return new Response(null, { status: 204 });
  };
}

export default createReceiptIndexHealthScheduledHandler();

export const config = { schedule: "@hourly" };