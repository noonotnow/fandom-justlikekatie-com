import test from "node:test";
import assert from "node:assert/strict";
import {
  protectedReleasedPackIds,
  releasedPackCatalog,
} from "./released-pack-catalog.js";

const actorPacks = [{
  id: "fixture-actor",
  name: "Fixture Actor",
  shortName_en: "Fixture Actor",
  accentColor: "#123456",
  vibes: [
    { label: "甲", label_en: "Approved Override", subtitle_en: "Eligible for Star of the Day" },
    { label: "乙", label_en: "Rejected", subtitle_en: "Not eligible" },
  ],
}];

const approvedOverride = {
  eligible: true,
  runId: "run-approved-override",
  verdict: "approved_override",
  vibeConfirmed: true,
  publishableConfirmed: true,
};

const rejected = {
  eligible: false,
  runId: "run-rejected",
  verdict: "rejected",
  vibeConfirmed: false,
  publishableConfirmed: false,
};

test("released pack catalog uses the same approved predicate as Star of the Day", async () => {
  const catalog = await releasedPackCatalog({}, {
    actorPacks,
    getEligibilitySnapshot: async (_store, _actor, vibeIdx) =>
      vibeIdx === 0 ? approvedOverride : rejected,
    readPublications: async () => ({
      inventory: { complete: true },
      manifests: [],
    }),
  });

  assert.equal(catalog.complete, true);
  assert.equal(catalog.indexingComplete, true);
  assert.equal(catalog.packs.length, 1);
  assert.equal(catalog.packs[0].actorId, "fixture-actor");
  assert.equal(catalog.packs[0].vibeIdx, 0);
  assert.equal(catalog.packs[0].preview, null);
  assert.deepEqual([...protectedReleasedPackIds(catalog)], ["fixture-actor:0"]);
});

test("publication inventory failure does not hide eligible Collector packs", async () => {
  const catalog = await releasedPackCatalog({}, {
    actorPacks: actorPacks.slice(0, 1),
    getEligibilitySnapshot: async (_store, _actor, vibeIdx) =>
      vibeIdx === 0 ? approvedOverride : rejected,
    readPublications: async () => {
      throw new Error("publication inventory unavailable");
    },
  });

  assert.equal(catalog.complete, true);
  assert.equal(catalog.indexingComplete, false);
  assert.equal(catalog.indexingFailureReason, "publication_inventory_unavailable");
  assert.equal(catalog.packs.length, 1);
  assert.equal(catalog.packs[0].preview, null);
});
