import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { PUBLIC_ORIGIN } from "../shared/public-routes.js";
import { DEFAULT_MEDIA_URL } from "../netlify/functions/lib/media-asset.js";
import { assertIndexableRecord } from "./check-public-records.js";

const EDITION_PATH = /^\/vibe-atlas\/editions\/\d{4}-\d{2}-\d{2}\/[a-z0-9-]+\/$/;
const ACTOR_PATH = /^\/vibe-atlas\/actors\/[a-z0-9-]+\/$/;
const MEDIA_ORIGINS = new Set([
  new URL(DEFAULT_MEDIA_URL).origin,
  "https://images.xhs.justlikekatie.com",
]);
const IMAGE_COUNT = 9;
const IMAGE_SIGNATURE_BYTES = 16;
// Weekly rotation: at most 36 thumbnails, 2 MiB each, two concurrent downloads.
export const THUMBNAIL_AUDIT_LIMIT = 36;
export const THUMBNAIL_AUDIT_MAX_BYTES = 2 * 1024 * 1024;
const AUDIT_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const THUMBNAIL_DIGEST_PATH = /^\/images\/sha256\/(?:(?<shardA>[a-f0-9]{2})\/(?<shardB>[a-f0-9]{2})\/)?(?<digest>[a-f0-9]{64})\.(?:jpg|jpeg|png|webp)$/i;

function thumbnailAddressDigest(url) {
  const match = new URL(url).pathname.match(THUMBNAIL_DIGEST_PATH);
  assert.ok(match, `Published Archive thumbnail has no SHA-256 address: ${url}`);
  const { shardA, shardB, digest } = match.groups;
  assert.ok(!shardA || `${shardA}${shardB}`.toLowerCase() === digest.slice(0, 4).toLowerCase(),
    `Published Archive thumbnail has mismatched SHA-256 shards: ${url}`);
  return digest.toLowerCase();
}

function hasImageSignature(bytes, type) {
  if (type === "jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      && bytes[3] >= 0xc0 && bytes[3] <= 0xfe && bytes[3] !== 0xd8 && bytes[3] !== 0xd9;
  }
  if (type === "png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]
      .every((byte, index) => bytes[index] === byte);
  }
  // RIFF size is little-endian and includes "WEBP" plus the image chunk.
  const riffSize = bytes[4] + bytes[5] * 256 + bytes[6] * 65536 + bytes[7] * 16777216;
  return [0x52, 0x49, 0x46, 0x46].every((byte, index) => bytes[index] === byte)
    && riffSize >= 12
    && [0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38].every((byte, index) => bytes[8 + index] === byte)
    && [0x20, 0x4c, 0x58].includes(bytes[15]);
}

async function get(url, fetchImpl) {
  const result = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(10000) });
  assert.equal(result.status, 200, `${url} returned HTTP ${result.status}`);
  return result;
}

