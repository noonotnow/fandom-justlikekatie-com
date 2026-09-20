export const ARCHIVE_FREE_EDITION_COUNT = 4;

export function archiveGateEnabled(env = process.env) {
  return env.FANDOM_ARCHIVE_GATE_ENABLED !== "false";
}

export function freeArchiveDates(editions, count = ARCHIVE_FREE_EDITION_COUNT) {
  return new Set(
    [...new Set((editions || []).map(edition => edition?.date).filter(Boolean))]
      .sort((left, right) => right.localeCompare(left))
      .slice(0, count),
  );
}

export function archiveAccessDecision({
  requestedDate,
  editions,
  session = null,
  membership = null,
  enforcementEnabled = true,
}) {
  if (!enforcementEnabled || freeArchiveDates(editions).has(requestedDate)) {
    return { allowed: true, reason: "free_window", capability: "public_archive" };
  }
  if (!session) {
    return { allowed: false, reason: "sign_in", capability: "fandom_collector" };
  }
  if (membership?.status === "active") {
    return { allowed: true, reason: "active_member", capability: "fandom_collector" };
  }
  if (membership?.status === "past_due" || membership?.status === "incomplete") {
    return { allowed: false, reason: "billing_delay", capability: "fandom_collector" };
  }
  return { allowed: false, reason: "upgrade", capability: "fandom_collector" };
}

export function publicArchiveEdition(payload, { isFree = false } = {}) {
  const previewResults = Array.isArray(payload?.displayResults) && payload.displayResults.length
    ? payload.displayResults
    : (payload?.rankedBatches || []).flatMap(batch => batch?.results || []);
  return {
    date: payload?.date,
    actorName: payload?.actorName,
    actorShortNameEn: payload?.actorShortNameEn,
    vibeEmoji: payload?.vibeEmoji,
    vibeLabel: payload?.vibeLabel,
    vibeLabelEn: payload?.vibeLabelEn,
    vibeSubtitleEn: payload?.vibeSubtitleEn,
    generatedAt: payload?.generatedAt,
    previewThumbnails: [...new Set(previewResults
      .map(result => result?.thumbnail)
      .filter(thumbnail => typeof thumbnail === "string" && thumbnail.length > 0))]
      .slice(0, 3),
    access: isFree ? "free" : "member",
  };
}