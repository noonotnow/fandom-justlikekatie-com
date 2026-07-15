/**
 * Canvas-based share card renderer for the Star of the Day export.
 * Ported from the vanilla HTML implementation in /index.html.
 */

import type { StarOfDayData, RankedBatch } from '../hooks/useStarOfDay';

// ── Canvas dimensions ──────────────────────────────────────────────
const EXPORT_CARD_W = 1080;
const EXPORT_CARD_H = 1350;
const EXPORT_TEASER_W = 1080;
const EXPORT_TEASER_H = 1080;

// ── Badge assets ───────────────────────────────────────────────────
const TIER_BADGE_PATHS: Record<string, string> = {
  'star-of-day': '/assets/cards/badges/star-of-day.svg',
  misprint: '/assets/cards/badges/misprint.svg',
  legendary: '/assets/cards/badges/legendary.svg',
};
const BADGE_SIZE = 80;
const BADGE_OFFSET = 20;

// ── Micro-copy pools (date-seeded) ─────────────────────────────────
const MICRO_COPY_LINES = [
  '今天也在为磕生磕死的你效劳',
  'friendship-powered, not sponsored',
  '存图不吃亏，动图更香',
  '今日限定，明天不认账',
  '氛围不散，磕学不止',
  'made with love and mild obsession',
];
const MISPRINT_MICRO_COPY_LINES = [
  'Rare misprint detected.',
  'This edition escaped quality control.',
  'Known collector anomaly.',
  'The grid was haunted at export time.',
];
const LEGENDARY_MICRO_COPY_LINES = [
  'Not reproducible. Deeply memorable.',
  'A relic from the unstable era.',
  'Collectors still speak of this batch in hushed tones.',
  'Too wrong to discard. Too iconic to ignore.',
];

// ── Fallback-ladder depth per search provider ──────────────────────
const FALLBACK_ENGINE_DEPTH: Record<string, number> = {
  brave: 0,
  bing_images: 1,
  google_images: 2,
  yandex_images: 3,
};

// ── Low-level helpers ──────────────────────────────────────────────

function pad2(n: number): string {
  const s = String(Math.max(0, n | 0));
  return s.length >= 2 ? s : '0' + s;
}

