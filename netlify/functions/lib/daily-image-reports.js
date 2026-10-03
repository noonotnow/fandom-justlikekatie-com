import { createHash } from "node:crypto";
import { readDailyAcquisitionManifest } from "./daily-card-acquisition.js";
import { publicArchiveImageId } from "./public-archive-inventory.js";
import { getShanghaiDateString } from "./date-seed.js";
import { auditMisprintKey, auditMisprintDecisionKey } from "./actor-eligibility.js";

const CATALOG_KEY = "vibeAtlas:misprint-receipt-catalog:v1";
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const read = (store, key) => store.get(key, { type: "json", consistency: "strong" });

export function dailyReportProjection(receipt) {
  return {
    receiptId: receipt.receiptId,
    status: receipt.status === "active" ? "approved" : receipt.status,
    reason: receipt.reason,
    note: receipt.note,
    actualIdentity: receipt.actualIdentity,
    date: receipt.publication?.date,
    imageId: receipt.publication?.imageId,
  };
}

/** Read only the two deterministic append-only decisions for this receipt. */
export async function effectiveReport(store, receipt, applyDecisions) {
  const decisions = await Promise.all(["review", "retraction"].map(kind =>
    read(store, auditMisprintDecisionKey(
      receipt.actorId, receipt.vibeIdx, receipt.correctionScope, receipt.receiptId,
      hash({ sourceReceiptId: receipt.receiptId, kind }),
    ))));
  return applyDecisions(receipt, decisions.filter(Boolean));
}

export async function resolveDailyReport(publicationStore, input, now) {
  if (typeof input.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)
    || !Number.isFinite(Date.parse(`${input.date}T00:00:00Z`))
    || new Date(`${input.date}T00:00:00Z`).toISOString().slice(0, 10) !== input.date
    || input.date > getShanghaiDateString(now())
    || typeof input.imageId !== "string" || !input.imageId || input.imageId.length > 2048) {
    fail(400, "A valid public edition date and image identity are required.");
  }
  const found = await readDailyAcquisitionManifest(publicationStore, input.date);
  if (found.status === "unavailable") fail(503, "The published image could not be verified. Please retry.");
  if (found.status !== "available") fail(404, "That published Daily Drop is not available.");
  const manifest = found.manifest;
  // Only identities actually delivered to a public reader qualify, never private candidate ids.
  const card = manifest.cards.find(card => [
    publicArchiveImageId(manifest, card), card.media.thumbnailUrl, card.media.deliveryUrl,
  ].includes(input.imageId));
  if (!card) fail(404, "That image is not part of the public Daily Drop.");
  return { manifest, card };
}

function identityFor(manifest, card, principal, reason) {
  return hash({
    kind: "daily-image-report", boardHash: manifest.boardHash,
    date: manifest.publicationDate, position: card.position, principal, reason,
  });
}

/** Atomic fixed slots impose a strict daily bound even across concurrent requests. */
export async function reserveDailyReport(store, principal, receiptId, now, limit = 20) {
  const prefix = `daily-report-quota/${hash(principal)}/${getShanghaiDateString(now())}/`;
  for (let slot = 0; slot < limit; slot += 1) {
    const key = `${prefix}${slot}`;
    const existing = await read(store, key);
    if (existing?.receiptId === receiptId) return;
    if (existing) continue;
    const write = await store.setJSON(key, { receiptId }, { onlyIfNew: true });
    if (write?.modified !== false) return;
    if ((await read(store, key))?.receiptId === receiptId) return;
  }
  fail(429, "The daily report limit has been reached. Please try again tomorrow.");
}

