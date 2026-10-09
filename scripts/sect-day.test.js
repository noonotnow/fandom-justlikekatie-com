import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ENDINGS, SCENES, GAME_URL, incomingEnding, sceneAt, resolveRun } from "../public/c-drama-fandom/fandom-games/sect-day/story.js";
import { sectPreviewHtml } from "./sect-day-pages.js";
import seoIndexing, { shouldNoindexUrl } from "../netlify/edge-functions/seo-indexing.js";
const read = path => readFileSync(path, "utf8");
const base = "public/c-drama-fandom/fandom-games/sect-day/";
test("all 243 trails resolve exactly once; six endings and their authored examples remain reachable", () => {
  const counts = new Map(); let total = 0;
  for (let n = 0; n < 243; n++) {
    const trail = Array.from({ length: 5 }, (_, i) => Math.floor(n / 3 ** i) % 3);
    const result = resolveRun(trail);
    assert.ok(ENDINGS.some(e => e.id === result.id));
    assert.ok(result.cause && result.tactic && result.ally);
    assert.deepEqual(resolveRun(trail), result);
    for (let i = 0; i < 5; i++) {
      const scene = sceneAt(i, trail.slice(0, i));
      assert.equal(scene.choices.length, 3);
      assert.ok(scene.callbacks.every(text => typeof text === "string" && text.length > 20));
    }
    if (result.id === "sect-savior") assert.match(result.ally, trail[2] === 0 ? /Ren/ : /Sui/);
    if (result.id === "before-lunch") assert.notEqual(trail[0], 0);
    counts.set(result.id, (counts.get(result.id) || 0) + 1); total++;
  }
  assert.equal(total, 243); assert.equal(counts.size, 6);
  const examples = {
    "sect-savior": [[1,0,0,1,0],[2,0,1,2,0]],
    "three-realms": [[0,0,0,0,1],[2,2,2,2,1]],
    "heavenly-vow": [[0,0,0,1,0],[0,2,2,2,2]],
    "masters-favorite": [[1,1,0,0,0],[1,0,2,0,2]],
    "before-lunch": [[2,2,2,2,2],[1,1,0,2,2]],
    "back-mountain": [[1,1,0,1,0],[1,0,2,1,2]],
  };
  for (const [id, trails] of Object.entries(examples)) for (const trail of trails) assert.equal(resolveRun(trail).id, id);
  for (const trail of [[], [0,0,0,0], [0,0,0,0,3], [0,0,0,0,NaN]]) assert.throws(() => resolveRun(trail));
});
test("callbacks identify specific earlier choices in at least two later scenes", () => {
  assert.match(sceneAt(2, [2,0]).callbacks.join(" "), /exit map/);
  assert.match(sceneAt(3, [2,0,0]).callbacks.join(" "), /diagram.*Ren/s);
  assert.match(sceneAt(3, [1,1,1]).callbacks.join(" "), /sealed manual.*Sui/s);
  assert.match(sceneAt(4, [1,2,2,2]).callbacks.join(" "), /one-day.*exit slip/s);
});
test("allowlisted previews have fixed metadata and one canonical, unknown or duplicate input fails closed", async () => {
  const template = read(base + "index.html");
  for (const ending of ENDINGS) {
    const html = sectPreviewHtml(template, ending);
    assert.match(html, /noindex,follow/);
    assert.ok(html.includes(`content="${ending.name}"`));
    assert.ok(html.includes(`href="${GAME_URL}"`));
    assert.ok(html.includes(`${GAME_URL}?ending=${ending.id}`));
    assert.equal(incomingEnding("?ending=" + ending.id)?.id, ending.id);
    const response = await seoIndexing(new Request(GAME_URL + "?ending=" + ending.id), { next: async () => new Response(html, { headers: { "content-type": "text/html" } }) });
    assert.equal(response.headers.get("X-Robots-Tag"), "noindex, follow");
    assert.ok((await response.text()).includes(ending.name.replaceAll("'", "&#39;")));
  }
  for (const search of ["?ending=UNKNOWN", "?ending=%3Cscript%3E", "?ending=sect-savior&ending=three-realms", "?ending=", ""]) {
    assert.equal(incomingEnding(search), null);
    const response = await seoIndexing(new Request(GAME_URL + search), { next: async () => new Response(sectPreviewHtml(template, ENDINGS[0]), { headers: { "content-type": "text/html" } }) });
    const html = await response.text();
    assert.ok(html.includes('content="Can You Survive Your First Day in a Sect?"'));
    assert.ok(html.includes("sect-day-master-og.jpg"));
    assert.equal(shouldNoindexUrl(GAME_URL + search), Boolean(search));
  }
  assert.equal(SCENES.length, 5);
  assert.equal(shouldNoindexUrl(GAME_URL + "index.html?ending=sect-savior"), true);
});
