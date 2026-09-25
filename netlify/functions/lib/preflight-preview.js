import { createHash } from "node:crypto";
import {
  auditRunKey,
  getEligibility,
  isReleaseReady,
} from "./actor-eligibility.js";
import { fetchPublicationImage } from "./publication-manifest.js";
import { isValidMediaReference, registerMediaBytes } from "./media-asset.js";

export const PREFLIGHT_PREVIEW_STORE = "vibe-atlas-preflight-previews";
export const PREFLIGHT_PREVIEW_PREFIX = "preflight-preview/v1/";

export const preflightPreviewKey = (actorId, vibeIdx, runId) =>
  `${PREFLIGHT_PREVIEW_PREFIX}${encodeURIComponent(actorId)}/${vibeIdx}/${encodeURIComponent(runId)}`;

function boardDigest(candidates) {
  return createHash("sha256").update(JSON.stringify(candidates.map(candidate => ({
    candidateId: candidate.candidateId,
    thumbnail: candidate.thumbnail,
    title: candidate.title || "",
    source: candidate.source || "",
  })))).digest("hex");
}

function associationId(actorId, vibeIdx, runId) {
  return `vibe-atlas:preflight-preview:${actorId}:${vibeIdx}:${runId}`;
}

function safeEditorialCopy(vibe, explicitCopy = "") {
  const candidates = [explicitCopy, vibe?.supportingCopy_en, vibe?.supportingCopy];
  return candidates.map(value => typeof value === "string" ? value.trim() : "")
    .find(value => value.length >= 40
      && value.length <= 1000
      && !hasUnsafeTitleUrl(value)
      && !/[<>]/.test(value)
      && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))
    || null;
}

function hasUnsafeTitleUrl(value) {
  return /(?:https?:\/\/|www\.)/i.test(value)
    || /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i.test(value);
}

async function approvedBoard({
  eligibilityStore,
  actor,
  vibeIdx,
  eligibilityReader = getEligibility,
}) {
  const approval = await eligibilityReader(eligibilityStore, actor, vibeIdx);
  if (!isReleaseReady(approval)) return null;
  const run = await eligibilityStore.get(auditRunKey(actor.id, vibeIdx, approval.runId), {
    type: "json",
    consistency: "strong",
  });
  if (!run || run.runId !== approval.runId) return null;
  const candidates = approval.publicationBoard?.candidates;
  if (!Array.isArray(candidates) || candidates.length !== 9
    || candidates.some(candidate => typeof candidate?.candidateId !== "string"
      || !candidate.candidateId
      || typeof candidate.thumbnail !== "string"
      || !candidate.thumbnail.startsWith("https://"))
    || new Set(candidates.map(candidate => candidate.candidateId)).size !== 9) return null;
  const digest = boardDigest(candidates);
  if (approval.publicationSource?.type !== "operator_rescue"
    && ![run.strongestEvent, run.strongestCompiled]
      .some(board => Array.isArray(board?.candidates)
        && boardDigest(board.candidates) === digest)) return null;
  return { approval, run, candidates, boardHash: digest };
}

function validReceipt(receipt, actorId, vibeIdx, runId, boardHash) {
  const id = associationId(actorId, vibeIdx, runId);
  return Boolean(
    receipt?.schemaVersion === 1
    && receipt.kind === "vibe-atlas-preflight-three-card-preview"
    && receipt.actorId === actorId
    && receipt.vibeIdx === vibeIdx
    && receipt.runId === runId
    && receipt.boardHash === boardHash
    && typeof receipt.copy === "string"
    && safeEditorialCopy({ supportingCopy_en: receipt.copy }) === receipt.copy
    && Array.isArray(receipt.cards)
    && receipt.cards.length === 3
    && receipt.cards.every((card, position) =>
      card.position === position
      && typeof card.title === "string"
      && isValidMediaReference(card.media, {
        type: "publication",
        id,
        itemId: `card-${position}`,
      })),
  );
}

export function publicPreflightPreview(receipt, actor, vibe) {
  if (!receipt) return null;
  return {
    kind: receipt.kind,
    vibeIdx: receipt.vibeIdx,
    actor: {
      id: actor.id,
      name: actor.name,
      nameEn: actor.shortName_en || actor.nameEn || actor.name,
    },
    vibe: {
      key: `${actor.id}:${receipt.vibeIdx}`,
      idx: receipt.vibeIdx,
      label: vibe.label || vibe.label_en || "",
      labelEn: vibe.label_en || vibe.label || "",
      emoji: vibe.emoji || null,
      copy: receipt.copy,
    },
    cards: receipt.cards.map(card => ({
      position: card.position,
      title: hasUnsafeTitleUrl(card.title) ? "" : card.title,
      thumbnailUrl: card.media.thumbnailUrl,
      deliveryUrl: card.media.deliveryUrl,
    })),
    publishedAt: receipt.publishedAt,
  };
}

/**
 * Materialization is intentionally an operator-only operation. It reads only
 * the currently approved board and freezes positions 0–2 for that run.
 */
