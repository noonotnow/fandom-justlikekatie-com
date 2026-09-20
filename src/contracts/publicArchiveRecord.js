import { PUBLIC_ROUTE_PATHS } from "../../shared/public-routes.js";

const RECORD_IDENTIFIER = "[a-z0-9]+(?:-[a-z0-9]+)*";
const ACTOR_RECORD_PATH = new RegExp(
  `^${PUBLIC_ROUTE_PATHS.vibeAtlasActors}/(${RECORD_IDENTIFIER})/?$`,
);
const EDITION_RECORD_PATH = new RegExp(
  `^${PUBLIC_ROUTE_PATHS.vibeAtlasEditions}/(\\d{4}-\\d{2}-\\d{2})/(${RECORD_IDENTIFIER})/?$`,
);

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
  if (!value || typeof value !== "object") return undefined;
  const actorMatch = typeof value.actorPath === "string"
    ? ACTOR_RECORD_PATH.exec(value.actorPath)
    : null;
  const editionMatch = typeof value.editionPath === "string"
    ? EDITION_RECORD_PATH.exec(value.editionPath)
    : null;
  if (!actorMatch
    || !editionMatch
    || !isCalendarDate(editionMatch[1])
    || editionMatch[2] !== actorMatch[1]) {
    return undefined;
  }
  return {
    actorPath: value.actorPath,
    editionPath: value.editionPath,
  };
}