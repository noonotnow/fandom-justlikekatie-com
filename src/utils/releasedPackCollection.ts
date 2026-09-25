import type { CardRecord, GridRecord } from './collectionDB';

export interface CollectorRun {
  id: string;
  actorId: string;
  vibeIdx: number;
  generatedAt: string;
  images: Array<{
    thumbnail?: string;
    title?: string;
    source?: string;
    link?: string;
    query?: string;
  }>;
}

interface CollectorActor {
  id: string;
  name?: string;
  shortName_en?: string;
  accentColor?: string;
}

interface CollectorVibe {
  label?: string;
  label_en?: string;
  emoji?: string;
  subtitle?: string;
  subtitle_en?: string;
}

export function collectorGridCollectionId(run: CollectorRun): string {
  return `collector-run-${run.id}`;
}

export function collectorCardRecord(
  run: CollectorRun, index: number, actor: CollectorActor, vibe: CollectorVibe,
): CardRecord {
  const image = run.images[index];
  if (!image?.thumbnail) throw new Error('This image is not available to save.');
  const name = actor.name || actor.shortName_en || run.actorId;
  return {
    imageUrl: image.thumbnail,
    thumbnailUrl: image.thumbnail,
    actorId: run.actorId,
    actor: name,
    actorEn: actor.shortName_en || name,
    vibe: vibe.label || vibe.label_en || 'Vibe Pack',
    vibeEn: vibe.label_en || vibe.label || 'Vibe Pack',
    vibeEmoji: vibe.emoji || '✦',
    vibeKey: `${run.actorId}:${run.vibeIdx}`,
    capturedDate: run.generatedAt.slice(0, 10),
    resultId: `${run.id}:card-${index + 1}`,
    sourceUrl: image.link,
    title: image.title,
    publisher: image.source,
    searchQuery: image.query,
    sourceRoute: 'released-pack',
    collectionScope: 'vibe-atlas',
    gridContext: { position: index, batchKey: run.id },
  };
}

export function collectorGridRecord(
  run: CollectorRun, actor: CollectorActor, vibe: CollectorVibe,
  savedAt = new Date().toISOString(),
): GridRecord {
  if (run.images.length !== 9 || run.images.some(image => !image.thumbnail)) {
    throw new Error('A complete nine-image grid is required to save.');
  }
  const name = actor.name || actor.shortName_en || run.actorId;
  return {
    kind: 'grid',
    schemaVersion: 1,
    rendererVersion: 'vibe-atlas-v1',
    id: collectorGridCollectionId(run),
    actorId: run.actorId,
    actor: name,
    actorEn: actor.shortName_en || name,
    actorAccentColor: actor.accentColor || '#8c668c',
    vibe: vibe.label || vibe.label_en || 'Vibe Pack',
    vibeEn: vibe.label_en || vibe.label || 'Vibe Pack',
    vibeEmoji: vibe.emoji || '✦',
    vibeSubtitle: vibe.subtitle || '',
    vibeSubtitleEn: vibe.subtitle_en || vibe.subtitle || '',
    vibeKey: `${run.actorId}:${run.vibeIdx}`,
    searchSpell: '',
    edition: { provider: null, misprint: false, legendary: false },
    capturedDate: run.generatedAt.slice(0, 10),
    generatedAt: run.generatedAt,
    savedAt,
    sourceRoute: 'released-pack',
    images: run.images.map((image, index) => ({
      resultId: `${run.id}:card-${index + 1}`,
      imageUrl: image.thumbnail!,
      sourceUrl: image.link || image.thumbnail!,
      title: image.title || `Image ${index + 1}`,
      publisher: image.source,
      batchKey: run.id,
      gridPosition: index,
    })),
  };
}