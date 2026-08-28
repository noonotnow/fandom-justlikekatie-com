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
