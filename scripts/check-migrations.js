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
    .replace(/\b[Ee]'(?:\\[\s\S]|''|[^'\\])*'|'(?:''|[^'])*'/g, " ")
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
  const components = identifierComponents(identifier);
  return components.length === 1 || canonicalIdentifier(components[0]) === "u:public";
}

function compactIdentifier(identifier) {
  let compact = "";
  let quoted = false;
  for (let position = 0; position < identifier.length; position += 1) {
    const character = identifier[position];
    if (character === '"') {
      compact += character;
      if (quoted && identifier[position + 1] === '"') {
        compact += identifier[position + 1];
        position += 1;
        continue;
      }
      quoted = !quoted;
    } else if (quoted || !/\s/.test(character)) {
      compact += character;
    }
  }
  return compact;
}

function identifierComponents(identifier) {
  const components = [];
  let start = 0;
  let quoted = false;
  for (let position = 0; position < identifier.length; position += 1) {
    if (identifier[position] === '"') {
      if (quoted && identifier[position + 1] === '"') {
        position += 1;
        continue;
      }
      quoted = !quoted;
    } else if (identifier[position] === "." && !quoted) {
      components.push(identifier.slice(start, position).trim());
      start = position + 1;
    }
  }
  components.push(identifier.slice(start).trim());
  return components;
}

function canonicalIdentifier(identifier) {
  if (!identifier.startsWith('"')) return `u:${identifier.toLowerCase()}`;
  const value = identifier.slice(1, -1).replaceAll('""', '"');
  return value === value.toLowerCase() && /^[a-z_][a-z0-9_$]*$/.test(value)
    ? `u:${value}`
    : `q:${value}`;
}

function canonicalObjectName(identifier) {
  return identifierComponents(identifier).map(canonicalIdentifier).join("/");
}

function escapeExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchingParenthesis(sql, openingPosition) {
  let depth = 0;
  let quoted = false;
  for (let position = openingPosition; position < sql.length; position += 1) {
    if (sql[position] === '"') {
      if (quoted && sql[position + 1] === '"') {
        position += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (sql[position] === "(") depth += 1;
    if (sql[position] !== ")") continue;
    depth -= 1;
    if (depth === 0) return position;
  }
  return -1;
}

function splitArguments(signature) {
  const argumentsList = [];
  let parenthesisDepth = 0;
  let bracketDepth = 0;
  let start = 0;
  let state = "sql";
  let dollarTag = "";
  for (let position = 0; position < signature.length; position += 1) {
    const pair = signature.slice(position, position + 2);
    const character = signature[position];
    if (state === "single-quote") {
      if (pair === "''") {
        position += 1;
      } else if (character === "'") {
        state = "sql";
      }
      continue;
    }
    if (state === "double-quote") {
      if (pair === '""') {
        position += 1;
      } else if (character === '"') {
        state = "sql";
      }
      continue;
    }
    if (state === "dollar-quote") {
      if (signature.startsWith(dollarTag, position)) {
        position += dollarTag.length - 1;
        state = "sql";
      }
      continue;
    }
    if (character === "'") {
      state = "single-quote";
      continue;
    }
    if (character === '"') {
      state = "double-quote";
      continue;
    }
    if (character === "$") {
      const match = /^\$[a-z_][a-z0-9_]*\$|^\$\$/i.exec(
        signature.slice(position),
      );
      if (match) {
        dollarTag = match[0];
        state = "dollar-quote";
        position += dollarTag.length - 1;
        continue;
      }
    }
    if (character === "(") parenthesisDepth += 1;
    if (character === ")") parenthesisDepth -= 1;
    if (character === "[") bracketDepth += 1;
    if (character === "]") bracketDepth -= 1;
    if (
      character !== "," ||
      parenthesisDepth !== 0 ||
      bracketDepth !== 0
    ) {
      continue;
    }
    argumentsList.push(signature.slice(start, position));
    start = position + 1;
  }
  argumentsList.push(signature.slice(start));
  return argumentsList;
}

function firstRoutineArgumentToken(argument) {
  if (!argument.startsWith('"')) {
    const match = /^\S+/.exec(argument);
    return match
      ? {
        token: match[0],
        remainder: argument.slice(match[0].length).trim(),
        quoted: false,
        separated: true,
      }
      : { token: "", remainder: "", quoted: false, separated: false };
  }

  for (let position = 1; position < argument.length; position += 1) {
    if (argument[position] !== '"') continue;
    if (argument[position + 1] === '"') {
      position += 1;
      continue;
    }
    return {
      token: argument.slice(0, position + 1),
      remainder: argument.slice(position + 1).trim(),
      quoted: true,
      separated: /\s/.test(argument[position + 1] ?? ""),
    };
  }

  return { token: argument, remainder: "", quoted: true, separated: false };
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
        const { token, remainder, quoted, separated } =
          firstRoutineArgumentToken(identityArgument);
        const firstToken = token.replaceAll('"', "").toLowerCase();
        if (
          remainder &&
          separated &&
          (quoted || !multiwordTypeStarts.has(firstToken))
        ) {
          identityArgument = remainder;
        }
      }

      const quotedIdentifiers = [];
      const protectedType = identityArgument.replace(
        /"(?:[^"]|"")*"/g,
        quotedIdentifier => {
          const placeholder = `\u0000${quotedIdentifiers.length}\u0000`;
          quotedIdentifiers.push(quotedIdentifier);
          return placeholder;
        },
      );
      const normalizedType = protectedType
        .replace(/\s+/g, " ")
        .replace(/\s*([()[\],.])\s*/g, "$1")
        .toLowerCase()
        .replace(/\u0000(\d+)\u0000/g, (_placeholder, index) =>
          quotedIdentifiers[Number(index)]);
      return mode === "INOUT" || mode === "VARIADIC"
        ? `${mode.toLowerCase()} ${normalizedType}`
        : normalizedType;
    })
    .filter(Boolean)
    .join(",");
}

