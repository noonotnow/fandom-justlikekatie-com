/**
 * Temporary rollout alias. All new handoffs use the Workstation route and
 * Workstation-only receipt validation.
 */
export {
  WORKSTATION_HANDOFF_URL as CREATE_HANDOFF_URL,
  completeWorkstationHandoff as completeCreatorDraftHandoff,
  type WorkstationReceipt as CreateReceipt,
} from './workstationHandoffClient';
