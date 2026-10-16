import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PUBLIC_ROUTE_PATHS, PUBLIC_STATIC_ROUTES, staticSitemapXml } from "../shared/public-routes.js";
import { assertStaticGuidePublicInventory } from "../scripts/static-guide-public-inventory.js";
import { assertPublicStaticNetlifyRedirects } from "../scripts/generate-public-pages.js";
import { evaluateWatchRecord, loadWatchRecord, renderWatchPage } from "../scripts/where-to-watch.js";

test("Qilin's real page is registered once and included in the public inventory and sitemap", () => {
  const route = PUBLIC_ROUTE_PATHS.qilinKeeper;
  assert.equal(route, "/c-drama-fandom/fandom-games/qilin-keeper/");
  const matches = PUBLIC_STATIC_ROUTES.filter(item => item.path === route);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].page, `public${route}index.html`);
  assertStaticGuidePublicInventory(process.cwd());
  assertPublicStaticNetlifyRedirects(readFileSync("netlify.toml", "utf8"));
  const url = `https://fandom.justlikekatie.com${route}`;
  assert.equal(staticSitemapXml().split(`<loc>${url}</loc>`).length - 1, 1);
  const page = readFileSync(matches[0].page, "utf8");
  assert.ok(page.includes(`rel="canonical" href="${url}"`));
  assert.ok(page.includes(`property="og:url" content="${url}"`));
});

test("refreshed official-source observations retain history and never bypass expiry", () => {
  const record = loadWatchRecord();
  const reviewed = new Date(record.checkedAt);
  assert.equal(evaluateWatchRecord(record, reviewed).publishable, true);
  assert.ok(record.history.some(item => item.checkedAt === "2026-10-06T19:04:23Z"));
  const us = record.platforms.filter(item => item.state === "verified");
  assert.ok(us.length > 0);
  assert.ok(us.every(item => item.territories.length === 1 && item.territories[0] === "US"));
  assert.ok(record.regionGuidance.filter(item => item.name !== "United States")
    .every(item => item.status === "unverified"));
  assert.equal(record.schedule.state, "unknown");
  const expired = new Date(reviewed.getTime() + 8 * 86400000);
  assert.equal(evaluateWatchRecord(record, expired).publishable, false);
  assert.throws(() => renderWatchPage(record, expired), /publication blocked/);
});