function hashStringToUint(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || '').trim());
  if (!m) return `rgba(201,169,110,${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function countDistinctSourcesClient(results: Array<{ source?: string }> | undefined): number {
  const seen = new Set<string>();
  (results || []).forEach((r) => {
    if (r?.source) seen.add(r.source);
  });
  return seen.size;
}

// ── Image loading ──────────────────────────────────────────────────

function loadProxiedImage(originalUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!originalUrl) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `/.netlify/functions/image-proxy?url=${encodeURIComponent(originalUrl)}`;
  });
}

function loadLocalImage(path: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!path) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = path;
  });
}

// ── Canvas drawing helpers ─────────────────────────────────────────

function drawCoverImageRounded(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.clip();

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const srcRatio = srcW / srcH;
  const dstRatio = w / h;
  let sx: number, sy: number, sw: number, sh: number;
  if (srcRatio > dstRatio) {
    sh = srcH;
    sw = srcH * dstRatio;
    sx = (srcW - sw) / 2;
    sy = 0;
  } else {
    sw = srcW;
    sh = srcW / dstRatio;
    sx = 0;
    sy = (srcH - sh) * 0.15;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

function drawPlaceholderTileRounded(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number, fillColor: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.clip();

  const glyphColor = 'rgba(255,255,255,0.16)';
  const cx = x + w / 2;
  const cy = y + h / 2;
  const iconSize = Math.min(w, h) * 0.4;

  ctx.strokeStyle = glyphColor;
  ctx.lineWidth = Math.max(2, iconSize * 0.06);
  ctx.strokeRect(cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);

  ctx.fillStyle = glyphColor;
  ctx.beginPath();
  ctx.arc(cx - iconSize * 0.18, cy - iconSize * 0.18, iconSize * 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - iconSize / 2, cy + iconSize / 2);
  ctx.lineTo(cx - iconSize * 0.05, cy - iconSize * 0.05);
  ctx.lineTo(cx + iconSize * 0.2, cy + iconSize * 0.15);
  ctx.lineTo(cx + iconSize * 0.45, cy - iconSize * 0.15);
  ctx.lineTo(cx + iconSize / 2, cy + iconSize / 2);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const tokens = text.match(/[\u3000-\u9fff\uff00-\uffef]|[^\u3000-\u9fff\uff00-\uffef\s]+|\s+/g) || [text];
  const lines: string[] = [];
  let current = '';
  tokens.forEach((tok) => {
    const candidate = current + tok;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current.trim());
      current = tok;
    } else {
      current = candidate;
    }
  });
  if (current.trim()) lines.push(current.trim());
  return lines;
}

function drawLetterSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string, cx: number, y: number, spacing: number,
) {
  const chars = String(text).split('');
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const totalW = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  let x = cx - totalW / 2;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], x, y);
    x += widths[i] + spacing;
  }
  ctx.textAlign = prevAlign;
}

// ── Badge composite ────────────────────────────────────────────────

async function compositeBadge(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  tier: string,
) {
  const badgePath = TIER_BADGE_PATHS[tier];
  if (!badgePath) return;
  const badgeImg = await loadLocalImage(badgePath);
  if (!badgeImg) return;
  const x = canvas.width - BADGE_SIZE - BADGE_OFFSET;
  const y = BADGE_OFFSET;
  ctx.drawImage(badgeImg, x, y, BADGE_SIZE, BADGE_SIZE);
}

// ── Font loading ───────────────────────────────────────────────────

export async function loadExportCardFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load('400 16px "Noto Sans SC"'),
      document.fonts.load('600 16px "Noto Sans SC"'),
      document.fonts.load('700 16px "Noto Sans SC"'),
      document.fonts.load('400 16px "Inter"'),
      document.fonts.load('600 16px "Inter"'),
      document.fonts.load('700 16px "Inter"'),
      document.fonts.ready,
    ]);
  } catch {
    // Non-fatal — worst case the card draws with a fallback system font.
  }
}

// ── Color reading ──────────────────────────────────────────────────

interface ExportCardColors {
  bg: string;
  bgCard: string;
  text: string;
  textMuted: string;
  textDim: string;
  textDarker: string;
  gold: string;
  accent: string;
}

export function readExportCardColors(accentColor?: string): ExportCardColors {
  const rootStyle = getComputedStyle(document.documentElement);
  const bg = (rootStyle.getPropertyValue('--bg') || '#0e0e12').trim();
  const bgCard = (rootStyle.getPropertyValue('--bg-card') || '#14141a').trim();
  const text = (rootStyle.getPropertyValue('--text') || '#f0ede8').trim();
  const textMuted = (rootStyle.getPropertyValue('--text-muted') || '#a3a3ad').trim();
  const textDim = (rootStyle.getPropertyValue('--text-dim') || '#8f8f99').trim();
  const textDarker = (rootStyle.getPropertyValue('--text-darker') || '#6b6b6b').trim();
  const gold = (rootStyle.getPropertyValue('--gold') || '#c9a96e').trim();
  return { bg, bgCard, text, textMuted, textDim, textDarker, gold, accent: accentColor || gold };
}

// ── Edition/tier helpers ───────────────────────────────────────────

export function classifyEditionTier(chosen: RankedBatch | undefined | null): string {
  if (!chosen) return 'standard';
  // Manual overrides via explicit flags
  if ((chosen as RankedBatch & { legendary?: boolean }).legendary) return 'legendary';
  if ((chosen as RankedBatch & { misprint?: boolean }).misprint) return 'misprint';

  const count = typeof chosen.count === 'number'
    ? chosen.count
    : (Array.isArray(chosen.results) ? chosen.results.length : 0);
  const distinctSources = typeof chosen.distinctSources === 'number'
    ? chosen.distinctSources
    : countDistinctSourcesClient(chosen.results);
  const provider = chosen.provider;
  const depth = (provider && provider in FALLBACK_ENGINE_DEPTH)
    ? FALLBACK_ENGINE_DEPTH[provider]
    : 0;
  const isPrimary = depth === 0;

  if (count >= 7 && distinctSources >= 3 && isPrimary) return 'standard';

  const inMisprintRange = (count >= 3 && count <= 6) || distinctSources <= 2;
  if (!inMisprintRange) return 'standard';

  const isDeepFallback = depth >= 2;
  if (count >= 3 && count <= 6 && distinctSources <= 2 && isDeepFallback) return 'legendary';
  return 'misprint';
}

function formatEditionCode(dateStr: string, rankNum: number): string {
  const mmdd = (dateStr && dateStr.length >= 10)
    ? (dateStr.slice(5, 7) + dateStr.slice(8, 10))
    : '0000';
  return '#' + mmdd + '-' + pad2(rankNum);
}

function editionCodeTagText(dateStr: string, rankNum: number, tier: string): string {
  const code = formatEditionCode(dateStr, rankNum);
  if (tier === 'misprint') return code + ' · misprint';
  if (tier === 'legendary') return code + ' · relic-class';
  return code;
}

function pickMicroCopyLine(dateStr: string, tier: string): string {
  const pool = tier === 'misprint'
    ? MISPRINT_MICRO_COPY_LINES
    : tier === 'legendary'
      ? LEGENDARY_MICRO_COPY_LINES
      : MICRO_COPY_LINES;
  const idx = hashStringToUint('microcopy:' + tier + ':' + (dateStr || '')) % pool.length;
  return pool[idx];
}

interface EditionStamp { text: string; rankNum: number; }

function buildEditionStampLine(
  dateStr: string,
  actorName: string,
  vibeLabel: string,
  rankIndex: number | null,
  totalBatches: number | null,
  tier: string,
): EditionStamp {
  const hasRank = typeof rankIndex === 'number' && typeof totalBatches === 'number' && totalBatches > 0;
  const rankNum = hasRank ? (rankIndex + 1) : 0;
  const parts = [dateStr, actorName, vibeLabel].filter(Boolean);
  let text = parts.join(' · ');
  let trailing: string | null = null;
  if (tier === 'misprint') trailing = 'misprint pull';
  else if (tier === 'legendary') trailing = 'unstable era';
  else if (hasRank) trailing = '第 ' + rankNum + ' / ' + totalBatches + ' 期';
  if (trailing) text += ' · ' + trailing;
  return { text, rankNum };
}

function actorFilenameSlug(name: string): string {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'star';
}

export function buildExportFilename(
  dateStr: string,
  actorNameEn: string,
  rankNum: number,
  variant: 'full' | 'teaser',
  tier: string,
): string {
  const slug = actorFilenameSlug(actorNameEn);
  const nn = pad2(rankNum);
  const tierTag = (tier && tier !== 'standard') ? ('_' + tier) : '';
  const suffix = variant === 'teaser' ? '_teaser' : '';
  return 'vibe-guide_' + dateStr + '_' + slug + tierTag + '_ep' + nn + suffix + '.png';
}

// ── Export payload construction from StarOfDayData ─────────────────

interface ExportPayload {
  actorName: string;
  actorNameEn: string;
  accentColor: string;
  vibeEmoji: string;
  vibeLabel: string;
  vibeSubtitle: string;
  chosen: RankedBatch;
  date: string;
  rankIndex: number | null;
  totalBatches: number | null;
  badgeTier: string;
}

function buildExportPayload(data: StarOfDayData): ExportPayload {
  const chosen = data.rankedBatches[0];
  const tier = classifyEditionTier(chosen);
  return {
    actorName: data.actorName,
    actorNameEn: data.actorShortNameEn,
    accentColor: data.actorAccentColor,
    vibeEmoji: data.vibeEmoji,
    vibeLabel: data.vibeLabel,
    vibeSubtitle: data.vibeSubtitle,
    chosen,
    date: data.date || new Date().toISOString().slice(0, 10),
    rankIndex: 0,
    totalBatches: data.rankedBatches.length,
    badgeTier: tier !== 'standard' ? 'star-of-day_' + tier : 'star-of-day',
  };
}

// ── Full export canvas (1080×1350) ─────────────────────────────────

async function renderFullExportCanvas(payload: ExportPayload): Promise<HTMLCanvasElement> {
  const results = payload.chosen?.results?.slice(0, 9) ?? [];
  const dateStr = payload.date;
  const tier = classifyEditionTier(payload.chosen);
  const editionStamp = buildEditionStampLine(
    dateStr, payload.actorName, payload.vibeLabel,
    payload.rankIndex, payload.totalBatches, tier,
  );
  const editionCodeTag = editionCodeTagText(dateStr, editionStamp.rankNum, tier);
  const microCopy = pickMicroCopyLine(dateStr, tier);

  await loadExportCardFonts();

  const imagesPromise = Promise.all(results.map((r) => loadProxiedImage(r.thumbnail)));

  const colors = readExportCardColors(payload.accentColor);
  const accentColor = colors.accent;

  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_CARD_W;
  canvas.height = EXPORT_CARD_H;
  const ctx = canvas.getContext('2d')!;

  const PAD = 64;
  const contentW = EXPORT_CARD_W - PAD * 2;

  // Background + radial glow
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, EXPORT_CARD_W, EXPORT_CARD_H);
  const glow = ctx.createRadialGradient(
    EXPORT_CARD_W / 2, 260, 40,
    EXPORT_CARD_W / 2, 260, 620,
  );
  glow.addColorStop(0, hexToRgba(accentColor, 0.16));
  glow.addColorStop(1, hexToRgba(accentColor, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, EXPORT_CARD_W, EXPORT_CARD_H);

  ctx.textAlign = 'center';
  const cx = EXPORT_CARD_W / 2;
  let y = PAD - 8;

  // 1. Series label
  y += 34;
  ctx.font = '600 24px "Noto Sans SC", "Inter", sans-serif';
  ctx.fillStyle = colors.gold;
  ctx.fillText('今日氛围图鉴', cx, y);

  // 1b. Edition catalog code
  y += 26;
  ctx.font = '600 15px "Inter", monospace';
  ctx.fillStyle = hexToRgba(colors.gold, 0.8);
  drawLetterSpacedText(ctx, editionCodeTag, cx, y, 2);

  // 2. Title
  y += 56;
  ctx.font = '700 46px "Noto Sans SC", "Inter", sans-serif';
  ctx.fillStyle = colors.text;
  ctx.fillText('🔮 今日之星 · 氛围格子', cx, y);

  // 3. Actor name
  if (payload.actorName) {
    y += 58;
    ctx.font = '700 40px "Noto Sans SC", "Inter", sans-serif';
    ctx.fillStyle = accentColor;
    ctx.fillText(payload.actorName, cx, y);
  }

  // 4. Vibe name
  if (payload.vibeLabel) {
    y += 46;
    ctx.font = '600 30px "Noto Sans SC", "Inter", sans-serif';
    ctx.fillStyle = colors.text;
    ctx.fillText((payload.vibeEmoji ? payload.vibeEmoji + ' ' : '') + payload.vibeLabel, cx, y);
  }

  // 5. Search phrase
  if (payload.chosen?.query) {
    y += 44;
    ctx.font = '400 24px "Inter", "Noto Sans SC", sans-serif';
    ctx.fillStyle = colors.textMuted;
    const spellLines = wrapCanvasText(ctx, '🔍 ' + payload.chosen.query, contentW - 40);
    spellLines.slice(0, 2).forEach((line, i) => {
      ctx.fillText(line, cx, y + i * 32);
    });
    y += (Math.min(spellLines.length, 2) - 1) * 32;
  }

  // 6. Subtitle
  if (payload.vibeSubtitle) {
    y += 40;
    ctx.font = '400 22px "Noto Sans SC", "Inter", sans-serif';
    ctx.fillStyle = colors.textDim;
    const subLines = wrapCanvasText(ctx, payload.vibeSubtitle, contentW - 40);
    subLines.slice(0, 2).forEach((line, i) => {
      ctx.fillText(line, cx, y + i * 30);
    });
    y += (Math.min(subLines.length, 2) - 1) * 30;
  }

  // 7. 3×3 image grid
  const footerZoneH = 168;
  const gridTop = y + 36;
  const gridBottom = EXPORT_CARD_H - footerZoneH;
  const gridGap = 12;
  const gridAvailW = contentW;
  const gridAvailH = gridBottom - gridTop;
  let tileSize = Math.min((gridAvailW - gridGap * 2) / 3, (gridAvailH - gridGap * 2) / 3);
  tileSize = Math.max(tileSize, 40);
  const gridW = tileSize * 3 + gridGap * 2;
  const gridH = tileSize * 3 + gridGap * 2;
  const gridX = (EXPORT_CARD_W - gridW) / 2;
  const gridY = gridTop + Math.max(0, (gridAvailH - gridH) / 2);

  const images = await imagesPromise;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const idx = row * 3 + col;
      const tx = gridX + col * (tileSize + gridGap);
      const ty = gridY + row * (tileSize + gridGap);
      const img = images[idx];
      if (img) {
        drawCoverImageRounded(ctx, img, tx, ty, tileSize, tileSize, 14);
      } else {
        drawPlaceholderTileRounded(ctx, tx, ty, tileSize, tileSize, 14, colors.bgCard);
      }
    }
  }

  // 8. Sources
  const sourceNames: string[] = [];
  results.forEach((r) => {
    if (r.source && !sourceNames.includes(r.source)) sourceNames.push(r.source);
  });
  const sourcesLineY = EXPORT_CARD_H - footerZoneH + 40;
  if (sourceNames.length) {
    ctx.font = '400 18px "Inter", "Noto Sans SC", sans-serif';
    ctx.fillStyle = colors.textDarker;
    ctx.fillText('来源：' + sourceNames.slice(0, 5).join(' · '), cx, sourcesLineY);
  }

  // 9. Footer stack
  ctx.font = '600 20px "Inter", "Noto Sans SC", sans-serif';
  ctx.fillStyle = colors.gold;
  ctx.fillText('🔮 Vibe Guide · 氛围图鉴 · fandom.justlikekatie.com', cx, EXPORT_CARD_H - 96);

  ctx.font = '400 17px "Inter", "Noto Sans SC", sans-serif';
  ctx.fillStyle = colors.textDim;
  ctx.fillText(editionStamp.text, cx, EXPORT_CARD_H - 68);

  ctx.font = '400 15px "Inter", "Noto Sans SC", sans-serif';
  ctx.fillStyle = hexToRgba(colors.textDarker, 0.85);
  ctx.fillText(microCopy, cx, EXPORT_CARD_H - 40);

  // 10. Tier badge overlay
  await compositeBadge(canvas, ctx, payload.badgeTier || tier);

  return canvas;
}

// ── Teaser export canvas (1080×1080) ───────────────────────────────

async function renderTeaserExportCanvas(payload: ExportPayload): Promise<HTMLCanvasElement> {
  const allResults = payload.chosen?.results ?? [];
  const useSix = allResults.length >= 6;
  const cols = useSix ? 3 : 2;
  const rows = 2;
  const results = allResults.slice(0, cols * rows);
  const dateStr = payload.date;
  const tier = classifyEditionTier(payload.chosen);
  const editionStamp = buildEditionStampLine(
    dateStr, payload.actorName, payload.vibeLabel,
    payload.rankIndex, payload.totalBatches, tier,
  );
  const editionCodeTag = editionCodeTagText(dateStr, editionStamp.rankNum, tier);
  const microCopy = pickMicroCopyLine(dateStr, tier);

  await loadExportCardFonts();

  const imagesPromise = Promise.all(results.map((r) => loadProxiedImage(r.thumbnail)));

  const colors = readExportCardColors(payload.accentColor);
  const accentColor = colors.accent;

  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_TEASER_W;
  canvas.height = EXPORT_TEASER_H;
  const ctx = canvas.getContext('2d')!;

  const PAD = 56;
  const contentW = EXPORT_TEASER_W - PAD * 2;

  // Background + radial glow
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, EXPORT_TEASER_W, EXPORT_TEASER_H);
  const glow = ctx.createRadialGradient(
    EXPORT_TEASER_W / 2, 200, 30,
    EXPORT_TEASER_W / 2, 200, 520,
  );
  glow.addColorStop(0, hexToRgba(accentColor, 0.16));
  glow.addColorStop(1, hexToRgba(accentColor, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, EXPORT_TEASER_W, EXPORT_TEASER_H);

  ctx.textAlign = 'center';
  const cx = EXPORT_TEASER_W / 2;
  let y = PAD - 12;

  // 1. Series label
  y += 30;
  ctx.font = '600 22px "Noto Sans SC", "Inter", sans-serif';
  ctx.fillStyle = colors.gold;
  ctx.fillText('今日氛围图鉴', cx, y);

  // 1b. Edition catalog code
  y += 22;
  ctx.font = '600 13px "Inter", monospace';
  ctx.fillStyle = hexToRgba(colors.gold, 0.8);
  drawLetterSpacedText(ctx, editionCodeTag, cx, y, 2);

  // 2. Title
  y += 48;
  ctx.font = '700 38px "Noto Sans SC", "Inter", sans-serif';
  ctx.fillStyle = colors.text;
  ctx.fillText('🔮 今日之星 · 氛围格子', cx, y);

  // 3. Actor name
  if (payload.actorName) {
    y += 48;
    ctx.font = '700 34px "Noto Sans SC", "Inter", sans-serif';
    ctx.fillStyle = accentColor;
    ctx.fillText(payload.actorName, cx, y);
  }

  // 4. Vibe name
  if (payload.vibeLabel) {
    y += 40;
    ctx.font = '600 26px "Noto Sans SC", "Inter", sans-serif';
    ctx.fillStyle = colors.text;
    ctx.fillText((payload.vibeEmoji ? payload.vibeEmoji + ' ' : '') + payload.vibeLabel, cx, y);
  }

  // 5. Image grid (2×3 or 2×2)
  const footerZoneH = 150;
  const gridTop = y + 34;
  const gridBottom = EXPORT_TEASER_H - footerZoneH;
  const gridGap = 12;
  const gridAvailW = contentW;
  const gridAvailH = gridBottom - gridTop;
  let tileSize = Math.min(
    (gridAvailW - gridGap * (cols - 1)) / cols,
    (gridAvailH - gridGap * (rows - 1)) / rows,
  );
  tileSize = Math.max(tileSize, 40);
  const gridW = tileSize * cols + gridGap * (cols - 1);
  const gridH = tileSize * rows + gridGap * (rows - 1);
  const gridX = (EXPORT_TEASER_W - gridW) / 2;
  const gridY = gridTop + Math.max(0, (gridAvailH - gridH) / 2);

  const imgArr = await imagesPromise;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const tx = gridX + c * (tileSize + gridGap);
      const ty = gridY + r * (tileSize + gridGap);
      const img = imgArr[idx];
      if (img) {
        drawCoverImageRounded(ctx, img, tx, ty, tileSize, tileSize, 14);
      } else {
        drawPlaceholderTileRounded(ctx, tx, ty, tileSize, tileSize, 14, colors.bgCard);
      }
    }
  }

  // 6. Sources
  const sourceNames: string[] = [];
  results.forEach((r) => {
    if (r.source && !sourceNames.includes(r.source)) sourceNames.push(r.source);
  });
  const sourcesLineY = EXPORT_TEASER_H - footerZoneH + 36;
  if (sourceNames.length) {
    ctx.font = '400 17px "Inter", "Noto Sans SC", sans-serif';
    ctx.fillStyle = colors.textDarker;
    ctx.fillText('来源：' + sourceNames.slice(0, 5).join(' · '), cx, sourcesLineY);
  }

  // 7. Footer stack
  ctx.font = '600 18px "Inter", "Noto Sans SC", sans-serif';
  ctx.fillStyle = colors.gold;
  ctx.fillText('🔮 Vibe Guide · 氛围图鉴 · fandom.justlikekatie.com', cx, EXPORT_TEASER_H - 84);

  ctx.font = '400 15px "Inter", "Noto Sans SC", sans-serif';
  ctx.fillStyle = colors.textDim;
  ctx.fillText(editionStamp.text, cx, EXPORT_TEASER_H - 60);

  ctx.font = '400 14px "Inter", "Noto Sans SC", sans-serif';
  ctx.fillStyle = hexToRgba(colors.textDarker, 0.85);
  ctx.fillText(microCopy, cx, EXPORT_TEASER_H - 34);

  // 8. Tier badge overlay
  await compositeBadge(canvas, ctx, payload.badgeTier || tier);

  return canvas;
}

// ── Public API ─────────────────────────────────────────────────────

export type ExportVariant = 'full' | 'teaser';

export async function renderExportCanvas(
  data: StarOfDayData,
  variant: ExportVariant = 'full',
): Promise<HTMLCanvasElement> {
  const payload = buildExportPayload(data);
  return variant === 'teaser'
    ? renderTeaserExportCanvas(payload)
    : renderFullExportCanvas(payload);
}

/**
 * Renders the share card, then tries native share (mobile) or falls back
 * to a PNG download. Returns a toast message string for the caller to display.
 */
export async function saveShareCard(
  data: StarOfDayData,
  variant: ExportVariant = 'full',
): Promise<string> {
  const payload = buildExportPayload(data);
  const tier = classifyEditionTier(payload.chosen);

  const canvas = await renderExportCanvas(data, variant);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png');
  });

  if (!blob) {
    throw new Error('分享卡生成失败，再试一次？');
  }

  const editionStamp = buildEditionStampLine(
    payload.date, payload.actorName, payload.vibeLabel,
    payload.rankIndex, payload.totalBatches, tier,
  );
  const filenameTier = tier !== 'standard' ? 'star-of-day_' + tier : 'star-of-day';
  const fileName = buildExportFilename(
    payload.date, payload.actorNameEn, editionStamp.rankNum, variant, filenameTier,
  );

  const file = new File([blob], fileName, { type: 'image/png' });

  // Try native share (mobile)
  let shared = false;
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({
        files: [file],
        title: '今日氛围图鉴',
        text: '🔮 今日之星 · 氛围格子',
      });
      shared = true;
    } catch {
      // User cancelled or platform rejected — fall through to download
      shared = false;
    }
  }

  if (shared) {
    return '分享成功 ✓';
  }

  // Fallback: download
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);

  if (tier === 'misprint') return '已保存稀有错版 · Misprint preserved';
  if (tier === 'legendary') return '已保存传说级错版 · Legendary save';
  return '分享卡已保存 ✓';
}
