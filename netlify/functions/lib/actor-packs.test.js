import test from "node:test";
import assert from "node:assert/strict";
import { ACTOR_PACKS } from "./actor-packs.js";

test("uses the corrected Liu Xueyi shattered beauty search spells", () => {
  const actor = ACTOR_PACKS.find(({ id }) => id === "liu-xueyi");
  assert.ok(actor, "Liu Xueyi actor pack must exist");

  const vibe = actor.vibes.find(({ label }) => label === "破碎感美人");
  assert.ok(vibe, "Liu Xueyi shattered beauty vibe must exist");

  assert.deepEqual(vibe.queries, [
    "刘学义 念无双 源仲 破碎感",
    "刘学义 千古玦尘 天启 悲伤",
    "刘学义 千古玦尘 天气 悲伤",
    "刘学义 天乩之白蛇传说 斩荒 破碎",
    "刘学义 秋蝉 林小庄 落寞",
    "刘学义 落花时节又逢君 锦绣 悲剧",
    "刘学义 春花焰 慕容璟和 破碎",
  ]);
  assert.ok(vibe.queries.includes("刘学义 千古玦尘 天启 悲伤"));
  assert.ok(vibe.queries.includes("刘学义 千古玦尘 天气 悲伤"));

  const badTerms = ["上古情歌", "叶冲", "段飞", "慕容景和", "杀我还是爱我"];
  for (const badTerm of badTerms) {
    assert.ok(
      vibe.queries.every((query) => !query.includes(badTerm)),
      `shattered beauty queries must not contain ${badTerm}`,
    );
  }
});
