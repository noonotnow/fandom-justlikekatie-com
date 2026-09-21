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

function compactIdentifier(identifier) {
  return identifier.replace(/\s+/g, "");
}

function escapeExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchingParenthesis(sql, openingPosition) {
  let depth = 0;
  for (let position = openingPosition; position < sql.length; position += 1) {
    if (sql[position] === "(") depth += 1;
    if (sql[position] !== ")") continue;
    depth -= 1;
    if (depth === 0) return position;
  }
  return -1;
}

function splitArguments(signature) {
  const argumentsList = [];
  let depth = 0;
  let start = 0;
  for (let position = 0; position < signature.length; position += 1) {
    if (signature[position] === "(") depth += 1;
    if (signature[position] === ")") depth -= 1;
    if (signature[position] !== "," || depth !== 0) continue;
    argumentsList.push(signature.slice(start, position));
    start = position + 1;
  }
  argumentsList.push(signature.slice(start));
  return argumentsList;
}

function routineIdentity(signature, declaration) {
  const multiwordTypeStarts = new Set([
    "bit",
    "character",
    "double",
    "national",
    "time",
    "timestamp",
  ]);
  return splitArguments(signature)
    .map(argument => argument
      .replace(/\s+(?:DEFAULT\b|=)[\s\S]*$/i, "")
      .trim())
    .filter(Boolean)
    .map(argument => {
      const modeMatch = /^(INOUT|IN|OUT|VARIADIC)\s+/i.exec(argument);
      const mode = modeMatch?.[1].toUpperCase();
      let identityArgument = modeMatch
        ? argument.slice(modeMatch[0].length).trim()
        : argument;
      if (mode === "OUT") return null;

      if (declaration) {
        const tokens = identityArgument.split(/\s+/);
        const firstToken = tokens[0].replaceAll('"', "").toLowerCase();
        if (
          tokens.length > 1 &&
          !multiwordTypeStarts.has(firstToken)
        ) {
          identityArgument = tokens.slice(1).join(" ");
        }
      }

      const normalizedType = identityArgument
        .replace(/\s+/g, " ")
        .replace(/\s*([()[\],.])\s*/g, "$1")
        .toLowerCase();
      return mode === "INOUT" || mode === "VARIADIC"
        ? `${mode.toLowerCase()} ${normalizedType}`
        : normalizedType;
    })
    .filter(Boolean)
    .join(",");
}

