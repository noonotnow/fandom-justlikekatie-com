import test from "node:test";
import assert from "node:assert/strict";
import { ACTOR_PACKS } from "./actor-packs.js";

test("Professionally Devastated uses character-grounded Liu Xueyi search ladders", () => {
  const actor = ACTOR_PACKS.find(({ id }) => id === "liu-xueyi");
  assert.ok(actor, "Liu Xueyi actor pack must exist");

  const vibe = actor.vibes.find(({ label }) => label === "破碎感美人");
  assert.ok(vibe, "Liu Xueyi heartbreak vibe must exist");
  assert.equal(vibe.label_en, "Professionally Devastated");
  assert.equal(vibe.subtitle_en, "Born to suffer beautifully.");
  assert.equal(vibe.supportingCopy_en, "The costume changes. The emotional ruin remains.");

  assert.deepEqual(vibe.queries, [
    "刘学义 慕容璟和 春花焰 受伤",
    "慕容璟和 眉林 婚服 抱",
    "慕容璟和 崩溃 哭戏",
    "刘学义 沈在野 桃花映江山 受伤",
    "沈在野 姜桃花 吐血 狼狈",
    "刘学义 锦绣 落花时节又逢君 红凝 受伤",
    "锦绣 红凝 抱 哭戏",
  ]);
  assert.ok(vibe.queries.every(query => /慕容璟和|沈在野|锦绣/.test(query)));

  const badTerms = ["上古情歌", "叶冲", "段飞", "慕容景和", "杀我还是爱我"];
  for (const badTerm of badTerms) {
    assert.ok(
      vibe.queries.every((query) => !query.includes(badTerm)),
      `Professionally Devastated queries must not contain ${badTerm}`,
    );
  }
});
