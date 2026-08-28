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