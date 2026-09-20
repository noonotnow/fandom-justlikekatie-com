const ACTOR_RECORD_PREFIX = "/vibe-atlas/actors/";
const EDITION_RECORD_PREFIX = "/vibe-atlas/editions/";

/**
 * Returns the safe public-record path pair, or undefined when either path is
 * missing or outside the approved reader routes.
 */
export function publicArchiveRecord(value) {
  if (!value || typeof value !== "object") return undefined;
  if (typeof value.actorPath !== "string"
    || !value.actorPath.startsWith(ACTOR_RECORD_PREFIX)
    || typeof value.editionPath !== "string"
    || !value.editionPath.startsWith(EDITION_RECORD_PREFIX)) {
    return undefined;
  }
  return {
    actorPath: value.actorPath,
    editionPath: value.editionPath,
  };
}