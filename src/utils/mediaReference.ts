export type MediaAssociation =
  | { type: 'collection'; id: string; itemId: string }
  | { type: 'publication'; id: string; itemId: string };

export interface MediaReference {
  schemaVersion: 1;
  assetId: string;
  deliveryUrl: string;
  thumbnailUrl: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  sizeBytes: number;
  checksum: string;
  dimensions: { width: number; height: number };
  association: MediaAssociation;
}

export type CollectionMediaClassification = 'media-backed' | 'legacy-composite' | 'url-only';

export type CollectionMediaRecoveryStatus = 'recovered' | 'unrecoverable';

export interface CollectionMediaRecovery {
  classification: CollectionMediaClassification;
  status: CollectionMediaRecoveryStatus;
  attemptedAt: string;
  message?: string;
  sourceUrl?: string;
}

export function isVerifiedMediaReference(value: unknown): value is MediaReference {
  if (!value || typeof value !== 'object') return false;
  const media = value as Partial<MediaReference>;
  return media.schemaVersion === 1
    && typeof media.assetId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(media.assetId)
    && isStableMediaUrl(media.deliveryUrl)
    && isStableMediaUrl(media.thumbnailUrl)
    && ['image/png', 'image/jpeg', 'image/webp'].includes(media.mimeType || '')
    && Number.isInteger(media.sizeBytes)
    && (media.sizeBytes || 0) > 0
    && typeof media.checksum === 'string'
    && /^[0-9a-f]{64}$/.test(media.checksum)
    && Number.isInteger(media.dimensions?.width)
    && Number.isInteger(media.dimensions?.height)
    && (media.dimensions?.width || 0) > 0
    && (media.dimensions?.height || 0) > 0
    && isMediaAssociation(media.association);
}

export function reassignMediaToCollection(
  media: MediaReference,
  collectionId: string,
  itemId: string,
): MediaReference {
  if (!isVerifiedMediaReference(media)) throw new Error('The existing MEDIA provenance is invalid.');
  return {
    ...media,
    association: { type: 'collection', id: collectionId, itemId },
  };
}

function isMediaAssociation(value: unknown): value is MediaAssociation {
  if (!value || typeof value !== 'object') return false;
  const association = value as Partial<MediaAssociation>;
  return (association.type === 'collection' || association.type === 'publication')
    && typeof association.id === 'string'
    && typeof association.itemId === 'string';
}

function isStableMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}
