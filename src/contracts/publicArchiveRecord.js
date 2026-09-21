import { PUBLIC_ROUTE_PATHS } from "../../shared/public-routes.js";

const RECORD_IDENTIFIER = "[a-z0-9]+(?:-[a-z0-9]+)*";
const ACTOR_RECORD_PATH = new RegExp(
  `^${PUBLIC_ROUTE_PATHS.vibeAtlasActors}/(${RECORD_IDENTIFIER})/?$`,
);
const EDITION_RECORD_PATH = new RegExp(
  `^${PUBLIC_ROUTE_PATHS.vibeAtlasEditions}/(\\d{4}-\\d{2}-\\d{2})/(${RECORD_IDENTIFIER})/?$`,
);

export const PUBLIC_ARCHIVE_RECORD_DIAGNOSTIC = Object.freeze({
  VALID: "valid",
  MISSING_METADATA: "missing_metadata",
  MALFORMED_ACTOR_PATH: "malformed_actor_path",
  MALFORMED_EDITION_PATH: "malformed_edition_path",
});

function isCalendarDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf())
    && date.toISOString().slice(0, 10) === value;
}

/**
 * Returns the safe public-record path pair, or undefined when either path is
 * missing or outside the approved reader routes.
 */
export function publicArchiveRecord(value) {
  const diagnostic = publicArchiveRecordDiagnostic(value);
  if (diagnostic.status !== PUBLIC_ARCHIVE_RECORD_DIAGNOSTIC.VALID) return undefined;
  return {
    actorPath: value.actorPath,
    editionPath: value.editionPath,
  };
}

/**
 * Explains why a public-record path pair was rejected without returning either
 * untrusted path. Safe for operator diagnostics.
 */
export function publicArchiveRecordDiagnostic(value) {
  if (!value || typeof value !== "object"
    || typeof value.actorPath !== "string"
    || typeof value.editionPath !== "string") {
    return { status: PUBLIC_ARCHIVE_RECORD_DIAGNOSTIC.MISSING_METADATA };
  }
  const actorMatch = typeof value.actorPath === "string"
    ? ACTOR_RECORD_PATH.exec(value.actorPath)
    : null;
  if (!actorMatch) {
    return { status: PUBLIC_ARCHIVE_RECORD_DIAGNOSTIC.MALFORMED_ACTOR_PATH };
  }
  const editionMatch = typeof value.editionPath === "string"
    ? EDITION_RECORD_PATH.exec(value.editionPath)
    : null;
  if (!editionMatch
    || !isCalendarDate(editionMatch[1])
    || editionMatch[2] !== actorMatch[1]) {
    return { status: PUBLIC_ARCHIVE_RECORD_DIAGNOSTIC.MALFORMED_EDITION_PATH };
  }
  return { status: PUBLIC_ARCHIVE_RECORD_DIAGNOSTIC.VALID };
}