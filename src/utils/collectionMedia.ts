import type { CardRecord, CollectionScope, GridRecord } from './collectionDB';
import {
  collectionScopeForCard,
  dbEnsureCardLocalId,
  dbEnsureGridLocalId,
  dbReplaceCardImage,
  dbReplaceGridImage,
  dbSaveCardMediaRecovery,
  dbSaveGrid,
  dbSaveGridMediaRecovery,
} from './collectionDB';
import type {
  CollectionMediaClassification,
  CollectionMediaRecovery,
  MediaReference,
} from './mediaReference';
import {
  isVerifiedMediaReference,
  reassignMediaToCollection,
} from './mediaReference';

const MAX_COLLECTION_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export interface CollectionMediaCandidate {
  media: MediaReference;
  resultId?: string;
  imageUrl?: string;
  collectionScope: CollectionScope;
}

export interface CollectionMediaRecoveryResult<T> {
  record: T;
  recovery: CollectionMediaRecovery;
  reusedExistingMedia: boolean;
}

export interface CollectionGridMediaFailure {
  gridPosition: number;
  resultId: string;
  title: string;
  message: string;
}

export interface CollectionGridMediaPersistenceResult {
  record: GridRecord;
  copiedCount: number;
  failures: CollectionGridMediaFailure[];
}

export function classifyCollectionMedia(
  record: Pick<CardRecord, 'media' | 'imageUrl'> | Pick<GridRecord, 'media' | 'legacyCompositeUrl' | 'images'>,
): CollectionMediaClassification {
  if (record.media && isVerifiedMediaReference(record.media)) return 'media-backed';
  if ('legacyCompositeUrl' in record && record.legacyCompositeUrl) return 'legacy-composite';
  return 'url-only';
}

export async function recoverCollectionCard(
  card: CardRecord,
  packetCandidates: CollectionMediaCandidate[] = [],
): Promise<CollectionMediaRecoveryResult<CardRecord>> {
  const classification = classifyCollectionMedia(card);
  const localId = card.localId || await dbEnsureCardLocalId(card.imageUrl);
  if (!localId) throw new Error('Saved result is no longer available for MEDIA recovery.');
  const collectionId = collectionScopeForCard(card);
  const candidate = findCandidate(card.resultId, card.imageUrl, collectionId, packetCandidates);
  const existing = card.media && isVerifiedMediaReference(card.media) ? card.media : candidate?.media;
  const source = imageSourcesForCard(card);

  try {
    const media = existing
      ? reassignMediaToCollection(existing, collectionId, localId)
      : await registerFirstReachableImage(source, collectionId, localId);
    const recovery = recoveredState(classification, media, source[0]);
    await dbReplaceCardImage(card.imageUrl, media, recovery);
    return {
      record: {
        ...card,
        localId,
        imageUrl: media.deliveryUrl,
        thumbnailUrl: media.thumbnailUrl,
        media,
        mediaRecovery: recovery,
      },
      recovery,
      reusedExistingMedia: Boolean(existing),
    };
  } catch (error) {
    const recovery = unrecoverableState(classification, error, source[0]);
    await dbSaveCardMediaRecovery(card.imageUrl, recovery);
    return { record: { ...card, localId, mediaRecovery: recovery }, recovery, reusedExistingMedia: false };
  }
}