function editionImages(html, recordUrl) {
  // Only the approved grid is a publication asset; other links in the
  // document (including search provenance and social metadata) are not.
  const grid = html.match(/<section\b[^>]*\baria-label="Approved preview grid"[^>]*>([\s\S]*?)<\/section>/i)?.[1];
  assert.ok(grid, `Archive edition has no approved preview grid: ${recordUrl}`);
  const tags = [...grid.matchAll(/<img\b[^>]*>/gi)].map(match => match[0]);
  assert.equal(tags.length, IMAGE_COUNT, `Archive edition does not show nine images: ${recordUrl}`);
  function mediaUrl(escaped, kind) {
    assert.ok(escaped, `Archive edition has a ${kind} without a URL: ${recordUrl}`);
    const value = escaped.replaceAll("&amp;", "&");
    const url = new URL(value, recordUrl);
    assert.ok(
      url.protocol === "https:" && MEDIA_ORIGINS.has(url.origin)
        && url.pathname.startsWith("/images/sha256/")
        && !url.search && !url.hash && !url.username && !url.password,
      `Archive edition ${kind} is not a published MEDIA URL: ${recordUrl} (${value})`,
    );
    return url.href;
  }
  const thumbnails = tags.map(tag => mediaUrl(tag.match(/\bsrc="([^"]*)"/i)?.[1], "thumbnail"));
  const fullSize = tags.map(tag => mediaUrl(tag.match(/\bdata-media-delivery-url="([^"]*)"/i)?.[1], "full-size image"));
  assert.equal(new Set(thumbnails).size, IMAGE_COUNT, `Archive edition does not show nine distinct images: ${recordUrl}`);
  assert.equal(new Set(fullSize).size, IMAGE_COUNT, `Archive edition does not show nine distinct full-size images: ${recordUrl}`);
  return { thumbnails, all: [...thumbnails, ...fullSize] };
}

async function checkImage(url, fetchImpl) {
  const response = await get(url, fetchImpl);
  const type = response.headers.get("content-type")?.match(/^image\/(png|jpeg|webp)(?:\s*;|$)/i)?.[1]?.toLowerCase();
  assert.ok(type, `Archive image is not an image: ${url}`);
  assert.notEqual(response.headers.get("content-length"), "0", `Archive image is empty: ${url}`);
  assert.ok(response.body, `Archive image is empty: ${url}`);
  const reader = response.body.getReader();
  try {
    const header = new Uint8Array(IMAGE_SIGNATURE_BYTES);
    let length = 0;
    while (length < header.length) {
      const { done, value } = await reader.read();
      if (done) break;
      const count = Math.min(value.byteLength, header.length - length);
      header.set(value.subarray(0, count), length);
      length += count;
    }
    assert.ok(length > 0, `Archive image is empty: ${url}`);
    assert.ok(length === header.length && hasImageSignature(header, type), `Archive image has an invalid ${type} signature: ${url}`);
  } finally {
    await reader.cancel();
  }
}

async function collectArchiveRecords(fetchImpl, origin) {
  const sitemap = await get(`${origin}/sitemap.xml`, fetchImpl);
  assert.match(sitemap.headers.get("content-type") ?? "", /^(?:application|text)\/xml\b/i, "Production sitemap is not XML");
  const inventoryStatus = sitemap.headers.get("x-public-sitemap-inventory");
  assert.notEqual(
    inventoryStatus,
    "publication-history-mismatch",
    "Previously released editions are missing from the public publication inventory",
  );
  assert.equal(
    inventoryStatus,
    "complete",
    `Production sitemap inventory is ${inventoryStatus ?? "unverified"}; Archive release comparison has incomplete evidence`,
  );
  const xml = await sitemap.text();
  assert.equal(XMLValidator.validate(xml), true, "Production sitemap is not valid XML");
  const entries = new XMLParser().parse(xml)?.urlset?.url;
  assert.ok(entries, "Production sitemap has no URLs");
  const listed = new Set((Array.isArray(entries) ? entries : [entries]).map(entry => {
    const url = new URL(entry.loc);
    assert.equal(url.origin, origin, "Production sitemap lists a URL on another origin");
    return url.href;
  }));
  // The sitemap is generated from indexable publication manifests, whereas
  // historical Archive entries may intentionally have no public record.
  // Compare only canonical edition routes, never arbitrary sitemap URLs.
  const publishedEditions = [...listed].filter(href => {
    const url = new URL(href);
    return EDITION_PATH.test(url.pathname) && !url.search && !url.hash
      && !url.username && !url.password;
  });
  const advertised = new Map();
  const advertisedEditions = new Set();
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
      advertisedEditions.add(`${origin}${record.editionPath}`);
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
  for (const url of publishedEditions) {
    assert.ok(advertisedEditions.has(url), `Public edition is missing from the Archive listing: ${url}`);
  }
  let next = 0;
  const urls = [...advertised.keys()];
  const imageUrls = new Set();
  const thumbnails = new Set();
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, async () => {
    while (next < urls.length) {
      const url = urls[next++];
      const result = await get(url, fetchImpl);
      const html = await result.text();
      assertIndexableRecord(result, html, url, "Archive");
      if (EDITION_PATH.test(advertised.get(url))) {
        const images = editionImages(html, url);
        for (const imageUrl of images.all) imageUrls.add(imageUrl);
        for (const thumbnail of images.thumbnails) thumbnails.add(thumbnail);
      }
    }
  }));
  return { advertisedRecords: urls.length, imageUrls: [...imageUrls], thumbnails: [...thumbnails] };
}

