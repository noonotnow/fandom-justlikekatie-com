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
  const chosen = data.rankedBatches[0];
  return {
    kind: 'grid',
    schemaVersion: 1,
    rendererVersion: 'vibe-atlas-v1',
    id: `vibe-atlas-${data.date}-${data.actorId}`,
    actorId: data.actorId,
    actor: data.actorName,
    actorEn: data.actorShortNameEn,
    actorAccentColor: data.actorAccentColor,
    vibe: data.vibeLabel,
    vibeEn: data.vibeLabelEn,
    vibeEmoji: data.vibeEmoji,
    vibeSubtitle: data.vibeSubtitle,
    vibeSubtitleEn: data.vibeSubtitleEn,
    searchSpell: data.generationQuery?.trim() || chosen?.query || '',
    ...(data.generationPrompt ? { generationPrompt: data.generationPrompt } : {}),
    ...(data.ctaSeed ? { ctaSeed: data.ctaSeed } : {}),
    edition: {
      provider: chosen?.provider ?? null,
      misprint: chosen?.misprint === true,
      legendary: chosen?.legendary === true,
    },
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
    kind: 'grid',
    schemaVersion: 1,
    rendererVersion: 'vibe-atlas-v1',
    id,
    actorId: `legacy-${stablePart(record.actorEn || record.actor)}`,
    actor: record.actor,
    actorEn: record.actorEn,
    actorAccentColor: '#c9a96e',
    vibe: record.vibe,
    vibeEn: record.vibeEn,
    vibeEmoji: record.vibeEmoji,
    vibeSubtitle: '',
    vibeSubtitleEn: '',
    searchSpell: record.gridContext.batchKey || '',
    edition: {
      provider: null,
      misprint: false,
      legendary: false,
    },
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

export function starDataFromCollectionGrid(grid: GridRecord): StarOfDayData {
  const results = grid.images.map(image => ({
    title: image.title,
    thumbnail: sourceThumbnail(image.resultId, image.imageUrl),
    link: image.sourceUrl,
    source: image.publisher || 'Saved collection',
    ...(image.familyId ? { familyId: image.familyId } : {}),
    ...(image.familyLabel ? { familyLabel: image.familyLabel } : {}),
    ...(image.familyEvidence ? { familyEvidence: image.familyEvidence } : {}),
  }));
  return {
    actorId: grid.actorId,
    actorName: grid.actor,
    actorShortNameEn: grid.actorEn,
    actorAccentColor: grid.actorAccentColor,
    vibeEmoji: grid.vibeEmoji,
    vibeLabel: grid.vibe,
    vibeLabelEn: grid.vibeEn,
    vibeSubtitle: grid.vibeSubtitle,
    vibeSubtitleEn: grid.vibeSubtitleEn,
    rankedBatches: [{
      query: grid.searchSpell,
      results,
      count: results.length,
      distinctSources: new Set(results.map(result => result.source)).size,
      provider: grid.edition.provider,
      ...(grid.edition.misprint ? { misprint: true } : {}),
      ...(grid.edition.legendary ? { legendary: true } : {}),
      ...(grid.intent === 'legendary-misprint' ? { intentionalMisprint: true } : {}),
    }],
    displayResults: results,
    date: grid.capturedDate,
    generatedAt: grid.generatedAt,
    ...(grid.generationPrompt ? { generationPrompt: grid.generationPrompt } : {}),
    ...(grid.searchSpell ? { generationQuery: grid.searchSpell } : {}),
    ...(grid.ctaSeed ? { ctaSeed: grid.ctaSeed } : {}),
    ...(grid.editorial ? { editorial: grid.editorial } : {}),
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

function sourceThumbnail(resultId: string, imageUrl: string): string {
  return /^https?:\/\//.test(resultId) ? resultId : imageUrl;
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