export async function recoverCollectionGrid(
  grid: GridRecord,
  packetCandidates: CollectionMediaCandidate[] = [],
): Promise<CollectionMediaRecoveryResult<GridRecord>> {
  const classification = classifyCollectionMedia(grid);
  const localId = grid.localId || await dbEnsureGridLocalId(grid.id);
  if (!localId) throw new Error('Saved grid is no longer available for MEDIA recovery.');
  const candidate = findCandidate(
    grid.images[0]?.resultId,
    grid.legacyCompositeUrl || grid.images[0]?.imageUrl,
    'vibe-atlas',
    packetCandidates,
  );
  const existing = grid.media && isVerifiedMediaReference(grid.media) ? grid.media : candidate?.media;
  const source = imageSourcesForGrid(grid);

  try {
    const media = existing
      ? reassignMediaToCollection(existing, 'vibe-atlas', localId)
      : await registerFirstReachableImage(source, 'vibe-atlas', localId);
    const recovery = recoveredState(classification, media, source[0]);
    await dbReplaceGridImage(grid.id, media, recovery);
    const images = grid.images.map((image, index) => index === 0
      ? { ...image, imageUrl: media.deliveryUrl, media }
      : image);
    return {
      record: { ...grid, localId, images, media, mediaRecovery: recovery },
      recovery,
      reusedExistingMedia: Boolean(existing),
    };
  } catch (error) {
    const recovery = unrecoverableState(classification, error, source[0]);
    await dbSaveGridMediaRecovery(grid.id, recovery);
    return { record: { ...grid, localId, mediaRecovery: recovery }, recovery, reusedExistingMedia: false };
  }
}

/**
 * Copy every image in a saved grid into MEDIA without changing its source
 * relationship. Each result is saved as it completes so a failed copy never
 * removes the locally saved grid or the copies that did succeed.
 */
export async function persistGridImagesToMedia(
  grid: GridRecord,
  collectionId: CollectionScope = 'vibe-atlas',
): Promise<CollectionGridMediaPersistenceResult> {
  const localId = grid.localId || await dbEnsureGridLocalId(grid.id);
  if (!localId) throw new Error('Saved grid is no longer available for MEDIA persistence.');

  let record: GridRecord = { ...grid, localId };
  const failures: CollectionGridMediaFailure[] = [];
  let copiedCount = 0;

  for (const image of record.images) {
    if (image.media && isVerifiedMediaReference(image.media)) {
      const media = reassignMediaToCollection(
        image.media,
        collectionId,
        mediaItemId(localId, image.gridPosition),
      );
      if (
        image.imageUrl !== media.deliveryUrl
        || image.media.association.id !== media.association.id
        || image.media.association.itemId !== media.association.itemId
      ) {
        record = {
          ...record,
          images: record.images.map(candidate => candidate === image
            ? { ...candidate, imageUrl: media.deliveryUrl, media }
            : candidate),
        };
        await dbSaveGrid(record);
      }
      continue;
    }

    const originalImageUrl = image.imageUrl;
    let persistedImage = image;
    try {
      const media = await registerCollectionImage(
        originalImageUrl,
        collectionId,
        mediaItemId(localId, image.gridPosition),
      );
      persistedImage = {
        ...image,
        imageUrl: media.deliveryUrl,
        media,
        mediaRecovery: recoveredState('url-only', media, originalImageUrl),
      };
      copiedCount += 1;
    } catch (error) {
      const recovery = unrecoverableState('url-only', error, originalImageUrl);
      persistedImage = { ...image, mediaRecovery: recovery };
      failures.push({
        gridPosition: image.gridPosition,
        resultId: image.resultId,
        title: image.title,
        message: recovery.message || 'The original image could not be recovered.',
      });
    }

    record = {
      ...record,
      images: record.images.map(candidate => candidate === image ? persistedImage : candidate),
    };
    await dbSaveGrid(record);
  }

  return { record, copiedCount, failures };
}

function mediaItemId(localId: string, gridPosition: number): string {
  return `${localId}-${gridPosition}`;
}

