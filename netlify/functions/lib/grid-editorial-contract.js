/**
 * Validate the persisted editorial composition contract at server trust
 * boundaries. Legacy records without editorial metadata remain valid with
 * one to nine images; new editorial records must be complete and internally
 * consistent.
 */
export function validateGridEditorialContract(grid) {
  const images = Array.isArray(grid?.images) ? grid.images : [];
  const editorial = grid?.editorial;

  if (editorial === undefined) {
    return images.length >= 1 && images.length <= 9
      ? null
      : "legacy grids must contain 1-9 images";
  }
  if (!editorial || typeof editorial !== "object" || Array.isArray(editorial)) {
    return "editorial metadata must be an object";
  }
  if (!["event", "compiled"].includes(editorial.mode)) {
    return "editorial mode must be event or compiled";
  }
  if (![9, 12].includes(editorial.compositionSize)) {
    return "editorial composition size must be 9 or 12";
  }
  if (!["automatic", "creator-arranged"].includes(editorial.arrangement)) {
    return "editorial arrangement must be automatic or creator-arranged";
  }
  if (images.length !== editorial.compositionSize) {
    return "editorial composition size must match the image count";
  }
  if (editorial.mode === "compiled") {
    return editorial.compositionSize === 9
      ? null
      : "compiled compositions must contain exactly 9 images";
  }
  if (typeof editorial.primaryFamilyId !== "string" || !editorial.primaryFamilyId) {
    return "event compositions require a primary family";
  }
  if (!["batch", "persisted-event"].includes(editorial.evidenceBasis)) {
    return "event compositions require qualified family evidence";
  }
  if (images.some(image => (
    image?.familyId !== editorial.primaryFamilyId
    || !["batch", "persisted-event"].includes(image?.familyEvidence)
  ))) {
    return "event images must share the declared evidenced family";
  }
  return null;
}