import assert from "node:assert/strict";
import test from "node:test";
import { access } from "node:fs/promises";
import publicRecords, { createPublicRecordsHandler } from "../public-records.js";
import { createPublicSitemapHandler } from "../public-sitemap.js";
import { catalogStore, completeCatalog, manifestStore, publicManifest } from "../public-test-fixture.js";

const emptyStore = () => ({
  async get() { return null; },
  async list() { return { blobs: [] }; },
});

function releasedPackPreviewCards(manifest) {
  return manifest.cards.map(card => ({
    position: card.position,
    title: card.title,
    source: card.source,
    thumbnailUrl: card.media.thumbnailUrl,
    deliveryUrl: card.media.deliveryUrl,
    mimeType: card.media.mimeType,
    dimensions: card.media.dimensions,
  }));
}

test("deployed record entrypoint uses V2 Blobs context for sitemap-listed actor and edition pages", async () => {
  const store = manifestStore([publicManifest()]);
  const calls = [];
  const context = { blobs: { getStore(name) {
    calls.push(name);
    return store;
  } } };
  const sitemap = await createPublicSitemapHandler()(
    new Request("https://fandom.justlikekatie.com/sitemap.xml"),
    context,
  );
  assert.equal(sitemap.statusCode, 200);
  for (const [path, expected] of [
    ["/vibe-atlas/actors/liu-xueyi/", "Curated Vibe Atlas records"],
    ["/vibe-atlas/editions/2026-09-03/liu-xueyi/", "An original editorial record"],
  ]) {
    assert.match(sitemap.body, new RegExp(`https://fandom.justlikekatie.com${path}`));
    const result = await publicRecords(new Request(`https://fandom.justlikekatie.com${path}`), context);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("content-type"), "text/html; charset=UTF-8");
    assert.equal(result.headers.get("cache-control"), "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    const body = await result.text();
    assert.match(body, new RegExp(expected));
    assert.match(body, new RegExp(`rel="canonical" href="https://fandom.justlikekatie.com${path}"`));
  }
  assert.deepEqual(calls, ["star-of-day", "actor-audit", "star-of-day", "star-of-day"]);
});

test("deployed record entrypoint keeps incomplete inventories unavailable", async () => {
  const result = await publicRecords(
    new Request("https://fandom.justlikekatie.com/vibe-atlas/actors/liu-xueyi/"),
    { blobs: { getStore: emptyStore } },
  );
  assert.equal(result.status, 503);
  assert.equal(result.headers.get("cache-control"), "no-store");
});

test("public record pages fail closed without a complete approved inventory", async () => {
  const handler = createPublicRecordsHandler({ getStore: emptyStore });
  const result = await handler(new Request(
    "https://fandom.justlikekatie.com/vibe-atlas/actors/liu-xueyi/",
  ), {});
  assert.equal(result.statusCode, 503);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.doesNotMatch(result.body, /query|prompt|diagnostic|candidate|account|confidence/i);
});

test("unknown public record paths are noindex and never become shared cache entries", async () => {
  const store = {
    async get(key) {
      if (key.includes("catalog")) {
        return {
          schemaVersion: 1,
          catalogVersion: "v1",
          kind: "vibe-atlas-publication-manifest-catalog",
          dates: [],
        };
      }
      return null;
    },
    async list() { return { blobs: [] }; },
  };
  const handler = createPublicRecordsHandler({ getStore: () => store });
  const result = await handler(new Request(
    "https://fandom.justlikekatie.com/vibe-atlas/actors/not-published/",
  ), {});
  assert.equal(result.statusCode, 404);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.match(result.body, /noindex,follow/);
  assert.match(result.body, /rel="canonical"/);
});

