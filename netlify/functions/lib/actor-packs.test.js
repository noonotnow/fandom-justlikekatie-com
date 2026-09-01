import test from "node:test";
import assert from "node:assert/strict";
import { ACTOR_PACKS } from "./actor-packs.js";

test("Cold Jade Immortal searches stay grounded in Yuan Zhong's pale celestial character study", () => {
  const actor = ACTOR_PACKS.find(({ id }) => id === "liu-xueyi");
  assert.ok(actor, "Liu Xueyi actor pack must exist");

  const vibe = actor.vibes.find(({ label_en }) => label_en === "Cold Jade Immortal");
  assert.ok(vibe, "Cold Jade Immortal must exist");
  assert.deepEqual(vibe.queries, [
    "刘学义 念无双 源仲 白衣",
    "源仲 念无双 白袍 剧照",
    "刘学义 源仲 银白 造型",
    "刘学义 源仲 清冷 剧照",
    "源仲 念无双 月光 雪景",
    "刘学义 源仲 冰蓝 长袍",
    "源仲 念无双 仙门 全身 剧照",
  ]);
  assert.ok(vibe.queries.every(query => query.includes("源仲")));
  assert.ok(vibe.queries.every(query => !query.endsWith("写真")));
});

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

test("Court Menace searches stay grounded in institutional threat rather than generic costume styling", () => {
  const actor = ACTOR_PACKS.find(({ id }) => id === "liu-xueyi");
  const vibe = actor.vibes.find(({ label_en }) => label_en === "Court Menace");

  assert.deepEqual(vibe.queries, [
    "刘学义 慕容璟和 春花焰 权臣",
    "刘学义 权臣 朝堂 剧照",
    "刘学义 宫廷 权谋 造型",
    "刘学义 皇子 官服 剧照",
    "刘学义 深绿 朝堂 造型",
    "刘学义 黑衣 谋略 剧照",
    "刘学义 权力 审视 古装",
  ]);
  assert.ok(vibe.queries.every(query => !query.endsWith("写真")));
  assert.ok(vibe.queries.some(query => query.includes("朝堂")));
  assert.ok(vibe.queries.some(query => query.includes("权谋")));
});
