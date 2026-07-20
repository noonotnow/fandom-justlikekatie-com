/**
 * Canvas-based single-image card renderer for the individual export feature.
 * Produces a Pokémon-style card with metadata overlay.
 */

import { loadExportCardFonts, readExportCardColors } from './exportCanvas';

// ── Card dimensions ────────────────────────────────────────────────
const CARD_W = 800;
const CARD_H = 1100;
const PAD = 48;
const IMG_AREA_H = 860;
const FOOTER_H = CARD_H - IMG_AREA_H;

// ── Types ──────────────────────────────────────────────────────────

export interface CardMetadata {
  actorName: string;
  vibeEmoji: string;
  vibeLabel: string;
  vibeLabelEn: string;
  date: string;
  imageUrl: string;
  accentColor?: string;
}

// ── Image loading ──────────────────────────────────────────────────

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

// ── Render ─────────────────────────────────────────────────────────

/**
 * Renders a Pokémon-style card with metadata overlay.
 * Returns a Blob of the PNG image.
 */
export async function renderCard(metadata: CardMetadata): Promise<Blob> {
  await loadExportCardFonts();

  const colors = readExportCardColors(metadata.accentColor);

  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not supported');

  // ── Background ───────────────────────────────────────────────────
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Subtle radial accent glow
  const glow = ctx.createRadialGradient(
    CARD_W / 2, CARD_H * 0.35, 40,
    CARD_W / 2, CARD_H * 0.35, 500,
  );
  glow.addColorStop(0, `${colors.accent}28`); // ~16% opacity
  glow.addColorStop(1, `${colors.accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // ── Card border ──────────────────────────────────────────────────
  const borderRadius = 24;
  ctx.save();
  ctx.strokeStyle = `${colors.gold}40`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(1, 1, CARD_W - 2, CARD_H - 2, borderRadius);
  ctx.stroke();
  ctx.restore();

  // ── Main image ───────────────────────────────────────────────────
  const img = await loadImage(metadata.imageUrl);

  const imgPad = PAD;
  const imgMaxW = CARD_W - imgPad * 2;
  const imgMaxH = IMG_AREA_H - imgPad;
  const imgRatio = img.naturalWidth / img.naturalHeight;
  let drawW: number, drawH: number;

  if (imgRatio > imgMaxW / imgMaxH) {
    drawW = imgMaxW;
    drawH = imgMaxW / imgRatio;
  } else {
    drawH = imgMaxH;
    drawW = imgMaxH * imgRatio;
  }

  const imgX = (CARD_W - drawW) / 2;
  const imgY = imgPad + (imgMaxH - drawH) / 2;

  // Rounded clip for image
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(imgX, imgY, drawW, drawH, 16);
  ctx.clip();
  ctx.drawImage(img, imgX, imgY, drawW, drawH);
  ctx.restore();

  // ── Metadata footer ──────────────────────────────────────────────
  const footerY = IMG_AREA_H;
  ctx.textAlign = 'center';
  const cx = CARD_W / 2;

  // Actor name (gold, prominent)
  ctx.font = 'bold 32px "Noto Sans SC", "Inter", sans-serif';
  ctx.fillStyle = colors.gold;
  ctx.fillText(metadata.actorName, cx, footerY + 44);

  // Vibe label with emoji
  ctx.font = '600 24px "Noto Sans SC", "Inter", sans-serif';
  ctx.fillStyle = colors.text;
  ctx.fillText(
    `${metadata.vibeEmoji} ${metadata.vibeLabel} · ${metadata.vibeLabelEn}`,
    cx,
    footerY + 84,
  );

  // Date
  ctx.font = '400 18px "Inter", sans-serif';
  ctx.fillStyle = colors.textMuted;
  ctx.fillText(metadata.date, cx, footerY + 118);

  // Watermark
  ctx.font = 'bold 14px "Inter", "Noto Sans SC", sans-serif';
  ctx.fillStyle = `${colors.gold}99`;
  ctx.fillText('VIBE ATLAS — 氛围图鉴 — fandom.justlikekatie.com', cx, footerY + FOOTER_H - 24);

  // ── Convert to blob ──────────────────────────────────────────────
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to create PNG blob'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}
