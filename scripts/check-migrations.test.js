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

test("rejects ordinary DDL that fails when a partially applied migration retries", () => {
  assert.throws(
    () =>
      validateMigrations([
        {
          name: "001_accounts.sql",
          sql: `CREATE TABLE accounts (id TEXT PRIMARY KEY);
ALTER TABLE accounts ADD COLUMN status TEXT;
CREATE INDEX accounts_status_idx ON accounts (status);`,
        },
      ]),
    error => {
      assert.match(error.message, /CREATE TABLE accounts needs IF NOT EXISTS/);
      assert.match(
        error.message,
        /ALTER TABLE accounts has a structural change without/,
      );
      assert.match(
        error.message,
        /CREATE INDEX accounts_status_idx needs IF NOT EXISTS/,
      );
      return true;
    },
  );
});

test("accepts conditional ordinary DDL after an interrupted deployment", () => {
  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_accounts.sql",
        sql: `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY);
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS status TEXT,
  DROP COLUMN IF EXISTS legacy_status;
CREATE INDEX IF NOT EXISTS accounts_status_idx ON accounts (status);`,
      },
    ]),
  );
});

test("accepts explicit repair and guarded procedural DDL patterns", () => {
  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_accounts.sql",
        sql: `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY);
DROP INDEX IF EXISTS accounts_status_idx;
CREATE INDEX accounts_status_idx ON accounts (status);
ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_status_check;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_status_check CHECK (status <> '');
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_owner_check'
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_owner_check CHECK (id <> '');
  END IF;
END
$migration$;`,
      },
    ]),
  );
});

test("ignores DDL owned by an external schema", () => {
  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_accounts.sql",
        sql: `CREATE TABLE stripe.managed_accounts (id TEXT PRIMARY KEY);
ALTER TABLE stripe.managed_accounts ADD COLUMN status TEXT;`,
      },
    ]),
  );
});

test("ignores DDL examples in text and dollar-quoted procedural bodies", () => {
  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_accounts.sql",
        sql: `CREATE TABLE IF NOT EXISTS accounts (
  note TEXT DEFAULT 'CREATE TABLE unsafe_example (id TEXT)'
);
DO $migration$
BEGIN
  ALTER TABLE accounts ADD COLUMN status TEXT;
END
$migration$;`,
      },
    ]),
  );
});

test("allows repeatable ALTER TABLE state changes", () => {
  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_accounts.sql",
        sql: `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY);
ALTER TABLE accounts ALTER COLUMN id SET NOT NULL;
ALTER TABLE accounts ALTER COLUMN id SET DEFAULT 'pending';`,
      },
    ]),
  );
});

test("rejects advanced DDL that fails when an interrupted migration retries", () => {
  assert.throws(
    () =>
      validateMigrations([
        {
          name: "001_advanced_objects.sql",
          sql: `CREATE FUNCTION public.account_slug(account_id TEXT)
RETURNS TEXT LANGUAGE SQL AS 'SELECT account_id';
CREATE VIEW public.active_accounts AS SELECT id FROM accounts;
CREATE TRIGGER accounts_updated BEFORE UPDATE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE POLICY accounts_owner ON public.accounts USING (owner_id = current_user);`,
        },
      ]),
    error => {
      assert.match(error.message, /CREATE FUNCTION public\.account_slug/);
      assert.match(error.message, /CREATE VIEW public\.active_accounts/);
      assert.match(
        error.message,
        /CREATE TRIGGER accounts_updated ON public\.accounts/,
      );
      assert.match(
        error.message,
        /CREATE POLICY accounts_owner ON public\.accounts/,
      );
      return true;
    },
  );
});