function routines(sql, operation) {
  const objectName = String.raw`((?:"[^"]+"|[a-z_][a-z0-9_$]*)(?:\s*\.\s*(?:"[^"]+"|[a-z_][a-z0-9_$]*))?)`;
  const expression = operation === "CREATE"
    ? new RegExp(
      String.raw`\bCREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|PROCEDURE)\s+${objectName}\s*\(`,
      "gi",
    )
    : new RegExp(
      String.raw`\bDROP\s+(FUNCTION|PROCEDURE)\s+IF\s+EXISTS\s+${objectName}\s*\(`,
      "gi",
    );
  const matches = [];
  for (const match of sql.matchAll(expression)) {
    const closingPosition = matchingParenthesis(
      sql,
      match.index + match[0].length - 1,
    );
    if (closingPosition === -1) continue;
    const create = operation === "CREATE";
    matches.push({
      kind: match[create ? 2 : 1].toUpperCase(),
      name: compactIdentifier(match[create ? 3 : 2]),
      identity: routineIdentity(
        sql.slice(match.index + match[0].length, closingPosition),
        create,
      ),
      orReplace: create && Boolean(match[1]),
      position: match.index,
    });
  }
  return matches;
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
      const name = compactIdentifier(match[1]);
      const escapedName = escapeExpression(name);
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

  const droppedRoutines = routines(declarativeSql, "DROP");
  for (const routine of routines(declarativeSql, "CREATE")) {
    if (!applicationOwned(routine.name) || routine.orReplace) continue;
    const hasPriorRepairDrop = droppedRoutines.some(drop =>
      drop.kind === routine.kind &&
      drop.name.toLowerCase() === routine.name.toLowerCase() &&
      drop.identity === routine.identity &&
      drop.position < routine.position
    );
    if (!hasPriorRepairDrop) {
      errors.push(
        `CREATE ${routine.kind} ${routine.name}(${routine.identity}) needs OR REPLACE, a guarded DO block, or a prior matching DROP ${routine.kind} IF EXISTS repair`,
      );
    }
  }

  const createView = new RegExp(
    String.raw`\bCREATE\s+(?!OR\s+REPLACE\s+)(?:(?:TEMP|TEMPORARY)\s+)?(?:RECURSIVE\s+)?VIEW\s+${objectName}`,
    "gi",
  );
  for (const match of declarativeSql.matchAll(createView)) {
    if (!applicationOwned(match[1])) continue;
    const name = compactIdentifier(match[1]);
    const hasPriorRepairDrop = new RegExp(
      String.raw`\bDROP\s+VIEW\s+IF\s+EXISTS\s+${escapeExpression(name)}(?:\s+(?:CASCADE|RESTRICT))?\s*;`,
      "i",
    ).test(declarativeSql.slice(0, match.index));
    if (!hasPriorRepairDrop) {
      errors.push(
        `CREATE VIEW ${name} needs OR REPLACE, a guarded DO block, or a prior matching DROP VIEW IF EXISTS repair`,
      );
    }
  }

  const createTrigger = new RegExp(
    String.raw`\bCREATE\s+(?:CONSTRAINT\s+)?TRIGGER\s+((?:"[^"]+"|[a-z_][a-z0-9_$]*))[\s\S]*?\bON\s+${objectName}`,
    "gi",
  );
  for (const match of declarativeSql.matchAll(createTrigger)) {
    if (!applicationOwned(match[2])) continue;
    const triggerName = compactIdentifier(match[1]);
    const tableName = compactIdentifier(match[2]);
    const hasPriorRepairDrop = new RegExp(
      String.raw`\bDROP\s+TRIGGER\s+IF\s+EXISTS\s+${escapeExpression(triggerName)}\s+ON\s+${escapeExpression(tableName)}(?:\s+(?:CASCADE|RESTRICT))?\s*;`,
      "i",
    ).test(declarativeSql.slice(0, match.index));
    if (!hasPriorRepairDrop) {
      errors.push(
        `CREATE TRIGGER ${triggerName} ON ${tableName} needs a guarded DO block or a prior matching DROP TRIGGER IF EXISTS repair`,
      );
    }
  }

  const createPolicy = new RegExp(
    String.raw`\bCREATE\s+POLICY\s+((?:"[^"]+"|[a-z_][a-z0-9_$]*))\s+ON\s+${objectName}`,
    "gi",
  );
  for (const match of declarativeSql.matchAll(createPolicy)) {
    if (!applicationOwned(match[2])) continue;
    const policyName = compactIdentifier(match[1]);
    const tableName = compactIdentifier(match[2]);
    const hasPriorRepairDrop = new RegExp(
      String.raw`\bDROP\s+POLICY\s+IF\s+EXISTS\s+${escapeExpression(policyName)}\s+ON\s+${escapeExpression(tableName)}(?:\s+(?:CASCADE|RESTRICT))?\s*;`,
      "i",
    ).test(declarativeSql.slice(0, match.index));
    if (!hasPriorRepairDrop) {
      errors.push(
        `CREATE POLICY ${policyName} ON ${tableName} needs a guarded DO block or a prior matching DROP POLICY IF EXISTS repair`,
      );
    }
  }

  const alterTable = new RegExp(
    String.raw`\bALTER\s+TABLE\s+(?:ONLY\s+)?${objectName}([\s\S]*?);`,
    "gi",
  );
  for (const match of declarativeSql.matchAll(alterTable)) {
    if (!applicationOwned(match[1])) continue;
    let changes = match[2];
    const tableName = compactIdentifier(match[1]);
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