export function blindReviewCandidateEligibility(candidate) {
  const hasThumbnail = Boolean(candidate?.thumbnail);
  const hasOccurrenceIdentity = typeof candidate?.occurrenceId === "string"
    && Boolean(candidate.occurrenceId.trim());
  const explicitlyRejected = candidate?.selected === false || Boolean(candidate?.dropReason);
  return {
    queued: Boolean(
      candidate
      && hasThumbnail
      && hasOccurrenceIdentity
      && (candidate.selected !== true || candidate.dropReason)
    ),
    evidenceEligible: Boolean(
      candidate
      && hasThumbnail
      && hasOccurrenceIdentity
      && explicitlyRejected
    ),
    requiresOccurrenceIdentity: Boolean(candidate && hasThumbnail && explicitlyRejected),
  };
}

export function isBlindReviewQueueCandidate(candidate) {
  return blindReviewCandidateEligibility(candidate).queued;
}

export function isBlindReviewEvidenceCandidate(candidate) {
  return blindReviewCandidateEligibility(candidate).evidenceEligible;
}