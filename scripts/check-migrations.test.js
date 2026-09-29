import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

import {
  applyMigrations,
  loadMigrations,
  NON_TRANSACTIONAL_MARKER,
  splitSqlStatements,
  validateMigrations,
} from "./check-migrations.js";

const { Client } = pg;
const migrationTestDatabaseUrl = process.env.MIGRATION_TEST_DATABASE_URL;

function assertPostgresCompatibilityMatrix(packageJson, workflow) {
  const supportedMajors = packageJson.postgresCompatibility?.supportedMajors;
  const nextMajor = packageJson.postgresCompatibility?.nextMajor;
  assert.ok(
    Array.isArray(supportedMajors) && supportedMajors.length > 0,
    "package.json postgresCompatibility.supportedMajors must list at least one supported PostgreSQL major",
  );
  assert.ok(
    supportedMajors.every(
      major => typeof major === "string" && /^[1-9]\d*$/.test(major),
    ),
    "package.json postgresCompatibility.supportedMajors must contain PostgreSQL major versions as strings",
  );
  assert.equal(
    new Set(supportedMajors).size,
    supportedMajors.length,
    "package.json postgresCompatibility.supportedMajors must not contain duplicates",
  );
  assert.match(
    nextMajor ?? "",
    /^[1-9]\d*$/,
    "package.json postgresCompatibility.nextMajor must be a PostgreSQL major version string",
  );
  assert.ok(
    !supportedMajors.includes(nextMajor),
    "package.json postgresCompatibility.nextMajor must remain separate from supportedMajors until an explicit reviewed promotion",
  );
  assert.equal(
    Number(nextMajor),
    Math.max(...supportedMajors.map(Number)) + 1,
    "package.json postgresCompatibility.nextMajor must be the major immediately after the newest supported major",
  );

  const matrixMatch = workflow.match(
    /migration-retry:[\s\S]*?\n\s+matrix:\s*\n\s+postgres:\s*\[([^\]]*)\]/,
  );
  assert.ok(
    matrixMatch,
    ".github/workflows/test.yml migration-retry must declare an inline postgres matrix",
  );

  const matrixMajors = [...matrixMatch[1].matchAll(/["'](\d+)["']/g)].map(
    match => match[1],
  );
  assert.deepEqual(
    matrixMajors,
    supportedMajors,
    "PostgreSQL compatibility is out of sync: update .github/workflows/test.yml migration-retry matrix.postgres to exactly match package.json postgresCompatibility.supportedMajors",
  );

  const candidateJobMatch = workflow.match(
    /migration-next-major:\s*\n([\s\S]*?)(?=\n {2}[\w-]+:\s*\n|$)/,
  );
  assert.ok(
    candidateJobMatch,
    ".github/workflows/test.yml must define a migration-next-major compatibility job",
  );
  const candidateJob = candidateJobMatch[1];
  assert.match(
    candidateJob,
    /if:\s*github\.event_name == 'schedule' \|\| \(github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'\)/,
    "migration-next-major must run only on the schedule or a main-branch manual dispatch",
  );
  const candidateMatrixMatch = candidateJob.match(
    /matrix:\s*\n\s+postgres:\s*\[([^\]]*)\]/,
  );
  assert.ok(
    candidateMatrixMatch,
    "migration-next-major must declare an inline postgres matrix",
  );
  const candidateMajors = [
    ...candidateMatrixMatch[1].matchAll(/["'](\d+)["']/g),
  ].map(match => match[1]);
  assert.deepEqual(
    candidateMajors,
    [nextMajor],
    "PostgreSQL candidate compatibility is out of sync: update .github/workflows/test.yml migration-next-major matrix.postgres to exactly match package.json postgresCompatibility.nextMajor",
  );
  assert.match(
    candidateJob,
    /node --test --test-name-pattern="applies every committed migration twice" scripts\/check-migrations\.test\.js/,
    "migration-next-major must apply every committed migration twice",
  );
}

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

test("migration retry CI covers every supported PostgreSQL major", async () => {
  const [packageJson, workflow] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../.github/workflows/test.yml", import.meta.url), "utf8"),
  ]);

  assert.doesNotThrow(() =>
    assertPostgresCompatibilityMatrix(packageJson, workflow),
  );
});

test("PostgreSQL compatibility drift explains how to synchronize CI", () => {
  const workflow = `migration-retry:
    strategy:
      matrix:
        postgres: ["16", "17"]

  migration-next-major:
    if: github.event_name == 'schedule' || (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main')
    strategy:
      matrix:
        postgres: ["19"]
    steps:
      - run: node --test --test-name-pattern="applies every committed migration twice" scripts/check-migrations.test.js`;
  const expectedMessage =
    /update \.github\/workflows\/test\.yml migration-retry matrix\.postgres to exactly match package\.json postgresCompatibility\.supportedMajors/;

  for (const supportedMajors of [
    ["16"],
    ["16", "17", "18"],
  ]) {
    const nextMajor = String(Math.max(...supportedMajors.map(Number)) + 1);
    assert.throws(
      () =>
        assertPostgresCompatibilityMatrix(
          { postgresCompatibility: { supportedMajors, nextMajor } },
          workflow,
        ),
      expectedMessage,
    );
  }
});

test("PostgreSQL candidate drift remains separate from supported versions", () => {
  const workflow = `migration-retry:
    strategy:
      matrix:
        postgres: ["16", "17"]

  migration-next-major:
    if: github.event_name == 'schedule' || (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main')
    strategy:
      matrix:
        postgres: ["19"]
    steps:
      - run: node --test --test-name-pattern="applies every committed migration twice" scripts/check-migrations.test.js`;

  assert.throws(
    () =>
      assertPostgresCompatibilityMatrix(
        {
          postgresCompatibility: {
            supportedMajors: ["16", "17"],
            nextMajor: "18",
          },
        },
        workflow,
      ),
    /update \.github\/workflows\/test\.yml migration-next-major matrix\.postgres to exactly match package\.json postgresCompatibility\.nextMajor/,
  );
});

test(
  "applies every committed migration twice in PostgreSQL",
  { skip: migrationTestDatabaseUrl ? false : "MIGRATION_TEST_DATABASE_URL is not set" },
  async () => {
    const databaseName = `migration_retry_${randomUUID().replaceAll("-", "")}`;
    const adminClient = new Client({ connectionString: migrationTestDatabaseUrl });
    await adminClient.connect();

    try {
      await adminClient.query(`CREATE DATABASE "${databaseName}"`);
      const databaseUrl = new URL(migrationTestDatabaseUrl);
      databaseUrl.pathname = `/${databaseName}`;
      const migrationClient = new Client({ connectionString: databaseUrl.href });

      try {
        await migrationClient.connect();
        const migrations = await loadMigrations();
        await applyMigrations(migrationClient, migrations, 1);
        await applyMigrations(migrationClient, migrations, 2);
      } finally {
        await migrationClient.end().catch(() => {});
      }
    } finally {
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      await adminClient.end();
    }
  },
);

test("migration application failures identify the migration and pass", async () => {
  const client = {
    async query() {
      throw new Error("unsupported syntax");
    },
  };

  await assert.rejects(
    applyMigrations(
      client,
      [{ name: "001_incompatible.sql", sql: "SELECT incompatible();" }],
      2,
    ),
    /Migration 001_incompatible\.sql failed on application 2: unsupported syntax/,
  );
});

test("splits only top-level migration statements", () => {
  assert.deepEqual(
    splitSqlStatements(`DO $migration$
BEGIN
  PERFORM 'value;still-quoted';
END
$migration$;
/* comment; */ CREATE TABLE "semi;colon" (id TEXT DEFAULT ';');`),
    [
      `DO $migration$
BEGIN
  PERFORM 'value;still-quoted';
END
$migration$;`,
      `/* comment; */ CREATE TABLE "semi;colon" (id TEXT DEFAULT ';');`,
    ],
  );
});

test("keeps PostgreSQL escape-string semicolons inside their statement", () => {
  const sql = String.raw`SELECT E'last\'; first' AS name;
SELECT e'it''s; still quoted' AS doubled;
SELECT E'back\\; still quoted' AS backslashes;
SELECT E'back\\'; SELECT 'ordinary; text';`;

  assert.deepEqual(splitSqlStatements(sql), [
    String.raw`SELECT E'last\'; first' AS name;`,
    String.raw`SELECT e'it''s; still quoted' AS doubled;`,
    String.raw`SELECT E'back\\; still quoted' AS backslashes;`,
    String.raw`SELECT E'back\\';`,
    "SELECT 'ordinary; text';",
  ]);
});

test("applies the complete PostgreSQL escape-string statement", async () => {
  const statements = [];
  const client = { async query(statement) { statements.push(statement); } };
  const first = String.raw`SELECT E'last\'; first' AS name;`;
  const second = "SELECT 2;";

  await applyMigrations(client, [
    { name: "001_escaped_text.sql", sql: `${first}\n${second}` },
  ]);

  assert.deepEqual(statements, [first, second]);
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

test("rejects unguarded advanced object drops and renames", () => {
  assert.throws(
    () =>
      validateMigrations([
        {
          name: "001_advanced_removals.sql",
          sql: `DROP FUNCTION public.legacy_slug(TEXT);
DROP PROCEDURE public.refresh_accounts();
DROP VIEW public.legacy_accounts;
DROP TRIGGER legacy_touch ON public.accounts;
DROP POLICY legacy_reader ON public.accounts;
ALTER FUNCTION public.account_slug(TEXT) RENAME TO legacy_account_slug;
ALTER PROCEDURE public.sync_accounts() RENAME TO legacy_sync_accounts;
ALTER VIEW public.active_accounts RENAME TO current_accounts;
ALTER TRIGGER accounts_updated ON public.accounts RENAME TO accounts_touched;
ALTER POLICY accounts_owner ON public.accounts RENAME TO account_owner;`,
        },
      ]),
    error => {
      assert.match(error.message, /DROP FUNCTION public\.legacy_slug needs IF EXISTS/);
      assert.match(error.message, /DROP PROCEDURE public\.refresh_accounts needs IF EXISTS/);
      assert.match(error.message, /DROP VIEW public\.legacy_accounts needs IF EXISTS/);
      assert.match(error.message, /DROP TRIGGER legacy_touch ON public\.accounts needs IF EXISTS/);
      assert.match(error.message, /DROP POLICY legacy_reader ON public\.accounts needs IF EXISTS/);
      assert.match(error.message, /ALTER FUNCTION public\.account_slug RENAME needs/);
      assert.match(error.message, /ALTER PROCEDURE public\.sync_accounts RENAME needs/);
      assert.match(error.message, /ALTER VIEW public\.active_accounts RENAME needs/);
      assert.match(error.message, /ALTER TRIGGER accounts_updated ON public\.accounts RENAME needs/);
      assert.match(error.message, /ALTER POLICY accounts_owner ON public\.accounts RENAME needs/);
      return true;
    },
  );
});

test("accepts guarded advanced object drops and procedural renames", () => {
  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_advanced_removals.sql",
        sql: `DROP FUNCTION IF EXISTS public.legacy_slug(TEXT);
DROP PROCEDURE IF EXISTS public.refresh_accounts();
DROP VIEW IF EXISTS public.legacy_accounts;
DROP TRIGGER IF EXISTS legacy_touch ON public.accounts;
DROP POLICY IF EXISTS legacy_reader ON public.accounts;
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'account_slug') THEN
    ALTER FUNCTION public.account_slug(TEXT) RENAME TO legacy_account_slug;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'active_accounts') THEN
    ALTER VIEW public.active_accounts RENAME TO current_accounts;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'accounts_updated') THEN
    ALTER TRIGGER accounts_updated ON public.accounts RENAME TO accounts_touched;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'accounts_owner') THEN
    ALTER POLICY accounts_owner ON public.accounts RENAME TO account_owner;
  END IF;
END
$migration$;`,
      },
    ]),
  );
});