export async function submitDailyReport({
  store, publicationStore, input, principal, reasons, actorPacks, now,
  ensureCatalog, applyDecisions,
}) {
  if (!input || Object.keys(input).some(key =>
    !["action", "date", "imageId", "reason", "actualIdentity", "note"].includes(key))) {
    fail(400, "Only the published image identity and report details are accepted.");
  }
  const reason = reasons.get(input.reason);
  if (!reason) fail(400, "Choose one of the listed Misprint reasons.");
  for (const [key, max] of [["actualIdentity", 200], ["note", 1000]]) {
    if (input[key] !== undefined && (typeof input[key] !== "string" || input[key].length > max)) {
      fail(400, "Report details exceed the allowed length.");
    }
  }
  const { manifest, card } = await resolveDailyReport(publicationStore, input, now);
  const actor = actorPacks.find(actor => actor.id === manifest.actor.id);
  // Published vibe keys use actorId:index; never infer pairing from client labels.
  const index = manifest.vibe.idx;
  if (!actor || !Number.isInteger(index) || index < 0
    || !actor.vibes?.[index]
    || manifest.vibe.key !== `${actor.id}:${index}`) {
    fail(404, "The published actor and vibe could not be resolved.");
  }
  const receiptId = identityFor(manifest, card, principal, input.reason);
  const key = auditMisprintKey(actor.id, index, reason.correctionScope, receiptId);
  const existing = await read(store, key);
  // A verified public MEDIA URL is an allowed alias. Acknowledge the submitted
  // alias while retaining the canonical image id in frozen server provenance.
  const project = receipt => ({ ...dailyReportProjection(receipt), imageId: input.imageId });
  if (existing) return project(await effectiveReport(store, existing, applyDecisions));
  await reserveDailyReport(store, principal, receiptId, now);
  const receipt = {
    schemaVersion: 1, receiptId, status: "pending_review", action: "report_daily_image",
    actorId: actor.id, actorName: manifest.actor.name || manifest.actor.nameEn || actor.name,
    vibeIdx: index, vibeKey: manifest.vibe.key,
    vibeLabel: manifest.vibe.labelEn || manifest.vibe.label,
    candidateId: card.candidateId, reason: input.reason, ...reason,
    actualIdentity: input.actualIdentity?.trim() || null, note: input.note?.trim() || "",
    candidate: {
      candidateId: card.candidateId, query: card.query || card.batchKey || "",
      title: card.title, source: card.source, link: card.link,
      thumbnail: card.sourceUrl, imageDigest: card.media.checksum,
      // Exact immutable public image for operator review, not a changing source thumbnail.
      publishedThumbnail: card.media.thumbnailUrl || card.media.deliveryUrl,
    },
    publication: {
      date: manifest.publicationDate, imageId: publicArchiveImageId(manifest, card),
      manifestId: manifest.manifestId, boardHash: manifest.boardHash, position: card.position,
    },
    markedAt: now().toISOString(), markedBy: principal,
  };
  await ensureCatalog(store, key, now);
  await store.setJSON(key, receipt, { onlyIfNew: true });
  const authoritative = await read(store, key);
  if (!authoritative) fail(503, "The report could not be confirmed. Please retry.");
  return project(await effectiveReport(store, authoritative, applyDecisions));
}

export async function ownDailyReports({ store, publicationStore, input, principal, reasons, now, applyDecisions }) {
  const { manifest, card } = await resolveDailyReport(publicationStore, input, now);
  const reports = await Promise.all([...reasons].map(async ([reasonCode, reason]) => {
    const id = identityFor(manifest, card, principal, reasonCode);
    const receipt = await read(store, auditMisprintKey(
      manifest.actor.id, manifest.vibe.idx, reason.correctionScope, id,
    ));
    if (!receipt || receipt.markedBy !== principal) return null;
    return {
      ...dailyReportProjection(await effectiveReport(store, receipt, applyDecisions)),
      imageId: input.imageId,
    };
  }));
  return reports.filter(Boolean);
}

export async function reportQueue(store, params, applyDecisions) {
  const limit = params.has("limit") ? Number(params.get("limit")) : 20;
  const status = params.get("status") || "pending_review";
  const cursor = params.get("cursor") || "";
  if (!Number.isInteger(limit) || limit < 1 || limit > 50
    || !["pending_review", "active"].includes(status)
    || cursor.length > 512 || (cursor && !cursor.startsWith("misprints/"))) {
    fail(400, "Invalid report queue page.");
  }
  const catalog = await read(store, CATALOG_KEY);
  if (catalog && (catalog.kind !== "vibe-atlas-misprint-receipt-catalog" || !Array.isArray(catalog.keys))) {
    fail(503, "The correction catalog is unavailable.");
  }
  const keys = (catalog?.keys || []).filter(key => key.startsWith("misprints/") && key > cursor).sort();
  // Scan at most one bounded page; an empty filtered page can still have a next cursor.
  const page = keys.slice(0, limit);
  const reports = (await Promise.all(page.map(async key => {
    const receipt = await read(store, key);
    return receipt ? effectiveReport(store, receipt, applyDecisions) : null;
  }))).filter(receipt => receipt?.status === status);
  return { reports, nextCursor: keys.length > limit ? page.at(-1) : null };
}