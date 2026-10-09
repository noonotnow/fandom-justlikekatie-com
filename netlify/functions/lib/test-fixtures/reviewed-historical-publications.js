import { readFile } from "node:fs/promises";

// Fixed public evidence captured against the independently reviewed pins.
// Tests must never fetch or mint production approvals.
export const reviewedEvidence = JSON.parse(await readFile(
  new URL("./reviewed-historical-publications.json", import.meta.url),
  "utf8",
));

export function manifestFromEvidence(evidence) {
  const snapshot = structuredClone(evidence);
  const sourceCandidateIds = snapshot.cards.map(card => `fixture-${card.position}`);
  return {
    ...snapshot,
    schemaVersion: 1,
    manifestVersion: "v1",
    manifestId: "historical-test-manifest",
    idempotencyKey: `vibe-atlas:daily-drop:${snapshot.publicationDate}`,
    kind: "vibe-atlas-daily-drop",
    boardHash: "a".repeat(64),
    actor: { ...snapshot.actor, accentColor: "#e8c87a" },
    heroPosition: 4,
    cardCount: 9,
    retention: { policy: "permanent", deleteWithCollection: false },
    provenance: { sourceCandidateIds },
    cards: snapshot.cards.map(card => ({
      ...card,
      candidateId: sourceCandidateIds[card.position],
      title: `Frame ${card.position}`,
      source: "fixture",
      sourceUrl: `https://example.com/frame-${card.position}.jpg`,
      link: `https://example.com/frame-${card.position}`,
    })),
  };
}
