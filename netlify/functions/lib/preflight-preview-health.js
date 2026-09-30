export const preflightPreviewHealthKey = (actorId, vibeIdx) =>
  `preflight-preview-health/v1/${encodeURIComponent(actorId)}/${vibeIdx}`;

const REASONS = new Set([
  "source_image_unavailable",
  "media_registration_unavailable",
  "approval_read_unavailable",
  "receipt_storage_unavailable",
]);

export async function recordPreflightPreviewAttempt(store, actorId, vibeIdx, error = null) {
  const reasonCode = REASONS.has(error?.reasonCode) ? error.reasonCode : "publication_unavailable";
  await store.setJSON(preflightPreviewHealthKey(actorId, vibeIdx), {
    status: error ? "failed" : "published",
    ...(error ? { reasonCode } : {}),
    ...(error && Number.isInteger(error.cardPosition) && error.cardPosition >= 1 && error.cardPosition <= 3
      ? { cardPosition: error.cardPosition } : {}),
    attemptedAt: new Date().toISOString(),
  });
}

export async function readPreflightPreviewAttempts(store, actor) {
  const results = await Promise.all(actor.vibes.map((_, vibeIdx) =>
    store.get(preflightPreviewHealthKey(actor.id, vibeIdx), { type: "json", consistency: "strong" })));
  return results.map((value, vibeIdx) => ({
    vibeIdx,
    status: value?.status === "failed" || value?.status === "published" ? value.status : "none",
    ...(value?.status === "failed" && REASONS.has(value.reasonCode) ? { reasonCode: value.reasonCode } : {}),
    ...(value?.status === "failed" && Number.isInteger(value.cardPosition)
      && value.cardPosition >= 1 && value.cardPosition <= 3 ? { cardPosition: value.cardPosition } : {}),
    ...(typeof value?.attemptedAt === "string" && !Number.isNaN(Date.parse(value.attemptedAt))
      ? { attemptedAt: value.attemptedAt } : {}),
  }));
}