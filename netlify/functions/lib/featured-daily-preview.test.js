import assert from "node:assert/strict";
import test from "node:test";
import { ACTOR_PACKS } from "./actor-packs.js";
import { releasedPackCatalog, releasedPackPath } from "./released-pack-catalog.js";
import { createPublicReleasedPackPreviewHandler } from "../public-released-pack-preview.js";
import { createPublicRecordsHandler } from "../public-records.js";
import { createPublicSitemapHandler } from "../public-sitemap.js";
import { manifestStore, publicManifest } from "../public-test-fixture.js";

test("a qualified Liu Yuning first grid reaches its exact preview, actor record, and sitemap", async () => {
  const actor = ACTOR_PACKS.find(item => item.id === "liu-yuning");
  const vibe = actor.vibes[2];
  // This is synthetic materialized evidence, not the MEDIA-verified historical
  // September 25 manifest whose exact content now has its own approval pin.
  const date = "2026-10-09";
  const manifest = publicManifest({ date, actorId: actor.id });
  manifest.actor = {
    id: actor.id, name: actor.name, nameEn: actor.shortName_en, accentColor: actor.accentColor,
  };
  manifest.vibe = {
    ...manifest.vibe, idx: 2, key: "liu-yuning:2",
    label: vibe.label, labelEn: vibe.label_en, subtitleEn: vibe.subtitle_en,
    supportingCopyEn: vibe.supportingCopy_en,
  };
  const store = manifestStore([manifest]);
  const catalog = await releasedPackCatalog({}, {
    publicationStore: store,
    actorPacks: [actor],
    eligibilityReader: async (_store, _actor, index) => index === 2
      ? { eligible: true, verdict: "approved_override", runId: "verified-run" }
      : null,
  });
  assert.equal(catalog.complete, true);
  assert.equal(catalog.packs.length, 1);
  assert.equal(catalog.packs[0].publicationDate, date);
  const getStore = () => store;
  const buildReleaseCatalog = async () => catalog;
  const path = releasedPackPath(actor, vibe, 2);
  const preview = await createPublicReleasedPackPreviewHandler({
    getStore, actorPacks: [actor], buildCatalog: buildReleaseCatalog,
  })({
    method: "GET",
    url: `https://fandom.justlikekatie.com/.netlify/functions/public-released-pack-preview?actorId=liu-yuning&vibeIdx=2&date=${date}`,
  }, {});
  assert.equal(preview.statusCode, 200);
  assert.equal(JSON.parse(preview.body).preview.cards.length, 9);
  assert.equal(preview.body.includes("PRIVATE"), false);
  const records = createPublicRecordsHandler({
    getStore, actorPacks: [actor], buildReleaseCatalog,
  });
  for (const route of [path, "/vibe-atlas/packs/liu-yuning/", "/vibe-atlas/actors/liu-yuning/"]) {
    const result = await records(new Request(`https://fandom.justlikekatie.com${route}`), {});
    assert.equal(result.statusCode, 200, route);
    assert.match(result.body, /index,follow/);
    assert.doesNotMatch(result.body, /PRIVATE|verified-run|sourceUrl/);
  }
  const sitemap = await createPublicSitemapHandler({
    getStore, actorPacks: [actor], buildReleaseCatalog,
  })(new Request("https://fandom.justlikekatie.com/sitemap.xml"), {});
  assert.equal(sitemap.statusCode, 200);
  assert.match(sitemap.body, new RegExp(path));
  assert.match(sitemap.body, /\/vibe-atlas\/actors\/liu-yuning\//);
});