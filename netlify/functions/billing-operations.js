import pg from "pg";
import { createPublicAuth } from "./lib/public-auth.js";
import { getBlobStore } from "./lib/blob-store.js";
import { createBlobBillingRepository } from "./lib/billing-blob-repository.js";
import {
  createBillingOperationsHandler,
  createReceiptIndexHealthCheck,
} from "./lib/billing-operations.js";

const auth = createPublicAuth({ getStore: getBlobStore });
let pool;
const getReceiptIndexHealth = () => {
  if (!process.env.DATABASE_URL) {
    return { status: "unavailable", releaseReady: false };
  }
  pool ||= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  return createReceiptIndexHealthCheck({
    query: (...args) => pool.query(...args),
  })();
};

export default createBillingOperationsHandler({
  auth,
  getRepository: context => createBlobBillingRepository({ getStore: getBlobStore, context }),
  getReceiptIndexHealth,
});