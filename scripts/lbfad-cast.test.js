import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PUBLIC_STATIC_ROUTES } from "../shared/public-routes.js";

const guide = readFileSync(new URL("../public/c-dramas/love-between-fairy-and-devil/index.html", import.meta.url), "utf8");
const relationships = readFileSync(new URL("../public/c-dramas/love-between-fairy-and-devil/relationships/index.html", import.meta.url), "utf8");
const fullGuide = readFileSync(new URL("../public/c-dramas/love-between-fairy-and-devil/cast/index.html", import.meta.url), "utf8");
const credits = JSON.parse(readFileSync(new URL("../docs/research/lbfad-cast-primary-credits-2026-10-03.json", import.meta.url), "utf8"));
const cast = guide.match(/<section id="cast-and-format"[^>]*>([\s\S]*?)<\/section>/)?.[1];

test("LBFAD answers the verified two-lead cast question inside the existing guide", () => {
  assert.ok(cast);
  assert.match(cast, /Esther Yu plays Orchid \(Xiao Lanhua\); Dylan Wang plays Dongfang Qingcang/);
  assert.equal((cast.match(/<li>/g) ?? []).length, 2);
  assert.match(cast, /not a complete cast database/);
  assert.match(guide, /href="#cast-and-format"/);
  assert.match(relationships, /href="\/c-dramas\/love-between-fairy-and-devil\/#cast-and-format"/);
  assert.equal(PUBLIC_STATIC_ROUTES.filter(route => /love-between-fairy-and-devil/.test(route.path)).length, 5);
  assert.match(cast, /href="\/c-dramas\/love-between-fairy-and-devil\/cast\/"/);
  assert.match(relationships, /href="\/c-dramas\/love-between-fairy-and-devil\/cast\/"/);
});

test("LBFAD distinguishes productions, cites primary listings, and does not invent actor links", () => {
  assert.match(cast, /2022 live-action series, listed with 36 episodes/);
  assert.match(cast, /Chinese animation \(donghua\)/);
  assert.match(cast, /not an animated voice-cast list/);
  assert.match(cast, /do not guarantee playback in your country/);
  assert.match(cast, /https:\/\/www\.viki\.com\/tv\/38664c-love-between-fairy-and-devil\?locale=en#about/);
  assert.match(cast, /https:\/\/www\.iq\.com\/album\/love-between-fairy-and-devil-2022-ld8e5pprpl/);
  assert.match(cast, /https:\/\/www\.iq\.com\/album\/love-between-fairy-and-devil-cang-lan-jue-2022-ffsxk2apr1/);
  assert.doesNotMatch(cast, /\/vibe-atlas\/(?:actors|packs)\//);
  assert.doesNotMatch(cast, /Goddess|Xiyun|Xiao Run|ending|finale|featured today/i);
  assert.match(cast, /not a claim about the performers’ private lives/);
});

test("LBFAD retains its editorial artifact and actor-independent Daily Drop continuation", () => {
  assert.match(guide, /dylan-wang-high-cheekbone-economy\.svg/);
  assert.match(guide, /one featured C-drama actor, one assigned aesthetic, and nine curated pieces of evidence/);
  assert.match(guide, /href="\/vibe-atlas" data-atlas-continuation>Open today’s Vibe Atlas/);
  const schema = JSON.parse(guide.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)[1]);
  assert.equal(schema["@graph"][0].dateModified, "2026-10-03");
  assert.equal(schema["@graph"][0].datePublished, "2026-09-19");
});

test("the fuller cast guide matches exactly the seven bounded primary-source credits", () => {
  const rows = [...fullGuide.match(/<tbody>([\s\S]*?)<\/tbody>/)[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(match => match[1]);
  assert.equal(rows.length, 7);
  assert.equal(credits.rows.length, 7);
  for (const [index, credit] of credits.rows.entries()) {
    for (const label of [credit.displayCharacter, credit.displayPerformer, credit.character, credit.performer]) {
      assert.ok(rows[index].includes(label), `Cast row must match verified credit: ${label}`);
    }
    if (credit.verifiedDisplayVariant) assert.ok(rows[index].includes(credit.verifiedDisplayVariant));
  }
  assert.match(fullGuide, /https:\/\/www\.iqiyi\.com\/a_fxzcys7jh5\.html/);
  assert.match(fullGuide, /provider synopses and credits can contain spoilers/i);
  assert.doesNotMatch(fullGuide, /Xiyun|息芸|Xiao Run|萧润|Xie Wanqing|谢惋卿|Goddess|finale|featured today/i);
  assert.doesNotMatch(fullGuide, /\/vibe-atlas\/(?:actors|packs)\//);
});

test("the approved fuller guide has a canonical registered route, valid fragments, and its release date", () => {
  const path = "/c-dramas/love-between-fairy-and-devil/cast/";
  assert.equal(PUBLIC_STATIC_ROUTES.find(route => route.path === path)?.page, `public${path}index.html`);
  assert.equal((fullGuide.match(/rel="canonical"/g) ?? []).length, 1);
  assert.match(fullGuide, /rel="canonical" href="https:\/\/fandom\.justlikekatie\.com\/c-dramas\/love-between-fairy-and-devil\/cast\/"/);
  for (const [, fragment] of fullGuide.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(fullGuide.includes(`id="${fragment}"`), `Fragment target must exist: ${fragment}`);
  }
  const schema = JSON.parse(fullGuide.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)[1]);
  assert.equal(schema["@graph"][0].dateModified, "2026-10-03");
  assert.equal(schema["@graph"][0].datePublished, "2026-10-03");
  assert.match(fullGuide, /one featured actor, one aesthetic, nine curated pieces/);
  assert.match(fullGuide, /not an animated voice-cast guide/);
  const analytics = readFileSync(new URL("../public/c-drama-fandom/editorial.js", import.meta.url), "utf8");
  assert.match(analytics, /"drama-lbfad-cast"/);
  for (const [, section] of fullGuide.matchAll(/data-section-id="([^"]+)"/g)) {
    if (section === "editorial-note") continue; // Existing source-note sections are deliberately not read-depth events.
    assert.ok(analytics.includes(`"${section}"`), `Cast section must be an allowlisted analytics label: ${section}`);
  }
});