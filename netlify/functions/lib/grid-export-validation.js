/**
 * Shared validation for the grid_export event payload.
 * Used by log-engagement.js and its contract tests.
 *
 * The shape here must stay in lockstep with GridExportEvent in
 * src/utils/gridExportLog.ts.  Any field added to the client type
 * must also be added to GRID_ALLOWED_FIELDS (and GRID_STRING_FIELDS
 * when it is a required string).
 */

export const MAX_GRID_PAYLOAD_BYTES = 8192;

/** Required string fields — presence and type are both enforced. */
export const GRID_STRING_FIELDS = [
  "gridId", "date", "actorId", "actor", "actorEn",
  "vibe", "vibeEn", "searchSpell", "tier",
];

/** Every field the client is permitted to send. */
export const GRID_ALLOWED_FIELDS = new Set([
  ...GRID_STRING_FIELDS,
  "variant",
  "imageIds",
  "gridWasSaved",
  "ctaSeed",
]);

/**
 * Validate the structured `grid` payload for grid_export events.
 * Returns an error string, or null when valid.
 *
 * @param {unknown} grid
 * @returns {string | null}
 */
export function validateGridPayload(grid) {
  if (!grid || typeof grid !== "object" || Array.isArray(grid)) {
    return "grid payload must be an object";
  }
  for (const field of GRID_STRING_FIELDS) {
    if (typeof grid[field] !== "string") return `grid.${field} must be a string`;
  }
  if (grid.variant !== "full" && grid.variant !== "teaser") {
    return "grid.variant must be 'full' or 'teaser'";
  }
  if (
    !Array.isArray(grid.imageIds) ||
    grid.imageIds.length < 1 ||
    grid.imageIds.length > 9 ||
    !grid.imageIds.every((id) => typeof id === "string")
  ) {
    return "grid.imageIds must be 1-9 strings";
  }
  if (grid.gridWasSaved !== undefined && typeof grid.gridWasSaved !== "boolean") {
    return "grid.gridWasSaved must be a boolean";
  }
  if (grid.ctaSeed !== undefined && typeof grid.ctaSeed !== "string") {
    return "grid.ctaSeed must be a string";
  }
  for (const key of Object.keys(grid)) {
    if (!GRID_ALLOWED_FIELDS.has(key)) return `unknown grid field: ${key}`;
  }
  if (JSON.stringify(grid).length > MAX_GRID_PAYLOAD_BYTES) {
    return "grid payload too large";
  }
  return null;
}
