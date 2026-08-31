import test from "node:test";
import assert from "node:assert/strict";
import { ACTOR_PACKS } from "./actor-packs.js";

test("uses broad, vibe-aware Liu Xueyi search ladders", () => {
  const actor = ACTOR_PACKS.find(({ id }) => id === "liu-xueyi");
  assert.ok(actor, "Liu Xueyi actor pack must exist");

  const vibe = actor.vibes.find(({ label }) => label === "破碎感美人");
  assert.ok(vibe, "Liu Xueyi shattered beauty vibe must exist");

  assert.deepEqual(vibe.queries, [
    "刘学义 采访 情绪",
    "刘学义 角色 剧照",
    "刘学义 斩荒 剧照",
    "刘学义 天启 剧照",
    "刘学义 源仲 剧照",
    "刘学义 秋蝉 林小庄",
    "刘学义 春花焰 慕容璟和",
  ]);
  assert.ok(vibe.queries.includes("刘学义 斩荒 剧照"));
  assert.ok(vibe.queries.includes("刘学义 天启 剧照"));

  const badTerms = ["上古情歌", "叶冲", "段飞", "慕容景和", "杀我还是爱我"];
  for (const badTerm of badTerms) {
    assert.ok(
      vibe.queries.every((query) => !query.includes(badTerm)),
      `shattered beauty queries must not contain ${badTerm}`,
    );
  }
});