test("accepts retry-safe advanced DDL forms", () => {
  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_advanced_objects.sql",
        sql: `CREATE OR REPLACE FUNCTION public.account_slug(account_id TEXT)
RETURNS TEXT LANGUAGE SQL AS 'SELECT account_id';
CREATE OR REPLACE VIEW public.active_accounts AS SELECT id FROM accounts;
DROP FUNCTION IF EXISTS public.legacy_slug(TEXT);
CREATE FUNCTION public.legacy_slug(TEXT)
RETURNS TEXT LANGUAGE SQL AS 'SELECT $1';
DROP TRIGGER IF EXISTS accounts_updated ON public.accounts;
CREATE TRIGGER accounts_updated BEFORE UPDATE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP POLICY IF EXISTS accounts_owner ON public.accounts;
CREATE POLICY accounts_owner ON public.accounts USING (owner_id = current_user);
DROP VIEW IF EXISTS public.account_summary;
CREATE VIEW public.account_summary AS SELECT count(*) FROM accounts;
DROP FUNCTION IF EXISTS public.named_slug(TEXT);
CREATE FUNCTION public.named_slug(account_id TEXT)
RETURNS TEXT LANGUAGE SQL AS 'SELECT account_id';
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'account_reader') THEN
    CREATE POLICY account_reader ON public.accounts USING (true);
  END IF;
END
$migration$;`,
      },
    ]),
  );
});

test("recognizes modified ordinary view declarations", () => {
  assert.throws(
    () =>
      validateMigrations([
        {
          name: "001_advanced_objects.sql",
          sql: `CREATE RECURSIVE VIEW public.account_tree(id) AS SELECT id FROM accounts;
CREATE TEMP VIEW public.pending_accounts AS SELECT id FROM accounts;
CREATE TEMPORARY RECURSIVE VIEW public.pending_tree(id) AS SELECT id FROM accounts;`,
        },
      ]),
    error => {
      assert.match(error.message, /CREATE VIEW public\.account_tree/);
      assert.match(error.message, /CREATE VIEW public\.pending_accounts/);
      assert.match(error.message, /CREATE VIEW public\.pending_tree/);
      return true;
    },
  );

  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_advanced_objects.sql",
        sql: `CREATE OR REPLACE RECURSIVE VIEW public.account_tree(id) AS SELECT id FROM accounts;
CREATE OR REPLACE TEMP VIEW public.pending_accounts AS SELECT id FROM accounts;`,
      },
    ]),
  );
});

test("requires advanced repair drops to match the created object", () => {
  assert.throws(
    () =>
      validateMigrations([
        {
          name: "001_advanced_objects.sql",
          sql: `DROP TRIGGER IF EXISTS other_trigger ON public.accounts;
CREATE TRIGGER accounts_updated BEFORE UPDATE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP POLICY IF EXISTS accounts_owner ON public.other_accounts;
CREATE POLICY accounts_owner ON public.accounts USING (true);`,
        },
      ]),
    error => {
      assert.match(error.message, /CREATE TRIGGER accounts_updated/);
      assert.match(error.message, /CREATE POLICY accounts_owner/);
      return true;
    },
  );
});

test("requires routine repair drops to match the created routine kind", () => {
  assert.throws(
    () =>
      validateMigrations([
        {
          name: "001_advanced_objects.sql",
          sql: `DROP PROCEDURE IF EXISTS public.refresh_account();
CREATE FUNCTION public.refresh_account()
RETURNS trigger LANGUAGE SQL AS 'SELECT NULL';
DROP FUNCTION IF EXISTS public.sync_account();
CREATE PROCEDURE public.sync_account()
LANGUAGE SQL AS 'SELECT NULL';`,
        },
      ]),
    error => {
      assert.match(
        error.message,
        /CREATE FUNCTION public\.refresh_account\(\) needs/,
      );
      assert.match(
        error.message,
        /CREATE PROCEDURE public\.sync_account\(\) needs/,
      );
      return true;
    },
  );
});

test("ignores advanced objects owned by an external schema", () => {
  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_external_objects.sql",
        sql: `CREATE FUNCTION stripe.refresh_account() RETURNS trigger LANGUAGE SQL AS 'SELECT NULL';
CREATE VIEW stripe.account_summary AS SELECT 1;
CREATE TRIGGER account_sync AFTER UPDATE ON stripe.accounts
FOR EACH ROW EXECUTE FUNCTION stripe.sync_account();
CREATE POLICY account_reader ON stripe.accounts USING (true);`,
      },
    ]),
  );
});