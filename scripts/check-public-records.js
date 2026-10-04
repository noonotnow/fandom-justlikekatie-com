import assert from "node:assert/strict";
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { PUBLIC_ORIGIN } from "../shared/public-routes.js";

export { PUBLIC_ORIGIN };
const ROUTES = {
  actor: /^\/vibe-atlas\/actors\/[^/]+\/$/,
  edition: /^\/vibe-atlas\/editions\/\d{4}-\d{2}-\d{2}\/[^/]+\/$/,
  releasedActor: /^\/vibe-atlas\/packs\/[^/]+\/$/,
  releasedPack: /^\/vibe-atlas\/packs\/[^/]+\/[^/]+\/$/,
};
const INVENTORY_STATUSES = new Set([
  "complete", "publication-incomplete", "release-history-unavailable",
  "publication-history-mismatch", "release-catalog-incomplete", "unavailable",
]);

export function publicInventoryStatus(response) {
  const status = response.headers.get("x-public-sitemap-inventory");
  return INVENTORY_STATUSES.has(status) ? status : "unverified";
}

// Only public sitemap headers are inspected; private Archive and Collector data
// are deliberately outside this health check.
export async function checkSitemapInventory(fetchImpl = fetch, origin = PUBLIC_ORIGIN) {
  const response = await get(`${origin}/sitemap.xml`, fetchImpl);
  assert.match(response.headers.get("content-type") ?? "", /^(?:application|text)\/xml\b/i, "Production sitemap is not XML");
  return publicInventoryStatus(response);
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"))?.slice(1).find(value => value !== undefined);
}

function headTags(html, tagName) {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] ?? "";
  return [...head.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi"))].map(match => match[0]);
}

export function assertIndexableRecord(response, html, url, kind) {
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i, `${kind} record did not return HTML: ${url}`);
  assert.doesNotMatch(response.headers.get("x-robots-tag") ?? "", /\bnoindex\b/i, `${kind} record is blocked by X-Robots-Tag: ${url}`);
  assert.match(html, /<!doctype html>/i, `${kind} record is not an HTML document: ${url}`);
  const robots = headTags(html, "meta").filter(tag => attribute(tag, "name")?.toLowerCase() === "robots");
  assert.equal(robots.length, 1, `${kind} record must have one robots directive: ${url}`);
  assert.match(attribute(robots[0], "content") ?? "", /(?:^|,)\s*index\s*(?:,|$)/i, `${kind} record is not indexable: ${url}`);
  assert.doesNotMatch(attribute(robots[0], "content") ?? "", /\bnoindex\b/i, `${kind} record is noindex: ${url}`);
  const canonicals = headTags(html, "link").filter(tag => attribute(tag, "rel")?.toLowerCase() === "canonical");
  assert.equal(canonicals.length, 1, `${kind} record must have one canonical URL: ${url}`);
  assert.equal(attribute(canonicals[0], "href"), url, `${kind} record canonical differs from its sitemap URL: ${url}`);
}

function listedRecordUrls(xml, origin) {
  assert.equal(XMLValidator.validate(xml), true, "Production sitemap is not valid XML");
  const parsed = new XMLParser().parse(xml);
  assert.ok(Object.hasOwn(parsed, "urlset"), "Production sitemap has no urlset");
  const entries = parsed.urlset?.url;
  assert.ok(entries !== undefined || parsed.urlset === "", "Production sitemap has no record URLs");
  const urls = (entries === undefined ? [] : Array.isArray(entries) ? entries : [entries]).map(entry => {
    const loc = entry?.loc;
    assert.equal(typeof loc, "string", "Production sitemap has a URL without a location");
    const url = new URL(loc);
    // Never follow arbitrary locations supplied by a compromised or malformed sitemap.
    assert.equal(url.origin, origin, "Production sitemap lists a URL on another origin");
    return url;
  });
  const recordsByKind = Object.fromEntries(Object.entries(ROUTES).map(([kind, pattern]) => {
    const records = urls.filter(item => pattern.test(item.pathname) && !item.search && !item.hash);
    return [kind, [...new Map(records.map(url => [url.href, url])).values()]];
  }));
  // An empty publication inventory is valid; a one-sided actor/edition listing is not.
  assert.equal(
    recordsByKind.actor.length > 0,
    recordsByKind.edition.length > 0,
    "Production sitemap lists actors and editions inconsistently",
  );
  const editionActorPaths = new Set(recordsByKind.edition.map(url =>
    `/vibe-atlas/actors/${url.pathname.split("/")[4]}/`,
  ));
  for (const actor of recordsByKind.actor) {
    assert.ok(editionActorPaths.has(actor.pathname), `Production sitemap has no edition for actor ${actor.href}`);
  }
  // The public sitemap derives both released-pack groups from the same indexable pack catalog.
  // An empty catalog is valid; a partial one is not.
  assert.equal(
    recordsByKind.releasedActor.length > 0,
    recordsByKind.releasedPack.length > 0,
    "Production sitemap lists released-pack actors and packs inconsistently",
  );
  const actorPaths = new Set(recordsByKind.releasedActor.map(url => url.pathname));
  for (const pack of recordsByKind.releasedPack) {
    const actorPath = pack.pathname.replace(/[^/]+\/$/, "");
    assert.ok(actorPaths.has(actorPath), `Production sitemap has no released-pack actor for ${pack.href}`);
  }
  const packActorPaths = new Set(recordsByKind.releasedPack.map(url => url.pathname.replace(/[^/]+\/$/, "")));
  for (const actor of recordsByKind.releasedActor) {
    assert.ok(packActorPaths.has(actor.pathname), `Production sitemap has no released pack for ${actor.href}`);
  }
  return recordsByKind;
}

async function get(responseUrl, fetchImpl) {
  const response = await fetchImpl(responseUrl, {
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
    headers: { Accept: "text/html, application/xml" },
  });
  assert.equal(response.status, 200, `${responseUrl} returned HTTP ${response.status}`);
  return response;
}

export async function checkPublicRecords(fetchImpl = fetch, origin = PUBLIC_ORIGIN) {
  const sitemapUrl = `${origin}/sitemap.xml`;
  const sitemap = await get(sitemapUrl, fetchImpl);
  assert.match(sitemap.headers.get("content-type") ?? "", /^(?:application|text)\/xml\b/i, "Production sitemap is not XML");
  assert.equal(publicInventoryStatus(sitemap), "complete", "Production sitemap inventory is missing or incomplete");
  const records = listedRecordUrls(await sitemap.text(), origin);
  const routes = Object.entries(records).flatMap(([kind, urls]) => urls.map(url => ({ kind, url })));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, routes.length) }, async () => {
    while (next < routes.length) {
      const { kind, url } = routes[next++];
      const response = await get(url.href, fetchImpl);
      assertIndexableRecord(response, await response.text(), url.href, kind);
      console.log(`Verified public ${kind} record: ${url.href}`);
    }
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--inventory-only")) {
    let status = "unverified";
    try {
      status = await checkSitemapInventory();
    } finally {
      // Only a fixed status token crosses into the notification step.
      if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `status=${status}\n`);
    }
    assert.equal(status, "complete", `Production sitemap inventory is ${status}; reconcile public release receipts`);
    console.log("Production sitemap inventory is complete (an empty catalog is valid).");
  } else {
    await checkPublicRecords();
  }
}