test("rejects final routine renames without a trailing semicolon", () => {
  for (const statement of [
    "ALTER FUNCTION public.account_slug(TEXT) RENAME TO legacy_account_slug",
    "ALTER PROCEDURE public.sync_accounts() RENAME TO legacy_sync_accounts",
  ]) {
    assert.throws(
      () =>
        validateMigrations([
          {
            name: "001_advanced_removals.sql",
            sql: statement,
          },
        ]),
      /ALTER (?:FUNCTION|PROCEDURE) public\.[a-z_]+ RENAME needs/,
    );
  }
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
CREATE POLICY account_reader ON stripe.accounts USING (true);
DROP FUNCTION stripe.legacy_refresh();
DROP VIEW stripe.legacy_accounts;
DROP TRIGGER legacy_sync ON stripe.accounts;
DROP POLICY legacy_reader ON stripe.accounts;
ALTER FUNCTION stripe.refresh_account() RENAME TO refresh_accounts;
ALTER VIEW stripe.account_summary RENAME TO account_summaries;
ALTER TRIGGER account_sync ON stripe.accounts RENAME TO accounts_sync;
ALTER POLICY account_reader ON stripe.accounts RENAME TO accounts_reader;`,
      },
    ]),
  );
});

test("handles complex quoted advanced-object names", () => {
  assert.throws(
    () =>
      validateMigrations([
        {
          name: "001_complex_names.sql",
          sql: `CREATE VIEW "public"."active accounts" AS SELECT 1;
DROP VIEW "public"."old ""accounts";
DROP FUNCTION "public"."format ""account"(numeric(12, 2));`,
        },
      ]),
    error => {
      assert.match(error.message, /CREATE VIEW "public"\."active accounts"/);
      assert.match(error.message, /DROP VIEW "public"\."old ""accounts" needs IF EXISTS/);
      assert.match(error.message, /DROP FUNCTION "public"\."format ""account" needs IF EXISTS/);
      return true;
    },
  );

  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_complex_names.sql",
        sql: `DROP VIEW IF EXISTS "public"."active accounts";
CREATE VIEW "public"."active accounts" AS SELECT 1;
DROP FUNCTION IF EXISTS "public"."format ""account"(numeric(12, 2));
CREATE FUNCTION "public"."format ""account"(amount numeric(12, 2))
RETURNS text LANGUAGE SQL AS 'SELECT amount::text';`,
      },
    ]),
  );
});

test("matches overloaded routine repairs with nested type modifiers", () => {
  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_overloaded_routines.sql",
        sql: `DROP FUNCTION IF EXISTS public.render_account(numeric(12, 2), timestamp(3) with time zone);
CREATE FUNCTION public.render_account(amount numeric(12, 2), seen_at timestamp(3) with time zone)
RETURNS text LANGUAGE SQL AS 'SELECT amount::text';
DROP PROCEDURE IF EXISTS public.sync_account(character varying(40), INOUT numeric(9, 4));
CREATE PROCEDURE public.sync_account(IN label character varying(40), INOUT score numeric(9, 4))
LANGUAGE SQL AS 'SELECT NULL';`,
      },
    ]),
  );

  assert.throws(
    () =>
      validateMigrations([
        {
          name: "001_overloaded_routines.sql",
          sql: `DROP FUNCTION IF EXISTS public.render_account(numeric(10, 2), timestamp(3) with time zone);
CREATE FUNCTION public.render_account(amount numeric(12, 2), seen_at timestamp(3) with time zone)
RETURNS text LANGUAGE SQL AS 'SELECT amount::text';`,
        },
      ]),
    /CREATE FUNCTION public\.render_account\(numeric\(12,2\),timestamp\(3\)with time zone\) needs/,
  );
});

test("matches routine repairs when parameter defaults contain commas", () => {
  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_routine_defaults.sql",
        sql: `DROP FUNCTION IF EXISTS public.format_account(text, integer[], text);
CREATE FUNCTION public.format_account(
  label text DEFAULT 'last, first',
  ranks integer[] DEFAULT ARRAY[1, 2],
  metadata text DEFAULT concat('tier', ',', lower('gold'))
)
RETURNS text LANGUAGE SQL AS 'SELECT label';
DROP PROCEDURE IF EXISTS public.sync_account(text, INOUT integer[]);
CREATE PROCEDURE public.sync_account(
  IN label text DEFAULT 'last, first',
  INOUT ranks integer[] DEFAULT ARRAY[1, 2]
)
LANGUAGE SQL AS 'SELECT NULL';`,
      },
    ]),
  );
});

test("rejects mismatched overloads when routine defaults contain commas", () => {
  assert.throws(
    () =>
      validateMigrations([
        {
          name: "001_routine_defaults.sql",
          sql: `DROP FUNCTION IF EXISTS public.format_account(text, bigint[], text);
CREATE FUNCTION public.format_account(
  label text DEFAULT 'last, first',
  ranks integer[] DEFAULT ARRAY[1, 2],
  metadata text DEFAULT concat('tier', ',', lower('gold'))
)
RETURNS text LANGUAGE SQL AS 'SELECT label';
DROP PROCEDURE IF EXISTS public.sync_account(text, INOUT bigint[]);
CREATE PROCEDURE public.sync_account(
  IN label text DEFAULT 'last, first',
  INOUT ranks integer[] DEFAULT ARRAY[1, 2]
)
LANGUAGE SQL AS 'SELECT NULL';`,
        },
      ]),
    error => {
      assert.match(
        error.message,
        /CREATE FUNCTION public\.format_account\(text,integer\[\],text\) needs/,
      );
      assert.match(
        error.message,
        /CREATE PROCEDURE public\.sync_account\(text,inout integer\[\]\) needs/,
      );
      return true;
    },
  );
});

test("ignores external routines whose parameter defaults contain commas", () => {
  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_external_routine_defaults.sql",
        sql: `CREATE FUNCTION stripe.format_account(
  label text DEFAULT 'last, first',
  ranks integer[] DEFAULT ARRAY[1, 2]
)
RETURNS text LANGUAGE SQL AS 'SELECT label';
CREATE PROCEDURE stripe.sync_account(
  IN label text DEFAULT concat('last', ', first'),
  INOUT ranks integer[] DEFAULT ARRAY[1, 2]
)
LANGUAGE SQL AS 'SELECT NULL';`,
      },
    ]),
  );
});

test("matches function and procedure repairs with escaped-string defaults", () => {
  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_escaped_defaults.sql",
        sql: String.raw`DROP FUNCTION IF EXISTS public.format_account(text, integer);
CREATE FUNCTION public.format_account(
  label text DEFAULT E'last\', first',
  rank integer DEFAULT 1
)
RETURNS text LANGUAGE SQL AS 'SELECT label';
DROP PROCEDURE IF EXISTS public.sync_account(text, INOUT integer);
CREATE PROCEDURE public.sync_account(
  IN label text DEFAULT E'last\', first',
  INOUT rank integer DEFAULT 1
)
LANGUAGE SQL AS 'SELECT NULL';`,
      },
    ]),
  );
});

test("rejects mismatched overloads with escaped-string defaults", () => {
  assert.throws(
    () =>
      validateMigrations([
        {
          name: "001_escaped_defaults.sql",
          sql: String.raw`DROP FUNCTION IF EXISTS public.format_account(text, bigint);
CREATE FUNCTION public.format_account(
  label text DEFAULT E'last\', first',
  rank integer DEFAULT 1
)
RETURNS text LANGUAGE SQL AS 'SELECT label';
DROP PROCEDURE IF EXISTS public.sync_account(text, INOUT bigint);
CREATE PROCEDURE public.sync_account(
  IN label text DEFAULT E'last\', first',
  INOUT rank integer DEFAULT 1
)
LANGUAGE SQL AS 'SELECT NULL';`,
        },
      ]),
    error => {
      assert.match(
        error.message,
        /CREATE FUNCTION public\.format_account\(text,integer\) needs/,
      );
      assert.match(
        error.message,
        /CREATE PROCEDURE public\.sync_account\(text,inout integer\) needs/,
      );
      return true;
    },
  );
});

test("ignores external routines with escaped-string defaults", () => {
  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_external_escaped_defaults.sql",
        sql: String.raw`CREATE FUNCTION stripe.format_account(
  label text DEFAULT E'last\', first',
  rank integer DEFAULT 1
)
RETURNS text LANGUAGE SQL AS 'SELECT label';
CREATE PROCEDURE stripe.sync_account(
  IN label text DEFAULT E'last\', first',
  INOUT rank integer DEFAULT 1
)
LANGUAGE SQL AS 'SELECT NULL';`,
      },
    ]),
  );
});

test("matches routine repairs with quoted parameter names", () => {
  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_quoted_parameters.sql",
        sql: `DROP FUNCTION IF EXISTS public.render_account(numeric(12, 2), text, boolean);
CREATE FUNCTION public.render_account("account total" numeric(12, 2), "display ""label""" text, "time" boolean)
RETURNS text LANGUAGE SQL AS 'SELECT NULL';
DROP PROCEDURE IF EXISTS public.sync_account(character varying(40), INOUT numeric(9, 4), text);
CREATE PROCEDURE public.sync_account(IN "account label" character varying(40), INOUT "score ""value""" numeric(9, 4), IN "character" text)
LANGUAGE SQL AS 'SELECT NULL';
CREATE FUNCTION stripe.external_account("account total" numeric(12, 2))
RETURNS text LANGUAGE SQL AS 'SELECT NULL';
CREATE PROCEDURE stripe.external_sync(INOUT "score ""value""" numeric(9, 4))
LANGUAGE SQL AS 'SELECT NULL';`,
      },
    ]),
  );

  assert.throws(
    () =>
      validateMigrations([
        {
          name: "001_quoted_parameters.sql",
          sql: `DROP FUNCTION IF EXISTS public.render_account(numeric(10, 2), text, boolean);
CREATE FUNCTION public.render_account("account total" numeric(12, 2), "display ""label""" text, "time" boolean)
RETURNS text LANGUAGE SQL AS 'SELECT NULL';
DROP PROCEDURE IF EXISTS public.sync_account(character varying(40), INOUT numeric(8, 4), text);
CREATE PROCEDURE public.sync_account(IN "account label" character varying(40), INOUT "score ""value""" numeric(9, 4), IN "character" text)
LANGUAGE SQL AS 'SELECT NULL';`,
        },
      ]),
    error => {
      assert.match(
        error.message,
        /CREATE FUNCTION public\.render_account\(numeric\(12,2\),text,boolean\) needs/,
      );
      assert.match(
        error.message,
        /CREATE PROCEDURE public\.sync_account\(character varying\(40\),inout numeric\(9,4\),text\) needs/,
      );
      return true;
    },
  );
});

test("preserves unnamed quoted routine types", () => {
  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_quoted_types.sql",
        sql: `DROP FUNCTION IF EXISTS public.render_custom("MyType"[], "myschema"."MyType");
CREATE FUNCTION public.render_custom("MyType"[], "myschema"."MyType")
RETURNS text LANGUAGE SQL AS 'SELECT NULL';
DROP PROCEDURE IF EXISTS public.sync_custom(INOUT "MyType"[], "myschema"."MyType");
CREATE PROCEDURE public.sync_custom(INOUT "MyType"[], "myschema"."MyType")
LANGUAGE SQL AS 'SELECT NULL';`,
      },
    ]),
  );
});

test("checks every target in comma-separated advanced-object drops", () => {
  assert.throws(
    () =>
      validateMigrations([
        {
          name: "001_multi_drops.sql",
          sql: `DROP VIEW stripe.old_accounts, "public"."old accounts", stripe.old_events;
DROP FUNCTION stripe.cleanup(), public.cleanup(numeric(12, 2)), stripe.cleanup(text);
DROP PROCEDURE stripe.refresh(), "public"."refresh all"(character varying(20));`,
        },
      ]),
    error => {
      assert.match(error.message, /DROP VIEW "public"\."old accounts" needs IF EXISTS/);
      assert.match(error.message, /DROP FUNCTION public\.cleanup needs IF EXISTS/);
      assert.match(error.message, /DROP PROCEDURE "public"\."refresh all" needs IF EXISTS/);
      assert.doesNotMatch(error.message, /stripe\./);
      return true;
    },
  );

  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_multi_drops.sql",
        sql: `DROP VIEW IF EXISTS stripe.old_accounts, "public"."old accounts";
DROP FUNCTION IF EXISTS stripe.cleanup(), public.cleanup(numeric(12, 2));
DROP PROCEDURE stripe.refresh(), stripe.refresh(numeric(8, 2));`,
      },
    ]),
  );
});

test("treats dots inside unqualified quoted names as application-owned", () => {
  assert.throws(
    () =>
      validateMigrations([
        {
          name: "001_quoted_dots.sql",
          sql: `CREATE VIEW "active.accounts" AS SELECT 1;
DROP VIEW "old.accounts";`,
        },
      ]),
    error => {
      assert.match(error.message, /CREATE VIEW "active\.accounts" needs/);
      assert.match(error.message, /DROP VIEW "old\.accounts" needs IF EXISTS/);
      return true;
    },
  );
});

test("preserves PostgreSQL case rules when matching quoted repair names", () => {
  assert.throws(
    () =>
      validateMigrations([
        {
          name: "001_quoted_case.sql",
          sql: `DROP VIEW IF EXISTS public."Active";
CREATE VIEW public."active" AS SELECT 1;
DROP FUNCTION IF EXISTS public."Render"(text);
CREATE FUNCTION public."render"(value text)
RETURNS text LANGUAGE SQL AS 'SELECT value';`,
        },
      ]),
    error => {
      assert.match(error.message, /CREATE VIEW public\."active" needs/);
      assert.match(error.message, /CREATE FUNCTION public\."render"\(text\) needs/);
      return true;
    },
  );
});

test("keeps parentheses inside quoted routine types when matching repairs", () => {
  assert.throws(
    () =>
      validateMigrations([
        {
          name: "001_quoted_types.sql",
          sql: `DROP FUNCTION IF EXISTS public.convert_value(public."weird)one");
CREATE FUNCTION public.convert_value(value public."weird)two")
RETURNS text LANGUAGE SQL AS 'SELECT NULL';`,
        },
      ]),
    /CREATE FUNCTION public\.convert_value\(public\."weird\)two"\) needs/,
  );

  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_quoted_types.sql",
        sql: `DROP FUNCTION IF EXISTS public.convert_value(public."weird)one");
CREATE FUNCTION public.convert_value(value public."weird)one")
RETURNS text LANGUAGE SQL AS 'SELECT NULL';`,
      },
    ]),
  );
});

test("handles escaped quotes and case-sensitive trigger and policy repairs", () => {
  assert.throws(
    () =>
      validateMigrations([
        {
          name: "001_quoted_trigger_policy.sql",
          sql: `CREATE POLICY "account ""reader" ON public.accounts USING (true);
DROP TRIGGER IF EXISTS "Touch" ON public.accounts;
CREATE TRIGGER "touch" BEFORE UPDATE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP POLICY IF EXISTS "Owner" ON public.accounts;
CREATE POLICY "owner" ON public.accounts USING (true);`,
        },
      ]),
    error => {
      assert.match(error.message, /CREATE POLICY "account ""reader" ON public\.accounts/);
      assert.match(error.message, /CREATE TRIGGER "touch" ON public\.accounts/);
      assert.match(error.message, /CREATE POLICY "owner" ON public\.accounts/);
      return true;
    },
  );

  assert.doesNotThrow(() =>
    validateMigrations([
      {
        name: "001_quoted_trigger_policy.sql",
        sql: `DROP TRIGGER IF EXISTS "touch" ON public.accounts;
CREATE TRIGGER "touch" BEFORE UPDATE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP POLICY IF EXISTS "account ""reader" ON public.accounts;
CREATE POLICY "account ""reader" ON public.accounts USING (true);`,
      },
    ]),
  );
});

test("rejects Unicode-escaped identifiers instead of letting them bypass checks", () => {
  assert.throws(
    () =>
      validateMigrations([
        {
          name: "001_unicode_identifier.sql",
          sql: `CREATE FUNCTION U&"public".U&"render\\0061ccount"(text)
RETURNS text LANGUAGE SQL AS 'SELECT NULL';`,
        },
      ]),
    /Unicode-escaped identifiers are not supported by the retry-safety validator/,
  );
});