test("approved actor and edition pages render indexable allowlisted records", async () => {
  const manifest = publicManifest();
  const handler = createPublicRecordsHandler({ getStore: () => manifestStore([manifest]) });
  const actor = await handler(new Request(
    "https://fandom.justlikekatie.com/vibe-atlas/actors/liu-xueyi/",
  ), {});
  const edition = await handler(new Request(
    "https://fandom.justlikekatie.com/vibe-atlas/editions/2026-09-03/liu-xueyi/",
  ), {});
  for (const result of [actor, edition]) {
    assert.equal(result.statusCode, 200);
    assert.match(result.body, /name="robots" content="index,follow,max-image-preview:large"/);
    assert.equal(result.headers["Cache-Control"], "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    assert.doesNotMatch(result.body, /PRIVATE|query|prompt|diagnostic|confidence|candidateId|sourceUrl|assetId|checksum|provenance/i);
  }
  assert.match(actor.body, /rel="canonical" href="https:\/\/fandom\.justlikekatie\.com\/vibe-atlas\/actors\/liu-xueyi\/"/);
  assert.match(actor.body, /\/vibe-atlas\/editions\/2026-09-03\/liu-xueyi\//);
  assert.match(edition.body, /rel="canonical" href="https:\/\/fandom\.justlikekatie\.com\/vibe-atlas\/editions\/2026-09-03\/liu-xueyi\/"/);
  assert.match(edition.body, /An original editorial record/);
  assert.match(edition.body, /https:\/\/media\.example\/thumbs\/liu-xueyi-2026-09-03-0\.jpg/);
  assert.match(edition.body, /property="og:image" content="https:\/\/media\.example\/assets\/liu-xueyi-2026-09-03-4\.jpg"/);
  assert.match(edition.body, /\/vibe-atlas\/actors\/liu-xueyi\//);
  assert.match(edition.body, /aria-label="Open the full public edition"/);
  assert.match(edition.body, /Every published edition is free to browse, build from, and export/);
  assert.match(edition.body, /href="\/vibe-atlas\?date=2026-09-03"/);
  assert.match(edition.body, /Open all cards and save or build from this edition/);
});

test("localized approved actor and edition records preserve verified content with Chinese metadata and noindex query isolation", async () => {
  const manifest = publicManifest();
  manifest.vibe.supportingCopy = "戏服会换，情绪废墟不换。";
  const handler = createPublicRecordsHandler({ getStore: () => manifestStore([manifest]) });
  const routes = [
    {
      path: "/zh-cn/vibe-atlas/actors/liu-xueyi/",
      english: "/vibe-atlas/actors/liu-xueyi/",
      title: "刘学义｜Vibe Atlas 精选记录",
    },
    {
      path: "/zh-cn/vibe-atlas/editions/2026-09-03/liu-xueyi/",
      english: "/vibe-atlas/editions/2026-09-03/liu-xueyi/",
      title: "刘学义 · 破碎感美人｜Vibe Atlas 每日收藏卡",
    },
  ];
  for (const route of routes) {
    const result = await handler(new Request(`https://fandom.justlikekatie.com${route.path}`), {});
    assert.equal(result.statusCode, 200);
    assert.equal(result.headers["Cache-Control"], "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    assert.match(result.body, /<html lang="zh-CN">/);
    assert.match(result.body, /name="robots" content="index,follow,max-image-preview:large"/);
    assert.match(result.body, new RegExp(`<title>${route.title}[^<]*<\\/title>`));
    assert.match(result.body, new RegExp(`rel="canonical" href="https:\\/\\/fandom\\.justlikekatie\\.com${route.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(result.body, new RegExp(`hreflang="en" href="https:\\/\\/fandom\\.justlikekatie\\.com${route.english.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(result.body, new RegExp(`hreflang="zh-CN" href="https:\\/\\/fandom\\.justlikekatie\\.com${route.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(result.body, /hreflang="x-default"/);
    const languageNav = result.body.match(/<nav class="language-nav" aria-label="(?:Language|语言)">([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(languageNav, "localized records expose the accessible language navigation");
    assert.match(languageNav, /href="\/vibe-atlas\/(?:actors\/liu-xueyi|editions\/2026-09-03\/liu-xueyi)\/"/);
    assert.match(languageNav, /href="\/zh-cn\/vibe-atlas\/(?:actors\/liu-xueyi|editions\/2026-09-03\/liu-xueyi)\/"/);
    assert.match(languageNav, /hreflang="en" lang="en"/);
    assert.match(languageNav, /hreflang="zh-CN" lang="zh-CN" aria-current="page"/);
    assert.doesNotMatch(languageNav, /[?#]/, "language links must not propagate query or fragment state");
    assert.match(result.body, /@font-face/);
    assert.match(result.body, /url\("\/fonts\/vibe-atlas-cjk\.woff2"\)/);
    assert.match(result.body, /@media \(max-width: 600px\)/);
    assert.match(result.body, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.doesNotMatch(result.body, /PRIVATE|query|prompt|diagnostic|confidence|candidateId|sourceUrl|assetId|checksum|provenance/i);

    const variant = await handler(new Request(`https://fandom.justlikekatie.com${route.path}?view=private`), {});
    assert.equal(variant.statusCode, 200);
    assert.equal(variant.headers["Cache-Control"], "no-store");
    assert.match(variant.body, /name="robots" content="noindex,follow"/);
    assert.match(variant.body, new RegExp(`rel="canonical" href="https:\\/\\/fandom\\.justlikekatie\\.com${route.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    const variantNav = variant.body.match(/<nav class="language-nav" aria-label="(?:Language|语言)">([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(variantNav);
    assert.doesNotMatch(variantNav, /[?#]/, "private query variants must never enter language links");
  }
  await access(new URL("../../../public/fonts/vibe-atlas-cjk.woff2", import.meta.url));
  const edition = await handler(new Request(
    "https://fandom.justlikekatie.com/zh-cn/vibe-atlas/editions/2026-09-03/liu-xueyi/",
  ), {});
  assert.match(edition.body, /<strong>中文副标题：<\/strong>为爱受苦/);
  assert.match(edition.body, /<strong>英文副标题（原文）：<\/strong>Born to suffer beautifully\./);
  assert.match(edition.body, /<strong>英文主题名（原文）：<\/strong>Professionally Devastated/);
  assert.match(edition.body, /<strong>编辑说明（中文）：<\/strong>戏服会换，情绪废墟不换。/);
  assert.match(edition.body, /<strong>经审核的英文原文：<\/strong>An original editorial record of restrained, moonlit melancholy/);
  assert.match(edition.body, /<strong>来源标题（原题）：<\/strong>Frame 0/);
  assert.match(edition.body, /<strong>来源：<\/strong>publisher\.example/);

  const englishOnlyManifest = publicManifest();
  const englishOnlyHandler = createPublicRecordsHandler({
    getStore: () => manifestStore([englishOnlyManifest]),
  });
  const historicalFallback = await englishOnlyHandler(new Request(
    "https://fandom.justlikekatie.com/zh-cn/vibe-atlas/editions/2026-09-03/liu-xueyi/",
  ), {});
  assert.match(historicalFallback.body, /<strong>现有英文原文（暂无中文说明）：<\/strong>An original editorial record/);
  assert.doesNotMatch(historicalFallback.body, /编辑说明（中文）/);
});

test("localized public-record errors use Chinese noindex pages without changing status or cache policy", async () => {
  const missingMethod = createPublicRecordsHandler({ getStore: emptyStore });
  const method = await missingMethod(new Request(
    "https://fandom.justlikekatie.com/zh-cn/vibe-atlas/actors/liu-xueyi/",
    { method: "POST" },
  ), {});
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers["Cache-Control"], "no-store");
  assert.equal(method.headers.Allow, "GET");
  assert.match(method.body, /<html lang="zh-CN">/);
  assert.match(method.body, /<title>不支持此请求方式/);
  assert.match(method.body, /name="robots" content="noindex,follow"/);

  const unavailableInventory = await createPublicRecordsHandler({ getStore: emptyStore })(
    new Request("https://fandom.justlikekatie.com/zh-cn/vibe-atlas/actors/liu-xueyi/"),
    {},
  );
  assert.equal(unavailableInventory.statusCode, 503);
  assert.equal(unavailableInventory.headers["Cache-Control"], "no-store");
  assert.match(unavailableInventory.body, /<html lang="zh-CN">/);
  assert.match(unavailableInventory.body, /经审核的公开记录清单尚未准备就绪/);
  assert.match(unavailableInventory.body, /name="robots" content="noindex,follow"/);

  const missingPackCatalog = await createPublicRecordsHandler({
    getStore: () => manifestStore([publicManifest()]),
    buildReleaseCatalog: async () => ({ complete: false, packs: [] }),
  })(new Request("https://fandom.justlikekatie.com/zh-cn/vibe-atlas/packs/liu-xueyi/cold-jade-immortal-0/"), {});
  assert.equal(missingPackCatalog.statusCode, 503);
  assert.equal(missingPackCatalog.headers["Cache-Control"], "no-store");
  assert.match(missingPackCatalog.body, /已发布卡包清单尚未准备就绪/);
  assert.match(missingPackCatalog.body, /name="robots" content="noindex,follow"/);

  const missingRecord = await createPublicRecordsHandler()(
    new Request("https://fandom.justlikekatie.com/zh-cn/c-drama-fandom/glossary/"),
    {},
  );
  assert.equal(missingRecord.statusCode, 404);
  assert.equal(missingRecord.headers["Cache-Control"], "no-store");
  assert.match(missingRecord.body, /<html lang="zh-CN">/);
  assert.match(missingRecord.body, /<title>未找到公开记录/);
  assert.match(missingRecord.body, /name="robots" content="noindex,follow"/);
  assert.doesNotMatch(missingRecord.body, /class="language-nav"/);
});

test("public record routes fail closed and no-store when catalog coverage is missing or malformed", async () => {
  for (const manifest of [null, { publicationDate: "2026-09-03", actor: { id: "broken" } }]) {
    const handler = createPublicRecordsHandler({
      getStore: () => catalogStore(completeCatalog(), manifest ? [manifest] : []),
    });
    const result = await handler(new Request(
      "https://fandom.justlikekatie.com/vibe-atlas/actors/liu-xueyi/",
    ), {});
    assert.equal(result.statusCode, 503);
    assert.equal(result.headers["Cache-Control"], "no-store");
    assert.doesNotMatch(result.body, /partial|query|prompt|candidate/i);
  }
});

test("released pack pages expose one stable safe preview with valid structured data", async () => {
  const manifest = publicManifest();
  const pack = {
    actorId: "liu-xueyi",
    vibeIdx: 0,
    canonical: "https://fandom.justlikekatie.com/vibe-atlas/packs/liu-xueyi/cold-jade-immortal-0/",
    actor: { id: "liu-xueyi", name: "刘学义", nameEn: "Liu Xueyi", accentColor: "#fff" },
    vibe: {
      key: "liu-xueyi:0",
      label: "仙门冷玉",
      labelEn: "Cold Jade Immortal",
      emoji: "🗡️",
      subtitle: "美得像玉，危险得像天灾。",
      subtitleEn: "All in white, like discipline itself caught feelings",
    },
    preview: {
      copy: "An original editorial record with enough substantive public context for this release.",
      copyEn: "An original editorial record with enough substantive public context for this release.",
      copyZh: "戏服会换，情绪废墟不换。",
      cards: releasedPackPreviewCards(manifest),
    },
    publishedAt: "2026-09-03T04:00:00.000Z",
    runId: "PRIVATE-RUN",
  };
  const handler = createPublicRecordsHandler({
    getStore: () => manifestStore([manifest]),
    buildReleaseCatalog: async () => ({ complete: true, packs: [pack] }),
  });
  const result = await handler(new Request(pack.canonical), {});
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.match(result.body, /index,follow,max-image-preview:large/);
  assert.match(result.body, /Cold Jade Immortal/);
  assert.match(result.body, /Become|Fandom Collectors/);
  assert.match(result.body, /view=released&amp;source=public_record&amp;actorId=liu-xueyi&amp;vibeIdx=0/);
  const teaser = result.body.match(/<section class="released-pack-teaser" aria-label="Released pack preview">(.+?)<\/section>/s)?.[1];
  assert.equal((teaser?.match(/<figure>/g) || []).length, 6);
  assert.match(result.body, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(result.body, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(result.body, /figure:nth-child\(n\+5\)\{display:none\}/);
  const structured = result.body.match(/<script type="application\/ld\+json">(.+?)<\/script>/)?.[1];
  assert.equal(JSON.parse(structured)["@type"], "Article");
  assert.doesNotMatch(result.body, /PRIVATE-RUN|query|prompt|audit|diagnostic|score|candidate|account/i);

  const chineseCanonical = "https://fandom.justlikekatie.com/zh-cn/vibe-atlas/packs/liu-xueyi/cold-jade-immortal-0/";
  const chinese = await handler(new Request(chineseCanonical), {});
  assert.equal(chinese.statusCode, 200);
  assert.equal(chinese.headers["Cache-Control"], "no-store");
  assert.match(chinese.body, /<html lang="zh-CN">/);
  assert.match(chinese.body, /name="robots" content="index,follow,max-image-preview:large"/);
  assert.match(chinese.body, /rel="canonical" href="https:\/\/fandom\.justlikekatie\.com\/zh-cn\/vibe-atlas\/packs\/liu-xueyi\/cold-jade-immortal-0\/"/);
  assert.match(chinese.body, /<strong>中文副标题：<\/strong>美得像玉，危险得像天灾。/);
  assert.match(chinese.body, /<strong>英文副标题（原文）：<\/strong>All in white, like discipline itself caught feelings/);
  assert.match(chinese.body, /<strong>编辑说明（中文）：<\/strong>戏服会换，情绪废墟不换。/);
  assert.match(chinese.body, /<strong>经审核的英文原文：<\/strong>An original editorial record with enough substantive public context/);
  assert.match(chinese.body, /hreflang="en" href="https:\/\/fandom\.justlikekatie\.com\/vibe-atlas\/packs\/liu-xueyi\/cold-jade-immortal-0\/"/);
  assert.match(chinese.body, /hreflang="zh-CN" href="https:\/\/fandom\.justlikekatie\.com\/zh-cn\/vibe-atlas\/packs\/liu-xueyi\/cold-jade-immortal-0\/"/);
  assert.match(chinese.body, /查看 刘学义 的全部卡包/);
  assert.match(chinese.body, /在 Collector 收藏库中打开此卡包/);
  assert.match(chinese.body, /\/zh-cn\/vibe-atlas\/\?view=released/);

  const chineseActor = await handler(new Request(
    "https://fandom.justlikekatie.com/zh-cn/vibe-atlas/packs/liu-xueyi/",
  ), {});
  assert.equal(chineseActor.statusCode, 200);
  assert.equal(chineseActor.headers["Cache-Control"], "no-store");
  assert.match(chineseActor.body, /<html lang="zh-CN">/);
  assert.match(chineseActor.body, /name="robots" content="index,follow"/);
  assert.match(chineseActor.body, /Vibe Atlas 已发布卡包/);
  assert.match(chineseActor.body, /href="\/zh-cn\/vibe-atlas\/packs\/liu-xueyi\/cold-jade-immortal-0\/"/);

  const variant = await handler(new Request(`${pack.canonical}?view=private`), {});
  assert.match(variant.body, /noindex,follow/);
  assert.equal(variant.headers["Cache-Control"], "no-store");
  const chineseVariant = await handler(new Request(`${chineseCanonical}?view=private`), {});
  assert.match(chineseVariant.body, /noindex,follow/);
  assert.equal(chineseVariant.headers["Cache-Control"], "no-store");
});

test("released pack revocation is visible immediately and cannot reuse a shared response", async () => {
  const manifest = publicManifest();
  const canonical = "https://fandom.justlikekatie.com/vibe-atlas/packs/liu-xueyi/cold-jade-immortal-0/";
  let released = true;
  const pack = {
    canonical,
    actor: { id: "liu-xueyi", name: "刘学义", nameEn: "Liu Xueyi" },
    vibe: { key: "liu-xueyi:0", label: "仙门冷玉", labelEn: "Cold Jade Immortal", subtitleEn: "Approved context" },
    preview: {
      copy: "A substantive approved editorial preview that is safe for public readers.",
      cards: releasedPackPreviewCards(manifest),
    },
  };
  const handler = createPublicRecordsHandler({
    getStore: () => manifestStore([manifest]),
    buildReleaseCatalog: async () => ({ complete: true, packs: released ? [pack] : [] }),
  });
  const before = await handler(new Request(canonical), {});
  assert.equal(before.statusCode, 200);
  assert.equal(before.headers["Cache-Control"], "no-store");
  released = false;
  const after = await handler(new Request(canonical), {});
  assert.equal(after.statusCode, 404);
  assert.equal(after.headers["Cache-Control"], "no-store");
  assert.match(after.body, /noindex,follow/);
});
