import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTOR_PACKS,
  PUBLIC_ACTOR_PACKS,
  PUBLIC_ACTOR_PACKS_CACHE_CONTROL,
  toCollectorActorPack,
  toPublicActorPack,
} from "./actor-packs.js";
import { handler } from "../actor-packs.js";
import { createActorPackDepthHandler } from "./actor-pack-depth.js";

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
    "源仲 念无双 战斗 剧照",
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
    "刘学义 慕容璟和 帅气 剧照",
    "刘学义 沈在野 帅气 剧照",
    "刘学义 锦绣 帅气 剧照",
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
    "刘学义 沈在野 桃花映江山 权谋",
    "沈在野 桃花映江山 朝堂 谋略",
    "刘学义 权臣 朝堂 剧照",
    "刘学义 宫廷 权谋 造型",
    "刘学义 深绿 朝堂 造型",
    "刘学义 权力 审视 古装",
  ]);
  assert.ok(vibe.queries.every(query => !query.endsWith("写真")));
  assert.ok(vibe.queries.some(query => query.includes("朝堂")));
  assert.ok(vibe.queries.some(query => query.includes("权谋")));
});

test("the public actor DTO is an explicit editorial allowlist", () => {
  const actor = PUBLIC_ACTOR_PACKS.find(({ id }) => id === "liu-xueyi");
  assert.ok(actor);
  assert.deepEqual(Object.keys(actor).sort(), [
    "accentColor",
    "cardBg",
    "icon",
    "id",
    "name",
    "shortName",
    "shortName_en",
    "title",
    "title_en",
    "vibes",
  ].sort());
  assert.ok(actor.vibes.length > 0);
  assert.deepEqual(Object.keys(actor.vibes[0]).sort(), [
    "emoji",
    "label",
    "label_en",
    "shareFragment",
    "subtitle",
    "subtitle_en",
  ].sort());
});

test("public actor DTOs never expose private retrieval or authoring fields", () => {
  const privateField = /query|prompt|diagnostic|score|source|candidate|reject|confidence|inventory|retrieval|audit/i;
  const visit = value => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      assert.doesNotMatch(key, privateField, `private field leaked: ${key}`);
      visit(child);
    }
  };
  visit(PUBLIC_ACTOR_PACKS);
  assert.equal(JSON.stringify(PUBLIC_ACTOR_PACKS).includes("刘学义 念无双"), false);
  assert.equal(JSON.stringify(PUBLIC_ACTOR_PACKS).includes("mjPrompt"), false);
});

test("public actor projection copies data instead of exposing private pack objects", () => {
  const source = ACTOR_PACKS.find(({ id }) => id === "liu-xueyi");
  const projected = toPublicActorPack(source);
  assert.notEqual(projected, source);
  assert.notEqual(projected.vibes, source.vibes);
  assert.notEqual(projected.vibes[0], source.vibes[0]);
  assert.equal("queries" in projected.vibes[0], false);
});

test("actor-pack endpoint serves the public DTO with a separate shared-cache contract", async () => {
  const response = await handler();
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "application/json");
  assert.equal(response.headers["Cache-Control"], PUBLIC_ACTOR_PACKS_CACHE_CONTROL);
  assert.match(response.headers["Cache-Control"], /^public, /);
  assert.match(response.headers["Cache-Control"], /s-maxage=3600/);
  assert.deepEqual(JSON.parse(response.body), PUBLIC_ACTOR_PACKS);
});

test("Collector actor projection keeps source depth and provenance separate from public data", () => {
  const source = ACTOR_PACKS.find(({ id }) => id === "liu-yuning");
  const projected = toCollectorActorPack(source);
  assert.equal(projected.provenance.sourcePackId, "liu-yuning");
  assert.equal(projected.provenance.attribution, "Vibe Atlas Fandom editorial actor pack");
  assert.deepEqual(projected.vibes[0].sourceDepth.queries, source.vibes[0].queries);
  assert.equal(projected.vibes[0].sourceDepth.authoringPrompt, source.vibes[0].mjPrompt);
  assert.equal("queries" in projected.vibes[0], false);
  assert.equal("mjPrompt" in projected.vibes[0], false);
});

test("Collector actor depth requires active membership and never uses a shared cache", async () => {
  const makeRequest = (method = "GET", path = "/actor-pack-depth") =>
    new Request(`https://example.test${path}`, { method });
  const auth = { authenticate: async () => ({ user: { accountId: "usr_1" } }) };
  const billing = {
    initialize: async () => {},
    repository: () => ({
      membershipForAccount: async () => ({
        status: "active", metadata: { product: "fandom_collector" },
      }),
    }),
  };
  const handlerWithAccess = createActorPackDepthHandler({ auth, billing });
  const response = await handlerWithAccess(makeRequest(), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
  const body = await response.json();
  assert.equal(body.kind, "fandom-collector-actor-pack-depth");
  assert.ok(body.packs[0].provenance);
  assert.ok(body.packs[0].vibes[0].sourceDepth.queries.length > 0);
  assert.doesNotMatch(JSON.stringify(body), /accountId|email/);

  const locked = await createActorPackDepthHandler({
    auth,
    billing: {
      initialize: async () => {},
      repository: () => ({ membershipForAccount: async () => ({ status: "past_due" }) }),
    },
  })(makeRequest(), {});
  assert.equal(locked.status, 403);
  assert.equal(locked.headers.get("cache-control"), "private, no-store");

  for (const product of ["creator_os", "fandom_creator_bridge"]) {
    const denied = await createActorPackDepthHandler({
      auth,
      billing: {
        initialize: async () => {},
        repository: () => ({
          membershipForAccount: async () => ({ status: "active", metadata: { product } }),
        }),
      },
    })(makeRequest(), {});
    assert.equal(denied.status, 403, `${product} must not unlock Collector actor depth`);
  }

  const bundled = await createActorPackDepthHandler({
    auth,
    billing: {
      initialize: async () => {},
      repository: () => ({
        membershipForAccount: async () => ({
          status: "active", metadata: { product: "ecosystem_bundle" },
        }),
      }),
    },
  })(makeRequest(), {});
  assert.equal(bundled.status, 200);
});

test("Collector actor depth supports one actor without widening the public endpoint", async () => {
  const handlerWithAccess = createActorPackDepthHandler({
    auth: { authenticate: async () => ({ user: { accountId: "usr_1" } }) },
    billing: {
      initialize: async () => {},
      repository: () => ({
        membershipForAccount: async () => ({
          status: "active", metadata: { product: "fandom_collector" },
        }),
      }),
    },
  });
  const response = await handlerWithAccess(
    new Request("https://example.test/actor-pack-depth?actorId=liu-xueyi"),
    {},
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.packs.map(pack => pack.id), ["liu-xueyi"]);

  const missing = await handlerWithAccess(
    new Request("https://example.test/actor-pack-depth?actorId=not-real"),
    {},
  );
  assert.equal(missing.status, 404);
});
