export const PARTICIPATION_BATCH: 'daily-participation-v1';
export type ParticipationStage = 'guide_opened' | 'report_opened' | 'report_submission_started'
  | 'report_submission_failed' | 'report_sign_in_required' | 'report_receipt_pending'
  | 'report_receipt_existing' | 'grid_preserved' | 'misprint_preserved';
export type ParticipationCohort = 'daily_view' | 'guide' | 'preserved' | 'report_pending';
export type ParticipationEvent =
  | { event: 'daily_participation_stage'; batchKey: typeof PARTICIPATION_BATCH; stage: ParticipationStage }
  | { event: 'daily_participation_cohort_started'; batchKey: typeof PARTICIPATION_BATCH; cohort: ParticipationCohort; cohortDay: string }
  | { event: 'daily_participation_cohort_returned'; batchKey: typeof PARTICIPATION_BATCH; cohort: ParticipationCohort; cohortDay: string; returnDay: number };
export const PARTICIPATION_EVENTS: ParticipationEvent['event'][];
export const PARTICIPATION_STAGES: ParticipationStage[];
export const PARTICIPATION_COHORTS: ParticipationCohort[];
export function isParticipationDate(value: unknown): value is string;
export function validateParticipationEvent(body: unknown): ParticipationEvent | null;