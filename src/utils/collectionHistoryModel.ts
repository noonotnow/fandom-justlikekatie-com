import type { StarOfDayData } from '../hooks/useStarOfDay';
import type { CardRecord, GridRecord } from './collectionDB';
import type { PlanRecord } from './planDB';

export function collectionGridFromStar(
  data: StarOfDayData,
  sourceRoute = currentRoute(),
  savedAt = new Date().toISOString(),
): GridRecord {
  const batches = data.displayResults?.length
    ? [{ query: data.rankedBatches[0]?.query ?? 'daily-grid', results: data.displayResults }]
    : data.rankedBatches;
  const images = [];
  const seen = new Set<string>();
  for (const batch of batches) {
    for (const result of batch.results) {
      if (!result.thumbnail || seen.has(result.thumbnail)) continue;
      seen.add(result.thumbnail);
      images.push({
        resultId: result.thumbnail,
        imageUrl: proxyUrl(result.thumbnail),
        sourceUrl: result.link || '#',
        title: result.title || data.vibeLabelEn,
        publisher: `${data.actorShortNameEn} · ${result.source}`,
        batchKey: batch.query,
        gridPosition: images.length,
      });
      if (images.length === 9) break;
    }
    if (images.length === 9) break;
  }
  return {
    id: `vibe-atlas-${data.date}-${data.actorId}`,
    actorId: data.actorId,
    actor: data.actorName,
    actorEn: data.actorShortNameEn,
    vibe: data.vibeLabel,
    vibeEn: data.vibeLabelEn,
    vibeEmoji: data.vibeEmoji,
    capturedDate: data.date,
    generatedAt: data.generatedAt || savedAt,
    savedAt,
    sourceRoute,
    images,
  };
}

export function legacyGridFromPlan(record: PlanRecord): GridRecord | null {
  if (record.gridContext?.position !== -1) return null;
  const id = record.gridContext.batchKey || `legacy-grid-${stablePart(record.actor)}-${record.capturedDate}`;
  return {
    id,
    actorId: `legacy-${stablePart(record.actorEn || record.actor)}`,
    actor: record.actor,
    actorEn: record.actorEn,
    vibe: record.vibe,
    vibeEn: record.vibeEn,
    vibeEmoji: record.vibeEmoji,
    capturedDate: record.capturedDate,
    generatedAt: record.addedAt,
    savedAt: record.addedAt,
    sourceRoute: '/?admin=true',
    images: [{
      resultId: `${id}:composite`,
      imageUrl: record.thumbnailUrl,
      sourceUrl: record.imageUrl,
      title: `${record.actor} · ${record.vibe} exported grid`,
      batchKey: record.gridContext.batchKey,
      gridPosition: 0,
    }],
    legacyCompositeUrl: record.imageUrl,
  };
}

export function cardStableResultId(card: CardRecord): string {
  if (card.resultId) return card.resultId;
  if (card.gridContext) {
    return [
      'legacy-card',
      card.capturedDate,
      stablePart(card.actorEn || card.actor),
      card.gridContext.batchKey || 'unknown-batch',
      card.gridContext.position,
    ].join(':');
  }
  return `legacy-card:${card.capturedDate}:${stablePart(card.actorEn || card.actor)}:${stablePart(card.imageUrl)}`;
}

function proxyUrl(url: string): string {
  return `/.netlify/functions/image-proxy?url=${encodeURIComponent(url)}`;
}

function currentRoute(): string {
  return typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}`;
}

function stablePart(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
