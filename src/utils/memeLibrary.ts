import { dbGetSyncState, dbGetVisibleCards, dbSaveCard, collectionScopeForCard, type CardRecord } from './collectionDB';
import { schedulePublicCollectionSync } from './publicAccount';

export type MemeLens = 'c-drama' | 'middle-earth';
export const MAX_MEME_BYTES = 8 * 1024 * 1024;
const MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** Download the preserved image, not a resized preview or a newly rendered card. */
export async function downloadSavedMeme(card: CardRecord): Promise<void> {
  const response = await fetch(card.imageUrl, { credentials: 'same-origin', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error('The saved meme could not be downloaded. Your library copy is unchanged.');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('The saved item did not return an image.');
  const extension = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' } as Record<string, string>)[blob.type] || 'img';
  const title = (card.title || card.vibe || 'memeforge-meme').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'memeforge-meme';
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url; link.download = `${title}.${extension}`;
    document.body.append(link); link.click(); link.remove();
  } finally { window.setTimeout(() => URL.revokeObjectURL(url), 30_000); }
}

/** Finished image bytes only: never a source still, working draft, pack or grid. */
export async function saveMemeImage(
  image: Blob,
  lens: MemeLens,
  title: string,
  provenance?: { sourceUrl?: string; publisher?: string },
): Promise<CardRecord> {
  if (lens !== 'c-drama' && lens !== 'middle-earth') throw new Error('Choose a MemeForge lens.');
  if (!MIME_TYPES.has(image.type) || !image.size || image.size > MAX_MEME_BYTES) {
    throw new Error('Choose a PNG, JPEG or WebP image up to 8 MB.');
  }
  // Decode before accepting a renamed or corrupt file as a saved visual.
  const bitmap = await createImageBitmap(image);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000) {
      throw new Error('Choose an image with fewer than 40 million pixels.');
    }
  } finally { bitmap.close(); }
  const bytes = await image.arrayBuffer();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(value => value.toString(16).padStart(2, '0')).join('');
  const resultId = `memeforge-${lens}-${digest}`;
  const state = await dbGetSyncState();
  const existing = (await dbGetVisibleCards(state.activeAccountId))
    .find(card => collectionScopeForCard(card) === lens && card.resultId === resultId);
  if (existing) return existing;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(image);
  });
  const label = title.trim().slice(0, 220) || 'Saved meme';
  const localId = crypto.randomUUID();
  // IndexedDB keys images by URL. Keep different accounts/lenses from replacing
  // one another when they happen to save identical bytes on the same browser.
  const imageUrl = `${dataUrl}#memeforge-${lens}-${localId}`;
  const card: CardRecord = {
    localId,
    imageUrl, thumbnailUrl: imageUrl, resultId,
    actor: lens === 'c-drama' ? 'C-drama' : 'Middle-earth',
    actorEn: lens === 'c-drama' ? 'C-drama' : 'Middle-earth',
    vibe: label, vibeEn: 'Finished meme · saved as-is', vibeEmoji: '',
    capturedDate: new Date().toISOString().slice(0, 10),
    savedAt: new Date().toISOString(),
    collectionScope: lens,
    contentKind: lens === 'c-drama' ? 'c-drama-meme' : 'middle-earth-meme',
    title: label,
    publisher: provenance?.publisher || 'Uploaded from your device',
    sourceUrl: provenance?.sourceUrl,
    sourceRoute: `/memeforge/${lens}`,
  };
  await dbSaveCard(card);
  // Same local-first, opt-in account/MEDIA sync used by the existing Collection.
  schedulePublicCollectionSync();
  return card;
}
