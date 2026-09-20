export function publicManifest({
  date = "2026-09-03",
  actorId = "liu-xueyi",
  completeEditorial = true,
} = {}) {
  return {
    schemaVersion: 1,
    manifestVersion: "v1",
    manifestId: `manifest-${actorId}-${date}`,
    idempotencyKey: `vibe-atlas:daily-drop:${date}`,
    kind: "vibe-atlas-daily-drop",
    publicationDate: date,
    publishedAt: `${date}T04:00:00.000Z`,
    boardHash: "a".repeat(64),
    actor: { id: actorId, name: "刘学义", nameEn: "Liu Xueyi", accentColor: "#8d2638" },
    vibe: {
      key: `${actorId}:0`,
      idx: 0,
      label: "破碎感美人",
      labelEn: "Professionally Devastated",
      emoji: "🌙",
      subtitle: "为爱受苦",
      subtitleEn: "Born to suffer beautifully.",
      supportingCopy: "",
      supportingCopyEn: completeEditorial
        ? "An original editorial record of restrained, moonlit melancholy and the beauty of a character carrying grief with composure."
        : "",
      generationPrompt: "PRIVATE retrieval generation prompt",
    },
    heroPosition: 4,
    cardCount: 9,
    retention: { policy: "permanent", deleteWithCollection: false },
    provenance: {
      sourceCandidateIds: Array.from({ length: 9 }, (_, i) => `candidate-${i}`),
      diagnostics: { confidence: 0.99, query: "PRIVATE search spell" },
    },
    cards: Array.from({ length: 9 }, (_, position) => ({
      position,
      candidateId: `candidate-${position}`,
      title: `Frame ${position}`,
      source: "publisher.example",
      link: `https://publisher.example/${position}`,
      sourceUrl: `https://images.example/private-${position}.jpg`,
      query: "PRIVATE query",
      media: {
        schemaVersion: 1,
        assetId: `00000000-0000-4000-8000-${String(position + 1).padStart(12, "0")}`,
        deliveryUrl: `https://media.example/assets/${actorId}-${date}-${position}.jpg`,
        thumbnailUrl: `https://media.example/thumbs/${actorId}-${date}-${position}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 100 + position,
        checksum: String(position).padStart(64, "0"),
        dimensions: { width: 1200, height: 1200 },
        association: {
          type: "publication",
          id: `vibe-atlas:daily-drop:${date}`,
          itemId: `card-${position}`,
        },
      },
    })),
  };
}

export function completeCatalog(date = "2026-09-03") {
  return {
    schemaVersion: 1,
    catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog",
    dates: [date],
  };
}

export function manifestStore(manifests) {
  const catalog = completeCatalog(manifests[0]?.publicationDate);
  const byKey = new Map([
    ["vibeAtlas:grid-manifest-catalog:v1:dates", catalog],
    ...manifests.map(manifest => [
      `vibeAtlas:grid-manifest:v1:${manifest.publicationDate}`,
      manifest,
    ]),
  ]);
  return {
    async get(key) { return byKey.get(key) ?? null; },
    async list({ prefix } = {}) {
      return {
        blobs: [...byKey.keys()]
          .filter(key => !prefix || key.startsWith(prefix))
          .map(key => ({ key })),
      };
    },
  };
}

export function catalogStore(catalog, manifests = []) {
  const byKey = new Map([
    ["vibeAtlas:grid-manifest-catalog:v1:dates", catalog],
    ...manifests.map(manifest => [
      `vibeAtlas:grid-manifest:v1:${manifest.publicationDate}`,
      manifest,
    ]),
  ]);
  return {
    async get(key) { return byKey.get(key) ?? null; },
    async list({ prefix } = {}) {
      return {
        blobs: [...byKey.keys()]
          .filter(key => !prefix || key.startsWith(prefix))
          .map(key => ({ key })),
      };
    },
  };
}