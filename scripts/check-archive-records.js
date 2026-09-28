import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { PUBLIC_ORIGIN } from "../shared/public-routes.js";
import { assertIndexableRecord } from "./check-public-records.js";

const EDITION_PATH = /^\/vibe-atlas\/editions\/\d{4}-\d{2}-\d{2}\/[a-z0-9-]+\/$/;
const ACTOR_PATH = /^\/vibe-atlas\/actors\/[a-z0-9-]+\/$/;

async function get(url, fetchImpl) {
  const result = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(10000) });
  assert.equal(result.status, 200, `${url} returned HTTP ${result.status}`);
  return result;
}

export async function checkArchiveRecords(fetchImpl = fetch, origin = PUBLIC_ORIGIN) {
  const sitemap = await get(`${origin}/sitemap.xml`, fetchImpl);
  assert.match(sitemap.headers.get("content-type") ?? "", /^(?:application|text)\/xml\b/i, "Production sitemap is not XML");
  const xml = await sitemap.text();
  assert.equal(XMLValidator.validate(xml), true, "Production sitemap is not valid XML");
  const entries = new XMLParser().parse(xml)?.urlset?.url;
  assert.ok(entries, "Production sitemap has no URLs");
  const listed = new Set((Array.isArray(entries) ? entries : [entries]).map(entry => {
    const url = new URL(entry.loc);
    assert.equal(url.origin, origin, "Production sitemap lists a URL on another origin");
    return url.href;
  }));
  const advertised = new Map();
  const seenCursors = new Set();
  let cursor = null;
  do {
    const path = `/.netlify/functions/star-of-day?archive=1${cursor ? `&cursor=${cursor}` : ""}`;
    const page = await (await get(`${origin}${path}`, fetchImpl)).json();
    assert.ok(Array.isArray(page.editions) && page.page && typeof page.page.hasMore === "boolean", "Archive returned an invalid page");
    for (const edition of page.editions) {
      const record = edition.publicRecord;
      if (!record) continue;
      assert.match(record.editionPath, EDITION_PATH, "Archive advertised an invalid edition path");
      assert.match(record.actorPath, ACTOR_PATH, "Archive advertised an invalid actor path");
      assert.equal(record.editionPath.split("/")[3], edition.date, "Archive edition date differs from its record");
      for (const recordPath of [record.actorPath, record.editionPath]) {
        const url = `${origin}${recordPath}`;
        assert.ok(listed.has(url), `Archive advertises a record absent from the sitemap: ${url}`);
        advertised.set(url, recordPath);
      }
    }
    cursor = page.page.hasMore ? page.page.nextCursor : null;
    if (page.page.hasMore) {
      assert.match(cursor, /^\d{4}-\d{2}-\d{2}$/, "Archive returned an invalid cursor");
      assert.ok(!seenCursors.has(cursor), "Archive pagination repeated a cursor");
      seenCursors.add(cursor);
    }
  } while (cursor);
  let next = 0;
  const urls = [...advertised.keys()];
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, async () => {
    while (next < urls.length) {
      const url = urls[next++];
      const result = await get(url, fetchImpl);
      assertIndexableRecord(result, await result.text(), url, "Archive");
    }
  }));
  return { advertisedRecords: urls.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await checkArchiveRecords());
}