function routines(sql, operation) {
  const identifier = String.raw`(?:"(?:[^"]|"")*"|[a-z_][a-z0-9_$]*)`;
  const objectName = String.raw`(${identifier}(?:\s*\.\s*${identifier})?)`;
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
      key: canonicalObjectName(match[create ? 3 : 2]),
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
  const identifier = String.raw`(?:"(?:[^"]|"")*"|[a-z_][a-z0-9_$]*)`;
  const objectName = String.raw`(${identifier}(?:\s*\.\s*${identifier})?)`;
  const simpleName = String.raw`(${identifier})`;

  if (/\bU&"/i.test(declarativeSql)) {
    errors.push(
      "Unicode-escaped identifiers are not supported by the retry-safety validator; use ordinary quoted identifiers",
    );
  }

  function hasPriorNamedDrop(sqlBeforeCreate, kind, name, relation) {
    const expectedName = canonicalIdentifier(name);
    const expectedRelation = relation && canonicalObjectName(relation);
    return splitSqlStatements(sqlBeforeCreate).some(statement => {
      const expression = new RegExp(
        String.raw`^\s*DROP\s+${kind}\s+IF\s+EXISTS\s+${simpleName}\s+ON\s+${objectName}(?:\s+(?:CASCADE|RESTRICT))?\s*;?\s*$`,
        "i",
      );
      const match = expression.exec(statement);
      return Boolean(
        match &&
        canonicalIdentifier(match[1]) === expectedName &&
        canonicalObjectName(match[2]) === expectedRelation
      );
    });
  }

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
      drop.key === routine.key &&
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
    const key = canonicalObjectName(match[1]);
    const hasPriorRepairDrop = splitSqlStatements(
      declarativeSql.slice(0, match.index),
    ).some(statement => {
      const header = /^\s*DROP\s+VIEW\s+IF\s+EXISTS\s+/i.exec(statement);
      if (!header) return false;
      return splitArguments(
        statement
          .slice(header[0].length)
          .replace(/\s+(?:CASCADE|RESTRICT)\s*;?\s*$/i, "")
          .replace(/;\s*$/, ""),
      ).some(target => {
        const dropped = new RegExp(String.raw`^\s*${objectName}`, "i").exec(target);
        return dropped && canonicalObjectName(dropped[1]) === key;
      });
    });
    if (!hasPriorRepairDrop) {
      errors.push(
        `CREATE VIEW ${name} needs OR REPLACE, a guarded DO block, or a prior matching DROP VIEW IF EXISTS repair`,
      );
    }
  }

  const createTrigger = new RegExp(
    String.raw`\bCREATE\s+(?:CONSTRAINT\s+)?TRIGGER\s+${simpleName}[\s\S]*?\bON\s+${objectName}`,
    "gi",
  );
  for (const match of declarativeSql.matchAll(createTrigger)) {
    if (!applicationOwned(match[2])) continue;
    const triggerName = compactIdentifier(match[1]);
    const tableName = compactIdentifier(match[2]);
    const hasPriorRepairDrop = hasPriorNamedDrop(
      declarativeSql.slice(0, match.index),
      "TRIGGER",
      match[1],
      match[2],
    );
    if (!hasPriorRepairDrop) {
      errors.push(
        `CREATE TRIGGER ${triggerName} ON ${tableName} needs a guarded DO block or a prior matching DROP TRIGGER IF EXISTS repair`,
      );
    }
  }

  const createPolicy = new RegExp(
    String.raw`\bCREATE\s+POLICY\s+${simpleName}\s+ON\s+${objectName}`,
    "gi",
  );
  for (const match of declarativeSql.matchAll(createPolicy)) {
    if (!applicationOwned(match[2])) continue;
    const policyName = compactIdentifier(match[1]);
    const tableName = compactIdentifier(match[2]);
    const hasPriorRepairDrop = hasPriorNamedDrop(
      declarativeSql.slice(0, match.index),
      "POLICY",
      match[1],
      match[2],
    );
    if (!hasPriorRepairDrop) {
      errors.push(
        `CREATE POLICY ${policyName} ON ${tableName} needs a guarded DO block or a prior matching DROP POLICY IF EXISTS repair`,
      );
    }
  }

  for (const statement of splitSqlStatements(declarativeSql)) {
    const header = /^\s*DROP\s+(FUNCTION|PROCEDURE|VIEW)\s+(IF\s+EXISTS\s+)?/i.exec(statement);
    if (!header || header[2]) continue;
    const kind = header[1].toUpperCase();
    const targets = splitArguments(
      statement
        .slice(header[0].length)
        .replace(/\s+(?:CASCADE|RESTRICT)\s*;?\s*$/i, "")
        .replace(/;\s*$/, ""),
    );
    for (const target of targets) {
      const match = new RegExp(
        kind === "VIEW"
          ? String.raw`^\s*${objectName}`
          : String.raw`^\s*${objectName}\s*\(`,
        "i",
      ).exec(target);
      if (!match || !applicationOwned(match[1])) continue;
      errors.push(
        `DROP ${kind} ${compactIdentifier(match[1])} needs IF EXISTS or a guarded DO block`,
      );
    }
  }

  const advancedDropPatterns = [
    {
      expression: new RegExp(
        String.raw`\bDROP\s+TRIGGER\s+(?!IF\s+EXISTS\b)${simpleName}\s+ON\s+${objectName}`,
        "gi",
      ),
      objectPosition: 2,
      description: match =>
        `DROP TRIGGER ${compactIdentifier(match[1])} ON ${compactIdentifier(match[2])}`,
    },
    {
      expression: new RegExp(
        String.raw`\bDROP\s+POLICY\s+(?!IF\s+EXISTS\b)${simpleName}\s+ON\s+${objectName}`,
        "gi",
      ),
      objectPosition: 2,
      description: match =>
        `DROP POLICY ${compactIdentifier(match[1])} ON ${compactIdentifier(match[2])}`,
    },
  ];
  for (const pattern of advancedDropPatterns) {
    for (const match of declarativeSql.matchAll(pattern.expression)) {
      if (!applicationOwned(match[pattern.objectPosition])) continue;
      errors.push(`${pattern.description(match)} needs IF EXISTS or a guarded DO block`);
    }
  }

  const advancedRenamePatterns = [
    {
      expression: new RegExp(
        String.raw`\bALTER\s+(FUNCTION|PROCEDURE)\s+${objectName}\s*\(`,
        "gi",
      ),
      objectPosition: 2,
      description: match =>
        `ALTER ${match[1].toUpperCase()} ${compactIdentifier(match[2])}`,
    },
    {
      expression: new RegExp(
        String.raw`\bALTER\s+VIEW\s+${objectName}\s+RENAME\s+TO\b`,
        "gi",
      ),
      objectPosition: 1,
      description: match => `ALTER VIEW ${compactIdentifier(match[1])}`,
    },
    {
      expression: new RegExp(
        String.raw`\bALTER\s+TRIGGER\s+${simpleName}\s+ON\s+${objectName}\s+RENAME\s+TO\b`,
        "gi",
      ),
      objectPosition: 2,
      description: match =>
        `ALTER TRIGGER ${compactIdentifier(match[1])} ON ${compactIdentifier(match[2])}`,
    },
    {
      expression: new RegExp(
        String.raw`\bALTER\s+POLICY\s+${simpleName}\s+ON\s+${objectName}\s+RENAME\s+TO\b`,
        "gi",
      ),
      objectPosition: 2,
      description: match =>
        `ALTER POLICY ${compactIdentifier(match[1])} ON ${compactIdentifier(match[2])}`,
    },
  ];
  for (const pattern of advancedRenamePatterns) {
    for (const match of declarativeSql.matchAll(pattern.expression)) {
      if (!applicationOwned(match[pattern.objectPosition])) continue;
      const statementEnd = declarativeSql.indexOf(";", match.index);
      const statement = declarativeSql.slice(
        match.index,
        statementEnd === -1 ? declarativeSql.length : statementEnd + 1,
      );
      if (
        (match[1].toUpperCase() === "FUNCTION" ||
          match[1].toUpperCase() === "PROCEDURE") &&
        !/\)\s+RENAME\s+TO\b/i.test(statement)
      ) {
        continue;
      }
      errors.push(
        `${pattern.description(match)} RENAME needs a guarded DO block or another explicit retry-safe repair`,
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

export function splitSqlStatements(sql) {
  const statements = [];
  let start = 0;
  let position = 0;
  let state = "sql";
  let dollarTag = "";

  while (position < sql.length) {
    const pair = sql.slice(position, position + 2);
    const character = sql[position];

    if (state === "line-comment") {
      if (character === "\n") state = "sql";
      position += 1;
      continue;
    }
    if (state === "block-comment") {
      if (pair === "*/") {
        state = "sql";
        position += 2;
      } else {
        position += 1;
      }
      continue;
    }
    if (state === "single-quote") {
      if (pair === "''") {
        position += 2;
      } else {
        if (character === "'") state = "sql";
        position += 1;
      }
      continue;
    }
    if (state === "escape-string") {
      if (character === "\\") {
        position += 2;
      } else if (pair === "''") {
        position += 2;
      } else {
        if (character === "'") state = "sql";
        position += 1;
      }
      continue;
    }
    if (state === "double-quote") {
      if (pair === '""') {
        position += 2;
      } else {
        if (character === '"') state = "sql";
        position += 1;
      }
      continue;
    }
    if (state === "dollar-quote") {
      if (sql.startsWith(dollarTag, position)) {
        state = "sql";
        position += dollarTag.length;
      } else {
        position += 1;
      }
      continue;
    }

    if (pair === "--") {
      state = "line-comment";
      position += 2;
    } else if (pair === "/*") {
      state = "block-comment";
      position += 2;
    } else if (character === "'") {
      state = /[Ee]/.test(sql[position - 1] ?? "") &&
        (position < 2 || !/[a-z0-9_$]/i.test(sql[position - 2]))
        ? "escape-string"
        : "single-quote";
      position += 1;
    } else if (character === '"') {
      state = "double-quote";
      position += 1;
    } else if (character === "$") {
      const match = /^\$[a-z_][a-z0-9_]*\$|^\$\$/i.exec(sql.slice(position));
      if (match) {
        dollarTag = match[0];
        state = "dollar-quote";
        position += dollarTag.length;
      } else {
        position += 1;
      }
    } else if (character === ";") {
      const statement = sql.slice(start, position + 1).trim();
      if (statement) statements.push(statement);
      start = position + 1;
      position += 1;
    } else {
      position += 1;
    }
  }

  const remainder = sql.slice(start).trim();
  if (remainder) statements.push(remainder);
  return statements;
}

export async function applyMigrations(client, migrations, pass = 1) {
  const ordered = [...migrations].sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  for (const migration of ordered) {
    try {
      for (const statement of splitSqlStatements(migration.sql)) {
        await client.query(statement);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Migration ${migration.name} failed on application ${pass}: ${detail}`,
        { cause: error },
      );
    }
  }
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