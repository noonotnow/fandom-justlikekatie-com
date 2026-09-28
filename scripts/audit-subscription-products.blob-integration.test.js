import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { getStore } from "@netlify/blobs";

const WORKER = new URL(
  "./test-fixtures/subscription-audit-blob-worker.js",
  import.meta.url,
);
const siteID = process.env.SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_SITE_ID?.trim();
const token = process.env.SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_TOKEN?.trim();
const hasBlobCredentials = Boolean(siteID && token);

function runAuditProcess(progressReportingFailures, key) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [WORKER.pathname, String(progressReportingFailures), key],
      {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) {
        reject(new Error(`Blob audit process exited ${code}: ${stderr}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
}

test(
  "deployed Blob storage serializes concurrent audit failure and recovery runs",
  { skip: !hasBlobCredentials, timeout: 30_000 },
  async t => {
    const key = `integration/progress-reporting-health/${crypto.randomUUID()}`;
    const store = getStore({
      name: "subscription-product-audit-health",
      siteID,
      token,
    });
    t.after(async () => {
      await store.delete(key);
    });

    const firstFailure = await runAuditProcess(1, key);
    assert.equal(firstFailure.shouldAlert, false);

    const concurrentFailures = await Promise.all([
      runAuditProcess(1, key),
      runAuditProcess(1, key),
    ]);
    assert.equal(
      concurrentFailures.filter(result => result.shouldAlert).length,
      1,
    );
    assert.deepEqual(
      concurrentFailures.map(result => result.state.consecutiveFailureRuns),
      [2, 2],
    );

    const storedFailure = await store.get(key, {
      type: "json",
      consistency: "strong",
    });
    assert.deepEqual(storedFailure, {
      consecutiveFailureRuns: 2,
      alertDelivery: "pending",
    });

    const recoveries = await Promise.all([
      runAuditProcess(0, key),
      runAuditProcess(0, key),
    ]);
    assert.deepEqual(
      recoveries.map(result => result.state.consecutiveFailureRuns),
      [0, 0],
    );

    const storedRecovery = await store.get(key, {
      type: "json",
      consistency: "strong",
    });
    assert.deepEqual(storedRecovery, {
      consecutiveFailureRuns: 0,
      alertDelivery: "not_attempted",
    });
    assert.deepEqual(Object.keys(storedRecovery).sort(), [
      "alertDelivery",
      "consecutiveFailureRuns",
    ]);
  },
);