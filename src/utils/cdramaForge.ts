import { loadCardImage as loadMemeImage, type MemeFormat, type MemeTextPlacement } from './memeCanvas.ts';

// The C-drama renderer now lives in memeCanvas so Middle-earth reaction memes
// share the exact same look. Re-exported here for existing callers.
export { frameFor, loadCardImage, renderMemeCanvas as renderCdramaCard } from './memeCanvas.ts';
export type Lane = 'fandom' | 'self-own' | 'trope-logic' | 'everyday-stakes';
export type Format = MemeFormat;
export type Joke = { setup: string; punchline: string; visualDirection: string; searchQuery: string };
export type Still = { title: string; thumbnail: string; link: string; source: string; query: string; kind: 'search' | 'upload' };
export type PostCopy = { hook: string; tiktok: string; instagram: string; hashtags: string };
export type TextPlacement = MemeTextPlacement;
export type ForgeDraft = {
  moment: string; context: string; lane: Lane; ideas: Joke[]; selected: number;
  still: Still | null; format: Format; copy: PostCopy | null;
  framing: 'contain' | 'cover'; focusX: number; focusY: number; textPlacement: TextPlacement;
};
export const DRAFT_KEY = 'fandom-cdrama-memeforge-draft-v1';
export const emptyDraft = (): ForgeDraft => ({
  moment: '', context: '', lane: 'fandom', ideas: [], selected: 0, still: null, format: 'tiktok', copy: null,
  framing: 'cover', focusX: 50, focusY: 0, textPlacement: 'top-bottom',
});
const validJoke = (value: unknown): value is Joke => {
  const v = value as Joke;
  return Boolean(v && ['setup', 'punchline', 'visualDirection', 'searchQuery']
    .every(key => typeof v[key as keyof Joke] === 'string' && v[key as keyof Joke].length <= 220)
    && (v.setup.trim().length > 0 || v.punchline.trim().length > 0));
};
export function restoreDraft(storage: Pick<Storage, 'getItem'>): ForgeDraft {
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (!raw || raw.length > 2_500_000) return emptyDraft();
    const data = JSON.parse(raw) as ForgeDraft;
    if (!data || typeof data.moment !== 'string' || data.moment.length > 500
      || typeof data.context !== 'string' || data.context.length > 160
      || !['fandom', 'self-own', 'trope-logic', 'everyday-stakes'].includes(data.lane)
      || !Array.isArray(data.ideas) || data.ideas.length > 3 || !data.ideas.every(validJoke)
      || !Number.isInteger(data.selected) || data.selected < 0 || data.selected > 2
      || !['instagram', 'tiktok'].includes(data.format)
      || (data.still !== null && (
        typeof data.still?.thumbnail !== 'string' || data.still.thumbnail.length > 2_000_000
        || typeof data.still?.title !== 'string' || typeof data.still?.link !== 'string'
        || !['search', 'upload'].includes(data.still?.kind)
      ))) return emptyDraft();
    // Post copy is only restored when it has a selected joke; never cross-workspace.
    const copy = data.ideas[data.selected] && data.copy && ['hook', 'tiktok', 'instagram', 'hashtags']
      .every(key => typeof data.copy?.[key as keyof PostCopy] === 'string'
        && data.copy[key as keyof PostCopy].length <= 2200) ? data.copy : null;
    return {
      ...data, copy, framing: data.framing === 'contain' ? 'contain' : 'cover',
      focusX: Number.isFinite(data.focusX) ? Math.max(0, Math.min(100, data.focusX)) : 50,
      focusY: Number.isFinite(data.focusY) ? Math.max(0, Math.min(100, data.focusY)) : 0,
      textPlacement: ['top-bottom', 'single-top', 'single-bottom', 'subtitle'].includes(data.textPlacement)
        ? data.textPlacement : 'top-bottom',
    };
  } catch { return emptyDraft(); }
}
export function suggestedCopy(joke: Joke): PostCopy {
  const setup = joke.setup.trim(), punchline = joke.punchline.trim();
  return {
    hook: setup,
    tiktok: punchline,
    instagram: `${setup}\n${punchline}`,
    hashtags: '#CDrama #CDramaFans #DramaHumor',
  };
}
export function readLocalImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8_000_000) {
      reject(new Error('Choose a JPEG, PNG, or WebP image under 8 MB.')); return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.onload = async () => {
      try {
        const image = await loadMemeImage(String(reader.result));
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1500 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Image resizing unavailable.');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.78);
        if (compressed.length > 2_000_000) throw new Error('Image is too large for local draft storage. Try a smaller file.');
        resolve(compressed);
      } catch (error) { reject(error); }
    };
    reader.readAsDataURL(file);
  });
}