export async function publishPreflightPreview({
  store,
  eligibilityStore,
  actor,
  vibeIdx,
  env = process.env,
  fetchImpl = fetch,
  resolveHost,
  eligibilityReader = getEligibility,
  imageFetcher = fetchPublicationImage,
  mediaRegistrar = registerMediaBytes,
  now = () => new Date().toISOString(),
  editorialCopy = "",
}) {
  const vibe = actor?.vibes?.[vibeIdx];
  if (!actor || !vibe) return null;
  const selected = await approvedBoard({ eligibilityStore, actor, vibeIdx, eligibilityReader });
  if (!selected) return null;
  const { approval, candidates, boardHash } = selected;
  const receiptKey = preflightPreviewKey(actor.id, vibeIdx, approval.runId);
  const existing = await store.get(receiptKey, { type: "json", consistency: "strong" });
  if (existing) {
    return validReceipt(existing, actor.id, vibeIdx, approval.runId, boardHash)
      ? existing
      : null;
  }
  const copy = safeEditorialCopy(vibe, editorialCopy);
  if (!copy) return null;

  const id = associationId(actor.id, vibeIdx, approval.runId);
  const cards = [];
  for (let position = 0; position < 3; position += 1) {
    const candidate = candidates[position];
    const image = await imageFetcher(candidate.thumbnail, fetchImpl, resolveHost);
    const media = await mediaRegistrar({
      bytes: image.bytes,
      contentType: image.contentType,
      association: { type: "publication", id, itemId: `card-${position}` },
      filename: `vibe-atlas-preview-${actor.id}-${vibeIdx}-${position + 1}`,
      idempotencyKey: `fandom-vibe-atlas-preview:${actor.id}:${vibeIdx}:${approval.runId}:${boardHash}:card-${position}`,
      metadata: {
        sourceType: "fandom-vibe-atlas-preflight-preview",
        seriesTags: ["Fandom", "Vibe Atlas", "Preflight Preview", `actor:${actor.id}`, `vibe:${vibeIdx}`],
        linkedPostIdentifiers: [`fandom/vibe-atlas/preflight-preview/${actor.id}/${vibeIdx}/${position}`],
        provenance: {
          actorId: actor.id,
          vibeIdx,
          runId: approval.runId,
          boardHash,
          candidateId: candidate.candidateId,
          sourceUrl: candidate.thumbnail,
        },
      },
      env,
      fetchImpl,
    });
    cards.push({
      position,
      title: typeof candidate.title === "string" && !hasUnsafeTitleUrl(candidate.title)
        ? candidate.title.slice(0, 500)
        : "",
      media,
    });
  }

  // Re-read the complete approval chain before committing the public receipt.
  const confirmed = await approvedBoard({ eligibilityStore, actor, vibeIdx, eligibilityReader });
  if (!confirmed || confirmed.approval.runId !== approval.runId || confirmed.boardHash !== boardHash) {
    return null;
  }
  const receipt = {
    schemaVersion: 1,
    kind: "vibe-atlas-preflight-three-card-preview",
    actorId: actor.id,
    vibeIdx,
    runId: approval.runId,
    boardHash,
    copy,
    cards,
    publishedAt: now(),
  };
  if (!validReceipt(receipt, actor.id, vibeIdx, approval.runId, boardHash)) return null;
  await store.setJSON(receiptKey, receipt, { onlyIfNew: true });
  const authoritative = await store.get(receiptKey, { type: "json", consistency: "strong" });
  return validReceipt(authoritative, actor.id, vibeIdx, approval.runId, boardHash)
    ? authoritative
    : null;
}

export async function resolvePublicPreflightPreview({
  store,
  eligibilityStore,
  actor,
  vibeIdx,
  eligibilityReader = getEligibility,
}) {
  const selected = await approvedBoard({ eligibilityStore, actor, vibeIdx, eligibilityReader });
  if (!selected) return null;
  const receipt = await store.get(
    preflightPreviewKey(actor.id, vibeIdx, selected.approval.runId),
    { type: "json", consistency: "strong" },
  );
  if (!validReceipt(receipt, actor.id, vibeIdx, selected.approval.runId, selected.boardHash)) return null;
  // A second strong approval read closes revocation/supersession between lookup
  // and projection; the public endpoint never exposes stale-run receipts.
  const confirmed = await approvedBoard({ eligibilityStore, actor, vibeIdx, eligibilityReader });
  if (!confirmed || confirmed.approval.runId !== selected.approval.runId
    || confirmed.boardHash !== selected.boardHash) return null;
  return publicPreflightPreview(receipt, actor, actor.vibes[vibeIdx]);
}

export async function preflightPreviewDirectory({
  store,
  eligibilityStore,
  actor,
  eligibilityReader = getEligibility,
}) {
  if (!actor) return { kind: "vibe-atlas-preflight-preview-directory", previews: [] };
  const entries = [];
  for (let vibeIdx = 0; vibeIdx < (actor.vibes || []).length; vibeIdx += 1) {
    const preview = await resolvePublicPreflightPreview({
      store, eligibilityStore, actor, vibeIdx, eligibilityReader,
    });
    if (preview) entries.push(preview);
  }
  entries.sort((left, right) =>
    left.vibe.idx - right.vibe.idx);
  return { kind: "vibe-atlas-preflight-preview-directory", previews: entries };
}