export const PARTICIPATION_BATCH = "daily-participation-v1";
export const PARTICIPATION_EVENTS = [
  "daily_participation_stage",
  "daily_participation_cohort_started",
  "daily_participation_cohort_returned",
];
export const PARTICIPATION_STAGES = [
  "guide_opened", "report_opened", "report_submission_started",
  "report_submission_failed", "report_sign_in_required",
  "report_receipt_pending", "report_receipt_existing",
  "grid_preserved", "misprint_preserved",
];
export const PARTICIPATION_COHORTS = ["daily_view", "guide", "preserved", "report_pending"];

export function isParticipationDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

/** Reject extra fields, including private content; never spread browser input into storage. */
export function validateParticipationEvent(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)
    || !PARTICIPATION_EVENTS.includes(body.event) || body.batchKey !== PARTICIPATION_BATCH) return null;
  const stage = body.event === "daily_participation_stage";
  const returned = body.event === "daily_participation_cohort_returned";
  const keys = stage ? ["event", "batchKey", "stage"]
    : ["event", "batchKey", "cohort", "cohortDay", ...(returned ? ["returnDay"] : [])];
  if (Object.keys(body).some(key => !keys.includes(key))) return null;
  if (stage) return PARTICIPATION_STAGES.includes(body.stage)
    ? { event: body.event, batchKey: PARTICIPATION_BATCH, stage: body.stage } : null;
  if (!PARTICIPATION_COHORTS.includes(body.cohort) || !isParticipationDate(body.cohortDay)) return null;
  if (returned && (!Number.isInteger(body.returnDay) || body.returnDay < 1 || body.returnDay > 7)) return null;
  return {
    event: body.event, batchKey: PARTICIPATION_BATCH, cohort: body.cohort, cohortDay: body.cohortDay,
    ...(returned ? { returnDay: body.returnDay } : {}),
  };
}