export async function checkArchiveRecords(fetchImpl = fetch, origin = PUBLIC_ORIGIN) {
  const { advertisedRecords, imageUrls: images } = await collectArchiveRecords(fetchImpl, origin);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, images.length) }, async () => {
    while (next < images.length) await checkImage(images[next++], fetchImpl);
  }));
  return { advertisedRecords };
}

async function auditThumbnail(url, fetchImpl) {
  const expected = thumbnailAddressDigest(url);
  const response = await get(url, fetchImpl);
  const type = response.headers.get("content-type")?.match(/^image\/(png|jpeg|webp)(?:\s*;|$)/i)?.[1]?.toLowerCase();
  assert.ok(type, `Archive thumbnail is not an image: ${url}`);
  const extension = new URL(url).pathname.split(".").at(-1).toLowerCase();
  assert.ok(type === extension || (type === "jpeg" && extension === "jpg"),
    `Archive thumbnail MIME type differs from its address: ${url}`);
  const claimedLength = response.headers.get("content-length");
  if (claimedLength !== null) {
    assert.ok(/^\d+$/.test(claimedLength) && Number(claimedLength) <= THUMBNAIL_AUDIT_MAX_BYTES,
      `Archive thumbnail exceeds ${THUMBNAIL_AUDIT_MAX_BYTES} byte audit limit: ${url}`);
  }
  assert.ok(response.body, `Archive thumbnail is empty: ${url}`);
  const reader = response.body.getReader();
  const digest = createHash("sha256");
  let size = 0;
  const header = new Uint8Array(IMAGE_SIGNATURE_BYTES);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      assert.ok(size <= THUMBNAIL_AUDIT_MAX_BYTES,
        `Archive thumbnail exceeds ${THUMBNAIL_AUDIT_MAX_BYTES} byte audit limit: ${url}`);
      if (size - value.byteLength < header.length) {
        header.set(value.subarray(0, Math.min(value.byteLength, header.length - (size - value.byteLength))),
          size - value.byteLength);
      }
      digest.update(value);
    }
    assert.ok(size >= header.length && hasImageSignature(header, type),
      `Archive thumbnail has an invalid ${type} signature: ${url}`);
    assert.equal(digest.digest("hex"), expected, `Archive thumbnail SHA-256 mismatch (body truncated or changed): ${url}`);
  } finally {
    await reader.cancel();
  }
}

export async function auditArchiveThumbnails(fetchImpl = fetch, origin = PUBLIC_ORIGIN, now = Date.now()) {
  const { thumbnails } = await collectArchiveRecords(fetchImpl, origin);
  const sorted = thumbnails.sort();
  // Each week advances by one full batch; modulo the count eventually visits
  // every thumbnail, including when the inventory is larger than one batch.
  const start = sorted.length ? (Math.floor(now / AUDIT_WEEK_MS) * THUMBNAIL_AUDIT_LIMIT) % sorted.length : 0;
  const selected = Array.from({ length: Math.min(THUMBNAIL_AUDIT_LIMIT, sorted.length) },
    (_, index) => sorted[(start + index) % sorted.length]);
  // Fail on malformed addresses even if they are outside this week's byte budget.
  for (const url of sorted) {
    thumbnailAddressDigest(url);
  }
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(2, selected.length) }, async () => {
    while (next < selected.length) await auditThumbnail(selected[next++], fetchImpl);
  }));
  return { publishedThumbnails: sorted.length, auditedThumbnails: selected.length, maxBytesPerThumbnail: THUMBNAIL_AUDIT_MAX_BYTES };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(process.argv.includes("--audit-thumbnails")
    ? await auditArchiveThumbnails()
    : await checkArchiveRecords());
}
