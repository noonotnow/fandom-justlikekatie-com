import assert from "node:assert/strict";
import test from "node:test";

import {
  loadMigrations,
  NON_TRANSACTIONAL_MARKER,
  validateMigrations,
} from "./check-migrations.js";

const ordinaryMigration = {
  name: "001_accounts.sql",
  sql: "CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY);",
};

function concurrentMigration(overrides = {}) {
  return {
    name: "002_retention_index.sql",
    sql: `${NON_TRANSACTIONAL_MARKER}
DROP INDEX CONCURRENTLY IF EXISTS public.retention_idx;
CREATE INDEX CONCURRENTLY retention_idx ON events (processed_at);`,
    ...overrides,
  };
}

test("validates every committed application migration", async () => {
  const migrations = await loadMigrations();
  assert.equal(migrations.length, 2);
  assert.doesNotThrow(() => validateMigrations(migrations));
});

test("accepts contiguous numbered migrations and retry-safe concurrent indexes", () => {
  assert.doesNotThrow(() =>
    validateMigrations([ordinaryMigration, concurrentMigration()]),
  );
});

test("rejects malformed and non-contiguous migration numbering", () => {
  assert.throws(
    () =>
      validateMigrations([
        ordinaryMigration,
        concurrentMigration({ name: "003-retention.sql" }),
      ]),
    /003-retention\.sql: expected a name like 001_descriptive_name\.sql/,
  );
  assert.throws(
    () =>
      validateMigrations([
        ordinaryMigration,
        concurrentMigration({ name: "003_retention.sql" }),
      ]),
    /expected migration number 002/,
  );
});

test("requires the non-transactional marker for concurrent index creation", () => {
  assert.throws(
    () =>
      validateMigrations([
        ordinaryMigration,
        concurrentMigration({
          sql: `DROP INDEX CONCURRENTLY IF EXISTS retention_idx;
CREATE INDEX CONCURRENTLY retention_idx ON events (processed_at);`,
        }),
      ]),
    /requires -- postgres-migrations disable-transaction on the first line/,
  );
});

test("rejects explicit transactions around concurrent index operations", () => {
  assert.throws(
    () =>
      validateMigrations([
        ordinaryMigration,
        concurrentMigration({
          sql: `${NON_TRANSACTIONAL_MARKER}
BEGIN;
DROP INDEX CONCURRENTLY IF EXISTS retention_idx;
CREATE INDEX CONCURRENTLY retention_idx ON events (processed_at);
COMMIT;`,
        }),
      ]),
    /cannot run inside an explicit transaction/,
  );
});

test("requires drop-before-create retry handling for each concurrent index", () => {
  assert.throws(
    () =>
      validateMigrations([
        ordinaryMigration,
        concurrentMigration({
          sql: `${NON_TRANSACTIONAL_MARKER}
CREATE INDEX CONCURRENTLY retention_idx ON events (processed_at);`,
        }),
      ]),
    /must be preceded by DROP INDEX CONCURRENTLY IF EXISTS/,
  );
  assert.throws(
    () =>
      validateMigrations([
        ordinaryMigration,
        concurrentMigration({
          sql: `${NON_TRANSACTIONAL_MARKER}
CREATE INDEX CONCURRENTLY retention_idx ON events (processed_at);
DROP INDEX CONCURRENTLY IF EXISTS retention_idx;`,
        }),
      ]),
    /must be preceded by DROP INDEX CONCURRENTLY IF EXISTS/,
  );
});