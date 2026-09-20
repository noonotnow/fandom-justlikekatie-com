export type BlindReviewCandidate = {
  occurrenceId?: unknown;
  thumbnail?: unknown;
  selected?: unknown;
  dropReason?: unknown;
};

export type BlindReviewCandidateEligibility = {
  queued: boolean;
  evidenceEligible: boolean;
  requiresOccurrenceIdentity: boolean;
};

export function blindReviewCandidateEligibility(
  candidate: BlindReviewCandidate | null | undefined,
): BlindReviewCandidateEligibility;

export function isBlindReviewQueueCandidate(
  candidate: BlindReviewCandidate | null | undefined,
): boolean;

export function isBlindReviewEvidenceCandidate(
  candidate: BlindReviewCandidate | null | undefined,
): boolean;