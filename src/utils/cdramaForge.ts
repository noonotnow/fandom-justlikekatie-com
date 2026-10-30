export type Lane = 'fandom' | 'self-own' | 'trope-logic' | 'everyday-stakes';
export type Format = 'instagram' | 'tiktok';
export type Joke = { setup: string; punchline: string; visualDirection: string; searchQuery: string };
export type Still = { title: string; thumbnail: string; link: string; source: string; query: string; kind: 'search' | 'upload' };
export type PostCopy = { hook: string; tiktok: string; instagram: string; hashtags: string };
export type TextPlacement = 'top-bottom' | 'single-top' | 'single-bottom' | 'subtitle';
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
      focusY: Number.isFinite(data.focusY) ? Math.max(0, Math.min(100, data.focusY)) : 50,
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
export function frameFor(format: Format) {
  return format === 'instagram'
    ? { width: 1080, height: 1350 }
    : { width: 1080, height: 1920 };
}

function drawText(ctx: CanvasRenderingContext2D, text: string, top: number, bottom: number) {
  const content = text.trim();
  if (!content) return;
  const maxWidth = 940;
  let size = 78, lines: string[] = [];
  for (; size >= 34; size -= 2) {
    ctx.font = `900 ${size}px "Manrope", system-ui, sans-serif`;
    lines = [];
    let line = '';
    for (const word of content.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    if (lines.length * size * 1.12 <= bottom - top - 24
      && lines.every(part => ctx.measureText(part).width <= maxWidth)) break;
  }
  if (size < 34 || lines.length * size * 1.12 > bottom - top - 24
    || lines.some(part => ctx.measureText(part).width > maxWidth)) {
    throw new Error('Card text is too long to fit. Shorten the setup or punchline before downloading.');
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fffdf8';
  ctx.strokeStyle = 'rgba(25, 19, 24, .88)';
  ctx.lineWidth = Math.max(7, size * .105);
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(16, 12, 16, .72)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  const lineHeight = size * 1.12;
  const first = top + ((bottom - top) - lines.length * lineHeight) / 2 + size;
  lines.forEach((part, i) => {
    ctx.strokeText(part, 540, first + lineHeight * i);
    ctx.fillText(part, 540, first + lineHeight * i);
  });
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

export function renderCdramaCard(
  ctx: CanvasRenderingContext2D, image: HTMLImageElement, joke: Joke, format: Format,
  options: { framing?: 'contain' | 'cover'; focusX?: number; focusY?: number; textPlacement?: TextPlacement } = {},
) {
  const frame = frameFor(format);
  const { width, height } = frame;
  ctx.canvas.width = width;
  ctx.canvas.height = height;
  ctx.fillStyle = '#281e25';
  ctx.fillRect(0, 0, width, height);
  const box = { x: 0, y: 0, width, height };
  const scale = options.framing === 'contain'
    ? Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight)
    : Math.max(box.width / image.naturalWidth, box.height / image.naturalHeight);
  const imgW = image.naturalWidth * scale, imgH = image.naturalHeight * scale;
  ctx.save();
  ctx.beginPath(); ctx.rect(box.x, box.y, box.width, box.height); ctx.clip();
  const x = options.framing === 'cover'
    ? box.x + (box.width - imgW) * Math.max(0, Math.min(100, options.focusX ?? 50)) / 100
    : box.x + (box.width - imgW) / 2;
  const y = options.framing === 'cover'
    ? box.y + (box.height - imgH) * Math.max(0, Math.min(100, options.focusY ?? 0)) / 100
    : box.y + (box.height - imgH) / 2;
  ctx.drawImage(image, x, y, imgW, imgH);
  ctx.restore();
  const placement = options.textPlacement ?? 'top-bottom';
  const combined = [joke.setup.trim(), joke.punchline.trim()].filter(Boolean).join(' · ');
  if (placement === 'top-bottom') {
    drawText(ctx, joke.setup, height * .055, height * .27);
    drawText(ctx, joke.punchline, height * .73, height * .945);
  } else if (placement === 'single-top') drawText(ctx, combined, height * .065, height * .28);
  else if (placement === 'single-bottom') drawText(ctx, combined, height * .72, height * .94);
  else drawText(ctx, combined, height * .69, height * .89);
}

export async function loadCardImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => reject(new Error('Image loading timed out. Retry or choose another still.')), 12000);
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      window.clearTimeout(timer);
      image.naturalWidth ? resolve(image) : reject(new Error('Image has no pixels.'));
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('Image could not be loaded. Choose another still or upload your own.'));
    };
    image.src = src;
  });
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
        const image = await loadCardImage(String(reader.result));
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
