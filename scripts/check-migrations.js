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
    .replace(/--.*$/gm, " ")
    .replace(/'(?:''|[^'])*'/g, " ")
    .replace(/(\$[a-z0-9_]*\$)[\s\S]*?\1/gi, " ");
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

function applicationOwned(identifier) {
  const normalized = identifier.replaceAll('"', "").toLowerCase();
  return !normalized.includes(".") || normalized.startsWith("public.");
}

function ordinaryDdlErrors(sql) {
  const errors = [];
  const declarativeSql = sql;
  const objectName = String.raw`((?:"[^"]+"|[a-z_][a-z0-9_$]*)(?:\s*\.\s*(?:"[^"]+"|[a-z_][a-z0-9_$]*))?)`;

  const createPatterns = [
    {
      expression: new RegExp(
        String.raw`\bCREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS\b)${objectName}`,
        "gi",
      ),
      label: "CREATE TABLE",
    },
    {
      expression: new RegExp(
        String.raw`\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY\b)(?!IF\s+NOT\s+EXISTS\b)${objectName}`,
        "gi",
      ),
      label: "CREATE INDEX",
    },
    {
      expression: new RegExp(
        String.raw`\bCREATE\s+(?:MATERIALIZED\s+VIEW|SEQUENCE|SCHEMA)\s+(?!IF\s+NOT\s+EXISTS\b)${objectName}`,
        "gi",
      ),
      label: "CREATE",
    },
    {
      expression: new RegExp(
        String.raw`\bCREATE\s+TYPE\s+${objectName}`,
        "gi",
      ),
      label: "CREATE TYPE",
    },
  ];

  for (const { expression, label } of createPatterns) {
    for (const match of declarativeSql.matchAll(expression)) {
      if (!applicationOwned(match[1])) continue;
      const name = match[1].replace(/\s+/g, "");
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const type = label === "CREATE TYPE"
        ? "TYPE"
        : label === "CREATE INDEX"
          ? "INDEX"
          : null;
      const hasPriorRepairDrop = type && new RegExp(
        String.raw`\bDROP\s+${type}\s+IF\s+EXISTS\s+${escapedName}\b`,
        "i",
      ).test(declarativeSql.slice(0, match.index));
      if (!hasPriorRepairDrop) {
        errors.push(
          `${label} ${name} needs IF NOT EXISTS, a guarded DO block, or a prior DROP IF EXISTS repair`,
        );
      }
    }
  }

  const alterTable = new RegExp(
    String.raw`\bALTER\s+TABLE\s+(?:ONLY\s+)?${objectName}([\s\S]*?);`,
    "gi",
  );
  for (const match of declarativeSql.matchAll(alterTable)) {
    if (!applicationOwned(match[1])) continue;
    let changes = match[2];
    const tableName = match[1].replace(/\s+/g, "");
    const addConstraint = /\bADD\s+CONSTRAINT\s+("?[^"\s,;()]+"?)/gi;
    changes = changes.replace(addConstraint, (addition, constraintName, offset) => {
      const escapedTable = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const escapedConstraint = constraintName.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      const precedingSql =
        declarativeSql.slice(0, match.index) + changes.slice(0, offset);
      const hasPriorRepairDrop = new RegExp(
        String.raw`\bALTER\s+TABLE\s+(?:ONLY\s+)?${escapedTable}\s+DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+${escapedConstraint}\b`,
        "i",
      ).test(precedingSql);
      return hasPriorRepairDrop ? " " : addition;
    });
    const unsafeChange =
      /\bADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS\b)/i.test(changes) ||
      /\bADD\s+(?!COLUMN\b|CONSTRAINT\b|IF\s+NOT\s+EXISTS\b)/i.test(changes) ||
      /\bDROP\s+COLUMN\s+(?!IF\s+EXISTS\b)/i.test(changes) ||
      /\bDROP\s+(?!COLUMN\b|CONSTRAINT\b|IF\s+EXISTS\b)/i.test(changes) ||
      /\bADD\s+CONSTRAINT\b/i.test(changes) ||
      /\bDROP\s+CONSTRAINT\s+(?!IF\s+EXISTS\b)/i.test(changes) ||
      /\bRENAME\s+(?:COLUMN\s+)?\b/i.test(changes) ||
      /\bRENAME\s+TO\b/i.test(changes);
    if (unsafeChange) {
      errors.push(
        `ALTER TABLE ${tableName} has a structural change without IF EXISTS/IF NOT EXISTS, a prior repair drop, or a guarded DO block`,
      );
    }
  }

  return errors;
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
    for (const error of ordinaryDdlErrors(sql)) {
      errors.push(`${migration.name}: ${error}`);
    }
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