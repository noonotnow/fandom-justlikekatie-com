import type { MediaReference } from './mediaReference';

const MAX_COLLECTION_IMAGE_BYTES = 8 * 1024 * 1024;

export async function uploadCollectionImage(
  dataUrl: string,
  collectionId: string,
  itemId: string,
): Promise<MediaReference> {
  const source = await fetch(dataUrl);
  const blob = await source.blob();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) {
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
  if (!body.media || typeof body.media !== 'object') {
    throw new Error('Collection image upload returned an invalid response.');
  }
  return body.media as MediaReference;
}