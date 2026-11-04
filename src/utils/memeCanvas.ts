/**
 * Shared MemeForge renderer: a full-bleed still with heavy white, dark-outlined
 * meme type over the top and bottom. This is the C-drama look, used for every
 * new meme made from a clean still (C-drama and Middle-earth alike).
 *
 * Reworking an existing meme deliberately does NOT use this renderer: an
 * outline only adds contrast, it cannot hide captions already baked into the
 * image. That path keeps its solid cover bands.
 *
 * Preview and download must both call renderMemeCanvas so they cannot drift.
 */
export type MemeFormat = 'instagram' | 'tiktok';
export type MemeTextPlacement = 'top-bottom' | 'single-top' | 'single-bottom' | 'subtitle';
export type MemeFraming = 'contain' | 'cover';
export type MemeLines = { setup: string; punchline: string };
export type MemeFrameOptions = {
  framing?: MemeFraming;
  focusX?: number;
  focusY?: number;
  textPlacement?: MemeTextPlacement;
};

export const MEME_TEXT_PLACEMENTS: ReadonlyArray<{ value: MemeTextPlacement; label: string }> = [
  { value: 'top-bottom', label: 'Top and bottom' },
  { value: 'single-top', label: 'Single line · top' },
  { value: 'single-bottom', label: 'Single line · bottom' },
  { value: 'subtitle', label: 'Subtitle · lower third' },
];

export function frameFor(format: MemeFormat) {
  return format === 'instagram'
    ? { width: 1080, height: 1350 }
    : { width: 1080, height: 1920 };
}

const clampPercent = (value: number | undefined, fallback: number) =>
  Math.max(0, Math.min(100, Number.isFinite(value) ? value as number : fallback));

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

/**
 * Draws the meme. `image` may be null for a text-only fallback, which keeps
 * the same type treatment on the dark backdrop.
 */
export function renderMemeCanvas(
  ctx: CanvasRenderingContext2D, image: HTMLImageElement | null, joke: MemeLines, format: MemeFormat,
  options: MemeFrameOptions = {},
) {
  const { width, height } = frameFor(format);
  ctx.canvas.width = width;
  ctx.canvas.height = height;
  ctx.fillStyle = '#281e25';
  ctx.fillRect(0, 0, width, height);
  if (image) {
    const scale = options.framing === 'contain'
      ? Math.min(width / image.naturalWidth, height / image.naturalHeight)
      : Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const imgW = image.naturalWidth * scale, imgH = image.naturalHeight * scale;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
    const x = options.framing === 'cover'
      ? (width - imgW) * clampPercent(options.focusX, 50) / 100
      : (width - imgW) / 2;
    const y = options.framing === 'cover'
      ? (height - imgH) * clampPercent(options.focusY, 0) / 100
      : (height - imgH) / 2;
    ctx.drawImage(image, x, y, imgW, imgH);
    ctx.restore();
  }
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
      if (image.naturalWidth) resolve(image);
      else reject(new Error('Image has no pixels.'));
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('Image could not be loaded. Choose another still or upload your own.'));
    };
    image.src = src;
  });
}
