import assert from "node:assert/strict";
import test from "node:test";
import { validateGridEditorialContract } from "./grid-editorial-contract.js";

const image = (index, familyId = "event-1", familyEvidence = "batch") => ({
  resultId: `result-${index}`,
  imageUrl: `https://images.example/${index}.jpg`,
  familyId,
  familyEvidence,
  gridPosition: index,
});

test("legacy grids remain compatible up to nine images", () => {
  assert.equal(validateGridEditorialContract({ images: Array.from({ length: 9 }, (_, i) => image(i)) }), null);
  assert.match(
    validateGridEditorialContract({ images: Array.from({ length: 10 }, (_, i) => image(i)) }),
    /legacy grids/,
  );
});

test("Compiled is exactly nine frames", () => {
  const editorial = { mode: "compiled", compositionSize: 9, arrangement: "automatic" };
  assert.equal(
    validateGridEditorialContract({ editorial, images: Array.from({ length: 9 }, (_, i) => image(i, `family-${i}`)) }),
    null,
  );
  assert.match(
    validateGridEditorialContract({
      editorial: { ...editorial, compositionSize: 12 },
      images: Array.from({ length: 12 }, (_, i) => image(i)),
    }),
    /compiled/,
  );
});

test("Event accepts nine or twelve frames only when family evidence is uniform", () => {
  const editorial = {
    mode: "event",
    compositionSize: 12,
    arrangement: "automatic",
    primaryFamilyId: "event-1",
    primaryFamilyLabel: "One appearance",
    evidenceBasis: "batch",
  };
  const images = Array.from({ length: 12 }, (_, i) => image(i));
  assert.equal(validateGridEditorialContract({ editorial, images }), null);
  assert.match(
    validateGridEditorialContract({
      editorial,
      images: images.map((item, index) => index === 11 ? { ...item, familyId: "other" } : item),
    }),
    /share the declared/,
  );
  assert.match(
    validateGridEditorialContract({
      editorial: { ...editorial, evidenceBasis: undefined },
      images,
    }),
    /qualified family evidence/,
  );
});

test("declared composition size must match the image count", () => {
  assert.match(
    validateGridEditorialContract({
      editorial: {
        mode: "event",
        compositionSize: 12,
        arrangement: "automatic",
        primaryFamilyId: "event-1",
        evidenceBasis: "batch",
      },
      images: Array.from({ length: 9 }, (_, i) => image(i)),
    }),
    /match the image count/,
  );
});