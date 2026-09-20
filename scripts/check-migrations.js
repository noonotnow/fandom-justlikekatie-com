import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const MIGRATIONS_DIRECTORY = new URL(
  "../netlify/functions/migrations/",
  import.meta.url,
);
export const NON_TRANSACTIONAL_MARKER =
  "-- postgres-migrations disable-transaction";

function executableSql(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ");
}

function concurrentIndexes(sql, operation) {
  const retryClause = operation === "DROP" ? "IF\\s+EXISTS\\s+" : "";
  const expression = new RegExp(
    `\\b${operation}\\s+INDEX\\s+CONCURRENTLY\\s+${retryClause}(?:public\\.)?("?[^"\\s;(]+"?)`,
    "gi",
  );
  return Array.from(sql.matchAll(expression), match => ({
    name: match[1].replaceAll('"', "").toLowerCase(),
    position: match.index,
  }));
}

export function validateMigrations(migrations) {
  const errors = [];
  const ordered = [...migrations].sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  ordered.forEach((migration, index) => {
    const match = /^(\d{3})_[a-z0-9][a-z0-9_]*\.sql$/.exec(migration.name);
    if (!match) {
      errors.push(
        `${migration.name}: expected a name like 001_descriptive_name.sql`,
      );
      return;
    }

    const expectedNumber = index + 1;
    if (Number(match[1]) !== expectedNumber) {
      errors.push(
        `${migration.name}: expected migration number ${String(expectedNumber).padStart(3, "0")}`,
      );
    }

    const sql = executableSql(migration.sql);
    const createdConcurrently = concurrentIndexes(sql, "CREATE");
    if (createdConcurrently.length === 0) return;

    if (!migration.sql
      .split(/\r?\n/, 1)
      .some(line => line.trim() === NON_TRANSACTIONAL_MARKER)) {
      errors.push(
        `${migration.name}: CREATE INDEX CONCURRENTLY requires ${NON_TRANSACTIONAL_MARKER} on the first line`,
      );
    }

    if (/\b(?:BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK)\b/i.test(sql)) {
      errors.push(
        `${migration.name}: concurrent index operations cannot run inside an explicit transaction`,
      );
    }

    const droppedConcurrently = concurrentIndexes(sql, "DROP");
    for (const createdIndex of createdConcurrently) {
      const hasPriorRetryDrop = droppedConcurrently.some(
        droppedIndex =>
          droppedIndex.name === createdIndex.name &&
          droppedIndex.position < createdIndex.position,
      );
      if (!hasPriorRetryDrop) {
        errors.push(
          `${migration.name}: CREATE INDEX CONCURRENTLY ${createdIndex.name} must be preceded by DROP INDEX CONCURRENTLY IF EXISTS for the same index`,
        );
      }
    }
  });

  if (errors.length > 0) {
    throw new Error(`Migration validation failed:\n- ${errors.join("\n- ")}`);
  }
}

export async function loadMigrations(directory = MIGRATIONS_DIRECTORY) {
  const entries = await readdir(directory, { withFileTypes: true });
  const sqlFiles = entries
    .filter(entry => entry.isFile() && entry.name.endsWith(".sql"))
    .map(entry => entry.name);

  return Promise.all(
    sqlFiles.map(async name => ({
      name,
      sql: await readFile(new URL(name, directory), "utf8"),
    })),
  );
}

async function main() {
  const migrations = await loadMigrations();
  validateMigrations(migrations);
  console.log(
    `Migration validation passed: ${migrations.length} SQL files have safe numbering, transaction, and retry behavior.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}