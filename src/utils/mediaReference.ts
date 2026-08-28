export type MediaAssociation =
  | { type: 'collection'; id: string; itemId: string }
  | { type: 'idea_packet'; id: string; outputId?: string };

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

export interface IdeaPacketMediaSourceDescriptor {
  schemaVersion: 1;
  assetId: string;
  checksum: string;
  association: {
    type: 'idea_packet';
    id: string;
    outputId: string;
  };
}

export function associateMediaWithIdeaPacket(
  media: MediaReference,
  packetId: string,
  outputId?: string,
): MediaReference {
  return {
    ...media,
    association: {
      type: 'idea_packet',
      id: packetId,
      ...(outputId ? { outputId } : {}),
    },
  };
}

export function mediaSourceDescriptor(
  media: MediaReference,
  packetId: string,
  outputId: string,
): IdeaPacketMediaSourceDescriptor | undefined {
  if (
    media.association.type !== 'idea_packet'
    || media.association.id !== packetId
    || media.association.outputId !== outputId
  ) return undefined;
  return {
    schemaVersion: 1,
    assetId: media.assetId,
    checksum: media.checksum,
    association: {
      type: 'idea_packet',
      id: packetId,
      outputId,
    },
  };
}

function isMediaAssociation(value: unknown): value is MediaAssociation {
  if (!value || typeof value !== 'object') return false;
  const association = value as Partial<MediaAssociation>;
  if (association.type === 'collection') {
    return typeof association.id === 'string' && typeof association.itemId === 'string';
  }
  return association.type === 'idea_packet'
    && typeof association.id === 'string'
    && (association.outputId === undefined || typeof association.outputId === 'string');
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
