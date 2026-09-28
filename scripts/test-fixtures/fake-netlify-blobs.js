import { readFile, rename, writeFile } from "node:fs/promises";

async function readRecord(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export function getStore(options) {
  if (
    options?.siteID !== process.env.SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_SITE_ID
    || options?.token !== process.env.SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_TOKEN
  ) {
    throw new Error("The audit did not pass its configured Blob credentials.");
  }
  const path = process.env.FAKE_BLOB_STATE_PATH;
  if (!path) throw new Error("Fake shared Blob storage is unavailable.");

  return {
    async getWithMetadata() {
      const record = await readRecord(path);
      return record
        ? { data: record.value, etag: `"${record.revision}"` }
        : null;
    },
    async setJSON(_key, value, options = {}) {
      const current = await readRecord(path);
      if (options.onlyIfNew && current) return { modified: false };
      if (
        options.onlyIfMatch
        && options.onlyIfMatch !== `"${current?.revision}"`
      ) {
        return { modified: false };
      }
      const next = {
        revision: (current?.revision || 0) + 1,
        value,
      };
      const temporaryPath = `${path}.${process.pid}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(next));
      await rename(temporaryPath, path);
      return { modified: true, etag: `"${next.revision}"` };
    },
  };
}