export async function uploadCollectionImage(
  dataUrl: string,
  collectionId: string,
  itemId: string,
): Promise<MediaReference> {
  const source = await fetch(dataUrl);
  const blob = await source.blob();
  if (!SUPPORTED_MEDIA_TYPES.has(blob.type)) {
    throw new Error('Collection media must be a PNG, JPEG, or WebP image.');
  }
  if (blob.size < 1 || blob.size > MAX_COLLECTION_IMAGE_BYTES) {
    throw new Error('Collection image must be smaller than 8 MB.');
  }

  const params = new URLSearchParams({ collectionId, itemId });
  const response = await fetch(`/api/collection/media?${params.toString()}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': blob.type },
    body: blob,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Collection image could not be uploaded.');
  if (!isVerifiedMediaReference(body.media) || body.media.association.type !== 'collection') {
    throw new Error('Collection image upload returned an invalid response.');
  }
  return body.media as MediaReference;
}

export async function registerCollectionImage(
  sourceUrl: string,
  collectionId: string,
  itemId: string,
): Promise<MediaReference> {
  if (sourceUrl.startsWith('data:image/')) return uploadCollectionImage(sourceUrl, collectionId, itemId);
  const target = unwrapImageProxyUrl(sourceUrl);
  if (!target) throw new Error('The saved image has no recoverable original URL.');
  const response = await fetch(proxyUrl(target), { credentials: 'same-origin' });
  if (!response.ok) throw new Error('The original image could not be reached.');
  const blob = await response.blob();
  if (!SUPPORTED_MEDIA_TYPES.has(blob.type)) {
    throw new Error('The reachable original is not a PNG, JPEG, or WebP image.');
  }
  if (blob.size < 1 || blob.size > MAX_COLLECTION_IMAGE_BYTES) {
    throw new Error('The reachable original is larger than 8 MB.');
  }
  return uploadCollectionImage(await blobToDataUrl(blob), collectionId, itemId);
}

async function registerFirstReachableImage(
  sources: string[],
  collectionId: string,
  itemId: string,
): Promise<MediaReference> {
  if (sources.length === 0) throw new Error('The saved image has no recoverable original URL.');
  let lastError: unknown;
  for (const source of sources) {
    try {
      return await registerCollectionImage(source, collectionId, itemId);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('The original image could not be recovered.');
}

function findCandidate(
  resultId: string | undefined,
  imageUrl: string | undefined,
  collectionScope: CollectionScope,
  candidates: CollectionMediaCandidate[],
): CollectionMediaCandidate | undefined {
  return candidates.find(candidate => (
    candidate.collectionScope === collectionScope
    && isVerifiedMediaReference(candidate.media)
    && (
      (resultId && candidate.resultId === resultId)
      || (imageUrl && candidate.imageUrl === imageUrl)
    )
  ));
}

function imageSourcesForCard(card: CardRecord): string[] {
  return uniqueSources([card.resultId, card.imageUrl, card.thumbnailUrl]);
}

function imageSourcesForGrid(grid: GridRecord): string[] {
  return uniqueSources([
    grid.legacyCompositeUrl,
    grid.images[0]?.resultId,
    grid.images[0]?.imageUrl,
  ]);
}

function uniqueSources(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .filter(value => value.startsWith('data:image/') || Boolean(unwrapImageProxyUrl(value)));
}

function recoveredState(
  classification: CollectionMediaClassification,
  media: MediaReference,
  sourceUrl: string | undefined,
): CollectionMediaRecovery {
  return {
    classification,
    status: 'recovered',
    attemptedAt: new Date().toISOString(),
    ...(sourceUrl ? { sourceUrl } : {}),
    message: media.association.type === 'collection'
      ? 'Permanent MEDIA asset verified for this saved item.'
      : 'Permanent MEDIA asset recovered.',
  };
}

function unrecoverableState(
  classification: CollectionMediaClassification,
  error: unknown,
  sourceUrl: string | undefined,
): CollectionMediaRecovery {
  return {
    classification,
    status: 'unrecoverable',
    attemptedAt: new Date().toISOString(),
    ...(sourceUrl ? { sourceUrl } : {}),
    message: error instanceof Error ? error.message : 'The original image could not be recovered.',
  };
}

function proxyUrl(url: string): string {
  return `/.netlify/functions/image-proxy?url=${encodeURIComponent(url)}`;
}

function unwrapImageProxyUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value, typeof window === 'undefined' ? 'https://fandom.justlikekatie.com' : window.location.origin);
    if (parsed.pathname !== '/.netlify/functions/image-proxy' && parsed.pathname !== '/api/image-proxy') {
      return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.toString() : undefined;
    }
    const target = parsed.searchParams.get('url');
    if (!target) return undefined;
    const original = new URL(target);
    return original.protocol === 'https:' && !original.username && !original.password && !original.search && !original.hash
      ? original.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${blob.type};base64,${btoa(binary)}`;
}