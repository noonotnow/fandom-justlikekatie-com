/**
 * Temporary rollout alias. The implementation and upstream target are
 * Workstation-only; CREATE remains historical/read-only.
 */
export { createWorkstationHandoffHandler as createCreateHandoffHandler } from "./workstation-handoff.js";
