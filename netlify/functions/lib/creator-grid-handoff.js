/**
 * Temporary rollout alias for tests and staged deploys. New code should import
 * the Workstation-named module.
 */
export {
  CREATOR_DRAFT_SOURCE_SCHEMA,
  CREATOR_PLATFORMS,
  WORKSTATION_DELIVERABLE_SCHEMA,
  WORKSTATION_WORKFLOW,
  createWorkstationGridHandoffHandler as createCreatorGridHandoffHandler,
  isWorkstationDraftRequest as isCreatorDraftRequest,
  normalizePlatforms,
  sourceVersionForGrid,
} from "./workstation-grid-handoff.js";
