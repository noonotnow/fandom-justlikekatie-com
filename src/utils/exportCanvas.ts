/**
 * Canvas-based share card renderer for the Star of the Day export.
 * Ported from the vanilla HTML implementation in /index.html.
 */

import type { StarOfDayData, RankedBatch } from '../hooks/useStarOfDay';
import { getLocale, translate } from '../i18n/locale';

const EXPORT_FONT_STACK = '"Inter", "Noto Sans SC", sans-serif';
const CJK_FONT_SAMPLE = '氛围图鉴今日之星爱情故事，来源（原始记录）';

// ── Canvas dimensions ──────────────────────────────────────────────
const EXPORT_CARD_W = 1080;
const EXPORT_CARD_H = 1350;
const EXPORT_TEASER_W = 1080;
const EXPORT_TEASER_H = 1080;

/** Versioned output contracts. Canvas output is explicitly requested in sRGB;
 * browsers encode canvas PNGs as sRGB even when no ICC chunk is emitted. */
export const EXPORT_CONTRACT_VERSION = 1;
export const EXPORT_CONTRACTS = {
  standard: {
    variant: 'standard' as const, width: 1080, height: 1080, colorProfile: 'sRGB' as const,
    mimeType: 'image/png' as const, rendererVersion: 'vibe-atlas-export-v2',
  },
  master: {
    variant: 'master' as const, width: 2160, height: 2160, colorProfile: 'sRGB' as const,
    mimeType: 'image/png' as const, rendererVersion: 'vibe-atlas-export-v2',
  },
};

export type ExportColorProfile = 'sRGB';
export interface ExportProvenanceAsset {
  assetId: string;
  checksum: string;
  deliveryUrl: string;
  sourceUrl?: string;
  attribution?: { publisher?: string; title?: string };
  permitted: true;
}
export interface ExportManifest {
  schemaVersion: 1;
  contractVersion: typeof EXPORT_CONTRACT_VERSION;
  variant: 'master';
  rendererVersion: string;
  colorProfile: ExportColorProfile;
  gridId: string;
  boardHash: string;
  assets: ExportProvenanceAsset[];
  createdAt: string;
}

export function buildMasterExportManifest(
  gridId: string,
  boardHash: string,
  assets: ExportProvenanceAsset[],
  createdAt = new Date().toISOString(),
): ExportManifest {
  if (!gridId || !boardHash || assets.length !== 9 || assets.some(asset => asset.permitted !== true)) {
    throw new Error('Master Export requires nine permitted MEDIA assets and a board hash.');
  }
  return {
    schemaVersion: 1, contractVersion: EXPORT_CONTRACT_VERSION, variant: 'master',
    rendererVersion: EXPORT_CONTRACTS.master.rendererVersion, colorProfile: 'sRGB',
    gridId, boardHash, assets: assets.map(asset => ({ ...asset })), createdAt,
  };
}

// ── Badge assets ───────────────────────────────────────────────────
const TIER_BADGE_PATHS: Record<string, string> = {
  'star-of-day': '/assets/cards/badges/star-of-day.svg',
  misprint: '/assets/cards/badges/misprint.svg',
  legendary: '/assets/cards/badges/legendary.svg',
  'legendary-misprint': '/assets/cards/badges/legendary.svg',
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
const MICRO_COPY_LINES_ZH = [
  '今日也为心动的你认真留证',
  '收好这一格，下一集再来认领',
  '氛围已存档，心跳不归档',
  '本日限定，明日重新心动',
  '九张证据，足够再看一遍',
  '这不是嗑糖，是严谨的现场勘查',
];
const MISPRINT_MICRO_COPY_LINES = [
  'Rare misprint detected.',
  'This edition escaped quality control.',
  'Known collector anomaly.',
  'The grid was haunted at export time.',
];
const MISPRINT_MICRO_COPY_LINES_ZH = [
  '罕见错版：证据不全，心动倒是真的',
  '这一版溜过了质检，但没溜过你',
  '已记录：现场略有异常，建议收藏',
  '谁在导出时偷偷加了点命运感？',
];
const LEGENDARY_MICRO_COPY_LINES = [
  'Not reproducible. Deeply memorable.',
  'A relic from the unstable era.',
  'Collectors still speak of this batch in hushed tones.',
  'Too wrong to discard. Too iconic to ignore.',
];
const LEGENDARY_MICRO_COPY_LINES_ZH = [
  '不可复现，但很难忘',
  '来自不稳定年代的一件遗物',
  '老藏家说起这一批，声音都会放轻',
  '错得离谱，也经典得离谱',
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
    img.src = originalUrl.startsWith('/.netlify/functions/image-proxy?')
      ? originalUrl
      : `/.netlify/functions/image-proxy?url=${encodeURIComponent(originalUrl)}`;
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

const CJK_CLOSING_PUNCTUATION = /^[，。、；：？！）》」』】〕〉》〗〙〛’”」〞’﹚﹜﹞％℃]/u;
const CJK_OPENING_PUNCTUATION = /[（《「『【〔〈《〖〘〚‘“﹙﹛﹝]$/u;
const CJK_SEGMENTER = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

function splitCanvasTextToken(
  ctx: CanvasRenderingContext2D,
  token: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let current = '';
  for (const { segment } of CJK_SEGMENTER.segment(token)) {
    if (!current) {
      current = segment;
      continue;
    }
    if (CJK_CLOSING_PUNCTUATION.test(segment)) {
      current += segment;
      continue;
    }
    if (ctx.measureText(current + segment).width > maxWidth) {
      const line = current.trimEnd();
      if (CJK_OPENING_PUNCTUATION.test(line)) {
        const graphemes = Array.from(CJK_SEGMENTER.segment(line), part => part.segment);
        const opening = graphemes.pop() || '';
        const prefix = graphemes.join('').trimEnd();
        if (prefix) lines.push(prefix);
        current = opening + segment;
      } else {
        lines.push(line);
        current = segment;
      }
    } else {
      current += segment;
    }
  }
  if (current) lines.push(current.trimEnd());
  return lines;
}

export function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const tokens: string[] = [];
  let grouped = '';
  let groupType = '';
  for (const { segment } of CJK_SEGMENTER.segment(text)) {
    const type = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff00-\uffef]/u.test(segment)
      ? 'cjk'
      : /^\s+$/u.test(segment) ? 'space' : 'word';
    if (type === 'cjk' || (grouped && type !== groupType)) {
      if (grouped) tokens.push(grouped);
      grouped = '';
    }
    if (type === 'cjk') {
      if (CJK_CLOSING_PUNCTUATION.test(segment) && tokens.length) {
        const lastIndex = tokens.length - 1;
        if (/^\s+$/u.test(tokens[lastIndex]) && lastIndex > 0) {
          tokens[lastIndex - 1] += tokens[lastIndex] + segment;
          tokens.pop();
        } else if (!/^\s+$/u.test(tokens[lastIndex])) {
          tokens[lastIndex] += segment;
        } else {
          tokens.push(segment);
        }
      } else {
        tokens.push(segment);
      }
    } else {
      grouped += segment;
    }
    groupType = type;
  }
  if (grouped) tokens.push(grouped);
  const lines: string[] = [];
  let current = '';
  const breakableTokens = tokens.flatMap(token =>
    ctx.measureText(token).width > maxWidth
      ? splitCanvasTextToken(ctx, token, maxWidth)
      : [token],
  );
  breakableTokens.forEach((tok) => {
    const candidate = current + tok;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      if (CJK_CLOSING_PUNCTUATION.test(tok)) {
        const graphemes = Array.from(CJK_SEGMENTER.segment(current.trimEnd()), part => part.segment);
        const last = graphemes[graphemes.length - 1] || '';
        const prefix = graphemes.slice(0, -1).join('').trimEnd();
        if (prefix && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(last)) {
          lines.push(prefix);
          current = last + tok;
          return;
        }
      }
      const line = current.trimEnd();
      if (CJK_OPENING_PUNCTUATION.test(line)) {
        const graphemes = Array.from(CJK_SEGMENTER.segment(line), part => part.segment);
        const opening = graphemes.pop() || '';
        lines.push(graphemes.join('').trimEnd());
        current = opening + tok;
      } else {
        lines.push(line);
        current = tok;
      }
    } else {
      current = candidate;
    }
  });
  if (current.trim()) lines.push(current.trim());
  return lines;
}

function boundedWrappedLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const wrapped = wrapCanvasText(ctx, text, maxWidth);
  if (wrapped.length <= maxLines) return wrapped;
  const visible = wrapped.slice(0, maxLines);
  const last = visible.length - 1;
  visible[last] = truncateCanvasText(ctx, `${visible[last]}…`, maxWidth);
  return visible;
}

export function truncateCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  const graphemes = Array.from(CJK_SEGMENTER.segment(text), segment => segment.segment);
  let low = 0;
  let high = graphemes.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (ctx.measureText(graphemes.slice(0, mid).join('').trimEnd() + ellipsis).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return graphemes.slice(0, low).join('').trimEnd() + ellipsis;
}

function truncateCanvasTextWithSuffix(
  ctx: CanvasRenderingContext2D,
  text: string,
  suffix: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text + suffix).width <= maxWidth) return text + suffix;
  const graphemes = Array.from(CJK_SEGMENTER.segment(text), part => part.segment);
  let low = 0;
  let high = graphemes.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = graphemes.slice(0, mid).join('').trimEnd() + '…' + suffix;
    if (ctx.measureText(candidate).width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  const result = graphemes.slice(0, low).join('').trimEnd() + '…' + suffix;
  return ctx.measureText(result).width <= maxWidth
    ? result
    : truncateCanvasText(ctx, suffix, maxWidth);
}

function boundedCreditLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  trailingText = '',
): string[] {
  const wrapped = wrapCanvasText(ctx, text, maxWidth);
  if (wrapped.length <= 2 && wrapped.every(line => ctx.measureText(line).width <= maxWidth)) {
    return wrapped;
  }
  const firstLine = truncateCanvasText(ctx, wrapped[0] || text, maxWidth);
  const wrappedRemainder = wrapped.slice(1).join(' ');
  const remainderWithoutSuffix = trailingText && wrappedRemainder.endsWith(trailingText)
    ? wrappedRemainder.slice(0, -trailingText.length)
    : wrappedRemainder;
  const remainder = remainderWithoutSuffix
    .replace(/[·\s]+$/, '')
    .trim();
  if (!remainder) {
    return trailingText && wrapped.length > 1
      ? [firstLine, truncateCanvasText(ctx, ` · ${trailingText}`, maxWidth)]
      : [firstLine];
  }
  const suffix = trailingText ? ` · ${trailingText}` : '';
  return [
    firstLine,
    suffix
      ? truncateCanvasTextWithSuffix(ctx, remainder, suffix, maxWidth)
      : truncateCanvasText(ctx, remainder, maxWidth),
  ];
}

function sourceCreditLines(
  ctx: CanvasRenderingContext2D,
  sourceNames: string[],
  maxWidth: number,
): string[] {
  const suffix = translate('Vibe Atlas · sRGB', '氛围图鉴 · sRGB');
  const sourceLabel = translate('Sources: ', '来源（原始记录）：');
  const text = `${sourceNames.length ? `${sourceLabel}${sourceNames.slice(0, 5).join(' · ')} · ` : ''}${suffix}`;
  return boundedCreditLines(ctx, text, maxWidth, suffix);
}

function legacySourceCreditLines(
  ctx: CanvasRenderingContext2D,
  sourceNames: string[],
  maxWidth: number,
): string[] {
  const text = translate(
    `Sources: ${sourceNames.slice(0, 5).join(' · ')}`,
    `来源（原始记录）：${sourceNames.slice(0, 5).join(' · ')}`,
  );
  return boundedCreditLines(ctx, text, maxWidth);
}

function drawSourceCreditLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  centerX: number,
  firstBaseline: number,
  lineHeight: number,
): void {
  lines.forEach((line, index) => {
    ctx.fillText(line, centerX, firstBaseline + index * lineHeight);
  });
}

function localizedCaption(en: string, zh: string): string {
  if (getLocale() !== 'zh-CN') return translate(en, zh) || en || zh;
  if (zh && (zh !== en || /[\p{Script=Han}]/u.test(zh))) return zh;
  return en ? `原始英文：${en}` : '';
}

function drawCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  maxWidth: number,
): void {
  ctx.fillText(truncateCanvasText(ctx, text, maxWidth), centerX, y);
}

type LegacyFooterVariant = 'portrait' | 'teaser';

interface LegacyFooterLayout {
  zoneHeight: number;
  sourceTop: number;
  sourceFont: string;
  sourceLineHeight: number;
  brandBottom: number;
  brandFont: string;
  editionBottom: number;
  editionFont: string;
  microCopyBottom: number;
  microCopyFont: string;
}

const LEGACY_FOOTER_LAYOUTS: Record<LegacyFooterVariant, LegacyFooterLayout> = {
  portrait: {
    zoneHeight: 190,
    sourceTop: 30,
    sourceFont: `400 18px ${EXPORT_FONT_STACK}`,
    sourceLineHeight: 22,
    brandBottom: 96,
    brandFont: `600 20px ${EXPORT_FONT_STACK}`,
    editionBottom: 68,
    editionFont: `400 17px ${EXPORT_FONT_STACK}`,
    microCopyBottom: 40,
    microCopyFont: `400 15px ${EXPORT_FONT_STACK}`,
  },
  teaser: {
    zoneHeight: 170,
    sourceTop: 28,
    sourceFont: `400 17px ${EXPORT_FONT_STACK}`,
    sourceLineHeight: 21,
    brandBottom: 84,
    brandFont: `600 18px ${EXPORT_FONT_STACK}`,
    editionBottom: 60,
    editionFont: `400 15px ${EXPORT_FONT_STACK}`,
    microCopyBottom: 34,
    microCopyFont: `400 14px ${EXPORT_FONT_STACK}`,
  },
};

function drawLegacyFooter(
  ctx: CanvasRenderingContext2D,
  variant: LegacyFooterVariant,
  canvasHeight: number,
  contentWidth: number,
  centerX: number,
  sourceNames: string[],
  editionDetail: string,
  microCopy: string,
  colors: ExportCardColors,
): void {
  const layout = LEGACY_FOOTER_LAYOUTS[variant];
  const footerTop = canvasHeight - layout.zoneHeight;

  if (sourceNames.length) {
    ctx.font = layout.sourceFont;
    ctx.fillStyle = colors.textMuted;
    const sourceLines = legacySourceCreditLines(ctx, sourceNames, contentWidth);
    drawSourceCreditLines(
      ctx, sourceLines, centerX, footerTop + layout.sourceTop, layout.sourceLineHeight,
    );
  }

  ctx.font = layout.brandFont;
  ctx.fillStyle = colors.gold;
  ctx.fillText(
    translate(
      '🔮 Vibe Guide · 氛围图鉴 · fandom.justlikekatie.com',
      '🔮 氛围图鉴 · Vibe Guide · fandom.justlikekatie.com',
    ),
    centerX,
    canvasHeight - layout.brandBottom,
  );

  ctx.font = layout.editionFont;
  ctx.fillStyle = colors.textDim;
  ctx.fillText(
    truncateCanvasText(ctx, editionDetail, contentWidth),
    centerX,
    canvasHeight - layout.editionBottom,
  );

  ctx.font = layout.microCopyFont;
  ctx.fillStyle = hexToRgba(colors.textDarker, 0.85);
  ctx.fillText(
    truncateCanvasText(ctx, microCopy, contentWidth),
    centerX,
    canvasHeight - layout.microCopyBottom,
  );
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
      document.fonts.load(`400 16px "Noto Sans SC"`, CJK_FONT_SAMPLE),
      document.fonts.load(`600 16px "Noto Sans SC"`, CJK_FONT_SAMPLE),
      document.fonts.load(`700 16px "Noto Sans SC"`, CJK_FONT_SAMPLE),
      document.fonts.load('400 16px "Inter"'),
      document.fonts.load('600 16px "Inter"'),
      document.fonts.load('700 16px "Inter"'),
      document.fonts.ready,
    ]);
  } catch {
    if (getLocale() === 'zh-CN') {
      throw new Error('简体中文字体未能加载，因此没有导出图片。请刷新页面后重试。');
    }
  }
  if (getLocale() === 'zh-CN' && !document.fonts.check(`400 16px "Noto Sans SC"`, CJK_FONT_SAMPLE)) {
    throw new Error('简体中文字体未能加载，因此没有导出图片。请刷新页面后重试。');
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
  if (chosen.intentionalMisprint === true) return 'legendary-misprint';
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
  if (tier === 'misprint') return code + translate(' · misprint', ' · 错版');
  if (tier === 'legendary') return code + translate(' · relic-class', ' · 传说级');
  if (tier === 'legendary-misprint') return code + translate(' · legendary misprint', ' · 传说错版');
  return code;
}

function pickMicroCopyLine(dateStr: string, tier: string): string {
  const isChinese = getLocale() === 'zh-CN';
  const pool = tier === 'misprint'
    ? (isChinese ? MISPRINT_MICRO_COPY_LINES_ZH : MISPRINT_MICRO_COPY_LINES)
    : tier === 'legendary' || tier === 'legendary-misprint'
      ? (isChinese ? LEGENDARY_MICRO_COPY_LINES_ZH : LEGENDARY_MICRO_COPY_LINES)
      : (isChinese ? MICRO_COPY_LINES_ZH : MICRO_COPY_LINES);
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
  if (tier === 'misprint') trailing = translate('misprint pull', '错版');
  else if (tier === 'legendary') trailing = translate('unstable era', '传说级藏品');
  else if (tier === 'legendary-misprint') trailing = translate('intentional legendary misprint', '传说级错版');
  else if (hasRank) {
    trailing = getLocale() === 'zh-CN'
      ? `第 ${rankNum} / ${totalBatches} 批`
      : `Edition ${rankNum} of ${totalBatches}`;
  }
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
  variant: ExportVariant,
  tier: string,
  vibeLabel = '',
  boardShortId = '',
): string {
  const slug = actorFilenameSlug(actorNameEn);
  const vibeSlug = actorFilenameSlug(vibeLabel);
  const nn = pad2(rankNum);
  const tierTag = (tier && tier !== 'standard') ? ('_' + tier) : '';
  const suffix = variant === 'teaser' ? '_teaser'
    : variant === 'standard' ? '_standard'
      : variant === 'master' ? '_master' : variant === 'raw' ? '_raw' : '';
  const boardTag = boardShortId ? '_' + actorFilenameSlug(boardShortId).slice(0, 16) : '';
  return 'vibe-guide_' + dateStr + '_' + slug + (vibeSlug ? '_' + vibeSlug : '')
    + boardTag + tierTag + '_ep' + nn + suffix + '.png';
}

// ── Export payload construction from StarOfDayData ─────────────────

interface ExportPayload {
  actorName: string;
  actorNameEn: string;
  accentColor: string;
  vibeEmoji: string;
  vibeLabel: string;
  vibeLabelEn: string;
  vibeSubtitle: string;
  vibeSubtitleEn: string;
  chosen: RankedBatch;
  date: string;
  rankIndex: number | null;
  totalBatches: number | null;
  badgeTier: string;
  presentation?: StarOfDayData['presentation'];
  editorial?: StarOfDayData['editorial'];
}

export interface ExportArtifact {
  blob: Blob;
  file: File;
  fileName: string;
}

function exportResults(data: StarOfDayData, variant: ExportVariant): RankedBatch['results'] {
  const payload = buildExportPayload(data);
  const results = payload.chosen?.results?.slice(0, variant === 'teaser' ? 6 : 12) ?? [];
  if ((variant === 'full' || variant === 'standard' || variant === 'master') && results.length < 9) {
    throw new Error(translate(
      'This approved board is not complete yet. A share card requires all nine images.',
      '这期已批准的内容尚不完整。分享卡需要九张图片。',
    ));
  }
  return results;
}

function boardShortId(data: StarOfDayData): string {
  const supplied = (data as StarOfDayData & { publicationReceiptShortId?: string }).publicationReceiptShortId;
  if (supplied) return supplied;
  const payload = buildExportPayload(data);
  const source = payload.chosen?.results?.slice(0, 9)
    .map(result => `${result.link}|${result.thumbnail}`)
    .join('||') || `${data.date}|${data.actorId}|${data.vibeLabel}`;
  return hashStringToUint(`frozen-board:${source}`).toString(16).padStart(8, '0');
}

export async function areExportImagesReady(
  data: StarOfDayData,
  variant: ExportVariant = 'full',
): Promise<boolean> {
  try {
    const results = exportResults(data, variant);
    const images = await Promise.all(results.map(result => loadProxiedImage(result.thumbnail)));
    return images.length === results.length
      && images.every(Boolean);
  } catch {
    return false;
  }
}

async function createExportArtifact(
  data: StarOfDayData,
  variant: ExportVariant,
): Promise<ExportArtifact> {
  const payload = buildExportPayload(data);
  const tier = classifyEditionTier(payload.chosen);
  const canvas = await renderExportCanvas(data, variant);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png');
  });
  if (!blob) throw new Error(translate('Share card generation failed. Please try again.', '分享卡生成失败，请重试。'));
  const editionStamp = buildEditionStampLine(
    payload.date, payload.actorName, payload.vibeLabel,
    payload.rankIndex, payload.totalBatches, tier,
  );
  const filenameTier = tier !== 'standard' ? 'star-of-day_' + tier : 'star-of-day';
  const fileName = buildExportFilename(
    payload.date, payload.actorNameEn, editionStamp.rankNum, variant, filenameTier,
    payload.vibeLabelEn || payload.vibeLabel, boardShortId(data),
  );
  return { blob, file: new File([blob], fileName, { type: 'image/png' }), fileName };
}

function downloadExportArtifact(artifact: ExportArtifact): void {
  const objectUrl = URL.createObjectURL(artifact.blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = artifact.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}

export function buildExportPayload(data: StarOfDayData): ExportPayload {
  const chosen = data.displayResults?.length
    ? { ...data.rankedBatches[0], results: data.displayResults }
    : data.rankedBatches[0];
  const tier = classifyEditionTier(chosen);
  return {
    actorName: data.actorName,
    actorNameEn: data.actorShortNameEn,
    accentColor: data.actorAccentColor,
    vibeEmoji: data.vibeEmoji,
    vibeLabel: data.vibeLabel,
    vibeLabelEn: data.vibeLabelEn,
    vibeSubtitle: data.vibeSubtitle,
    vibeSubtitleEn: data.vibeSubtitleEn,
    chosen,
    date: data.date || new Date().toISOString().slice(0, 10),
    rankIndex: 0,
    totalBatches: data.rankedBatches.length,
    badgeTier: tier !== 'standard' ? tier : 'star-of-day',
    ...(data.presentation ? { presentation: data.presentation } : {}),
    ...(data.editorial ? { editorial: data.editorial } : {}),
  };
}

// ── Full export canvas (1080×1350) ─────────────────────────────────

async function renderFullExportCanvas(payload: ExportPayload): Promise<HTMLCanvasElement> {
  const results = payload.chosen?.results?.slice(0, 12) ?? [];
  if (results.length < 9) {
    throw new Error(translate(
      'This approved board is not complete yet. A share card requires all nine images.',
      '这期已批准的内容尚不完整。分享卡需要九张图片。',
    ));
  }
  const cols = results.length > 9 ? 4 : 3;
  const rows = 3;
  const dateStr = payload.date;
  const tier = classifyEditionTier(payload.chosen);
  const actorName = localizedCaption(payload.actorNameEn, payload.actorName);
  const vibeLabel = localizedCaption(payload.vibeLabelEn, payload.vibeLabel);
  const editionStamp = buildEditionStampLine(
    dateStr, actorName, vibeLabel,
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
  ctx.font = `600 24px ${EXPORT_FONT_STACK}`;
  ctx.fillStyle = colors.gold;
  ctx.fillText(payload.editorial
    ? getLocale() === 'zh-CN'
      ? `氛围图鉴 · ${payload.editorial.mode === 'event' ? '同场精选' : '主题精选'}`
      : `VIBE ATLAS · ${payload.editorial.mode === 'event' ? 'EVENT SET' : 'COMPILED SET'}`
    : translate('Today’s Vibe Atlas', '今日氛围图鉴'), cx, y);

  // 1b. Edition catalog code
  y += 26;
  ctx.font = '600 15px "Inter", monospace';
  ctx.fillStyle = hexToRgba(colors.gold, 0.8);
  drawLetterSpacedText(ctx, editionCodeTag, cx, y, 2);

  // 2. Title
  y += 56;
  ctx.font = `700 46px ${EXPORT_FONT_STACK}`;
  ctx.fillStyle = colors.text;
  ctx.fillText(translate('🔮 Star of the Day · Vibe Grid', '🔮 今日之星 · 氛围格子'), cx, y);

  // 3. Actor name
  if (actorName) {
    y += 58;
    ctx.font = `700 40px ${EXPORT_FONT_STACK}`;
    ctx.fillStyle = accentColor;
    drawCenteredText(ctx, actorName, cx, y, contentW);
  }

  // 4. Vibe name
  if (vibeLabel) {
    y += 46;
    ctx.font = `600 30px ${EXPORT_FONT_STACK}`;
    ctx.fillStyle = colors.text;
    drawCenteredText(ctx, (payload.vibeEmoji ? payload.vibeEmoji + ' ' : '') + vibeLabel, cx, y, contentW);
  }

  // 5. Search phrase
  if (payload.chosen?.query) {
    y += 44;
    ctx.font = `400 24px ${EXPORT_FONT_STACK}`;
    ctx.fillStyle = colors.textMuted;
    const searchText = translate(
      `🔍 Original search: ${payload.chosen.query}`,
      `🔍 检索词（原始搜索）：${payload.chosen.query}`,
    );
    const spellLines = boundedWrappedLines(ctx, searchText, contentW - 40, 2);
    spellLines.forEach((line, i) => {
      drawCenteredText(ctx, line, cx, y + i * 32, contentW - 40);
    });
    y += (Math.min(spellLines.length, 2) - 1) * 32;
  }

  // 6. Subtitle
  const vibeSubtitle = localizedCaption(payload.vibeSubtitleEn, payload.vibeSubtitle);
  if (vibeSubtitle) {
    y += 40;
    ctx.font = `400 22px ${EXPORT_FONT_STACK}`;
    ctx.fillStyle = colors.textDim;
    const subLines = boundedWrappedLines(ctx, vibeSubtitle, contentW - 40, 2);
    subLines.forEach((line, i) => {
      drawCenteredText(ctx, line, cx, y + i * 30, contentW - 40);
    });
    y += (Math.min(subLines.length, 2) - 1) * 30;
  }

  // 7. Standard 3×3 or bounded Event 4×3 image composition
  const footerZoneH = LEGACY_FOOTER_LAYOUTS.portrait.zoneHeight;
  const gridTop = y + 36;
  const gridBottom = EXPORT_CARD_H - footerZoneH;
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
  const gridX = (EXPORT_CARD_W - gridW) / 2;
  const gridY = gridTop + Math.max(0, (gridAvailH - gridH) / 2);

  const images = await imagesPromise;
  if (images.length !== results.length || images.some((image) => !image)) {
    throw new Error(translate(
      'The share card could not load all nine approved images. Nothing was exported.',
      '分享卡无法载入全部九张已批准的图片，没有导出文件。',
    ));
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      const tx = gridX + col * (tileSize + gridGap);
      const ty = gridY + row * (tileSize + gridGap);
      const img = images[idx];
      drawCoverImageRounded(ctx, img!, tx, ty, tileSize, tileSize, 14);
    }
  }

  // 8. Sources
  const sourceNames: string[] = [];
  results.forEach((r) => {
    if (r.source && !sourceNames.includes(r.source)) sourceNames.push(r.source);
  });
  drawLegacyFooter(
    ctx, 'portrait', EXPORT_CARD_H, contentW, cx,
    sourceNames, editionStamp.text, microCopy, colors,
  );

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
  const actorName = localizedCaption(payload.actorNameEn, payload.actorName);
  const vibeLabel = localizedCaption(payload.vibeLabelEn, payload.vibeLabel);
  const editionStamp = buildEditionStampLine(
    dateStr, actorName, vibeLabel,
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
  ctx.font = `600 22px ${EXPORT_FONT_STACK}`;
  ctx.fillStyle = colors.gold;
  ctx.fillText('今日氛围图鉴', cx, y);

  // 1b. Edition catalog code
  y += 22;
  ctx.font = '600 13px "Inter", monospace';
  ctx.fillStyle = hexToRgba(colors.gold, 0.8);
  drawLetterSpacedText(ctx, editionCodeTag, cx, y, 2);

  // 2. Title
  y += 48;
  ctx.font = `700 38px ${EXPORT_FONT_STACK}`;
  ctx.fillStyle = colors.text;
  ctx.fillText(translate('🔮 Star of the Day · Vibe Grid', '🔮 今日之星 · 氛围格子'), cx, y);

  // 3. Actor name
  if (actorName) {
    y += 48;
    ctx.font = `700 34px ${EXPORT_FONT_STACK}`;
    ctx.fillStyle = accentColor;
    drawCenteredText(ctx, actorName, cx, y, contentW);
  }

  // 4. Vibe name
  if (vibeLabel) {
    y += 40;
    ctx.font = `600 26px ${EXPORT_FONT_STACK}`;
    ctx.fillStyle = colors.text;
    drawCenteredText(ctx, (payload.vibeEmoji ? payload.vibeEmoji + ' ' : '') + vibeLabel, cx, y, contentW);
  }

  // 5. Image grid (2×3 or 2×2)
  const footerZoneH = LEGACY_FOOTER_LAYOUTS.teaser.zoneHeight;
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
  if (imgArr.length !== results.length || imgArr.some((image) => !image)) {
    throw new Error(translate(
      'The share card could not load every approved image. Nothing was exported.',
      '分享卡无法载入全部已批准的图片，没有导出文件。',
    ));
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const tx = gridX + c * (tileSize + gridGap);
      const ty = gridY + r * (tileSize + gridGap);
      const img = imgArr[idx];
      drawCoverImageRounded(ctx, img!, tx, ty, tileSize, tileSize, 14);
    }
  }

  // 6. Sources
  const sourceNames: string[] = [];
  results.forEach((r) => {
    if (r.source && !sourceNames.includes(r.source)) sourceNames.push(r.source);
  });
  drawLegacyFooter(
    ctx, 'teaser', EXPORT_TEASER_H, contentW, cx,
    sourceNames, editionStamp.text, microCopy, colors,
  );

  // 8. Tier badge overlay
  await compositeBadge(canvas, ctx, payload.badgeTier || tier);

  return canvas;
}

// ── Public API ─────────────────────────────────────────────────────

export type ExportVariant = 'full' | 'teaser' | 'standard' | 'master' | 'raw';

async function renderSquareGridCanvas(
  payload: ExportPayload,
  contract: typeof EXPORT_CONTRACTS.standard | typeof EXPORT_CONTRACTS.master,
): Promise<HTMLCanvasElement> {
  const results = payload.chosen?.results?.slice(0, 9) ?? [];
  if (results.length < 9) {
    throw new Error(translate('A square grid requires all nine approved images.', '方形拼图需要九张已批准的图片。'));
  }
  await loadExportCardFonts();
  const images = await Promise.all(results.map(result => loadProxiedImage(result.thumbnail)));
  if (images.some(image => !image)) {
    throw new Error(translate(
      'The square grid could not load all nine approved images.',
      '方形拼图无法载入全部九张已批准的图片。',
    ));
  }
  const canvas = document.createElement('canvas');
  canvas.width = contract.width;
  canvas.height = contract.height;
  // Request the browser's explicit sRGB canvas color space. Older browsers
  // ignore the option and still produce their standard sRGB canvas output.
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb' } as CanvasRenderingContext2DSettings)!;
  const pad = Math.round(contract.width * 0.026);
  const header = Math.round(contract.width * 0.045);
  const footer = Math.round(contract.width * 0.052);
  const gap = Math.round(contract.width * 0.009);
  const tile = (contract.width - pad * 2 - gap * 2 - header - footer) / 3;
  const moonlitInk = payload.presentation?.paletteId === 'moonlit-ink'
    || payload.presentation?.atmosphereId === 'moonlit-ink';
  const background = moonlitInk ? '#17182b' : '#0e0e12';
  const heading = moonlitInk ? '#9f9bea' : '#f0ede8';
  const attribution = moonlitInk ? '#c9a96e' : '#a3a3ad';
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, contract.width, contract.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = heading;
  ctx.font = `700 ${Math.round(contract.width * 0.021)}px ${EXPORT_FONT_STACK}`;
  const headerText = [
    localizedCaption(payload.actorNameEn, payload.actorName) || 'Vibe Atlas',
    localizedCaption(payload.vibeLabelEn, payload.vibeLabel) || translate('Grid', '氛围格子'),
  ].join(' · ');
  drawCenteredText(ctx, headerText, contract.width / 2, pad + header * 0.58, contract.width - pad * 2);
  results.forEach((_, index) => {
    const image = images[index]!;
    const x = pad + (index % 3) * (tile + gap);
    const y = pad + header + (index / 3 | 0) * (tile + gap);
    drawCoverImageRounded(ctx, image, x, y, tile, tile, Math.round(tile * 0.02));
  });
  const sourceNames = [...new Set(results.map(result => result.source).filter(Boolean))];
  ctx.fillStyle = attribution;
  ctx.font = `400 ${Math.round(contract.width * 0.0105)}px ${EXPORT_FONT_STACK}`;
  const attributionWidth = Math.floor(contract.width - contract.width * 0.026 * 2);
  const attributionLines = sourceCreditLines(ctx, sourceNames, attributionWidth);
  const attributionLineHeight = Math.round(contract.width * 0.014);
  const attributionBottom = contract.height - pad;
  const attributionTop = attributionBottom - (attributionLines.length - 1) * attributionLineHeight;
  drawSourceCreditLines(
    ctx, attributionLines, contract.width / 2, attributionTop, attributionLineHeight,
  );
  return canvas;
}


async function renderRawExportCanvas(payload: ExportPayload): Promise<HTMLCanvasElement> {
  const allResults = payload.chosen?.results ?? [];
  const cols = allResults.length >= 12 ? 4 : 3;
  const rows = 3;
  const results = allResults.slice(0, cols * rows);
  if (results.length < 9) throw new Error(translate(
    'This approved board is not complete yet. A share card requires at least nine images.',
    '这期已批准的内容尚不完整。分享卡至少需要九张图片。',
  ));
  const images = await Promise.all(results.map(r => loadProxiedImage(r.thumbnail)));
  if (images.some(image => !image)) throw new Error(translate(
    'The share card could not load every approved image. Nothing was exported.',
    '分享卡无法载入全部已批准的图片，没有导出文件。',
  ));
  const tileSize = 360;
  const canvas = document.createElement('canvas'); canvas.width = cols * tileSize; canvas.height = rows * tileSize;
  const ctx = canvas.getContext('2d')!;
  results.forEach((_, index) => drawCoverImageRounded(ctx, images[index]!, (index % cols) * tileSize, (index / cols | 0) * tileSize, tileSize, tileSize, 0));
  return canvas;
}

export async function renderExportCanvas(
  data: StarOfDayData,
  variant: ExportVariant = 'full',
): Promise<HTMLCanvasElement> {
  const payload = buildExportPayload(data);
  if (variant === 'standard') return renderSquareGridCanvas(payload, EXPORT_CONTRACTS.standard);
  if (variant === 'master') return renderSquareGridCanvas(payload, EXPORT_CONTRACTS.master);
  if (variant === 'raw') return renderRawExportCanvas(payload);
  return variant === 'teaser'
    ? renderTeaserExportCanvas(payload)
    : renderFullExportCanvas(payload);
}

/**
 * Renders the share card, then tries native share (mobile) or falls back
 * to a PNG download. Returns a toast message string for the caller to display.
 */
/**
 * Fire-and-forget: log a successful grid export to the engagement store so
 * the best grids can inform future curation.  Called from inside saveShareCard
 * so every caller (useExportCard, Collection screen, etc.) is covered.
 */
function logGridExportFireAndForget(payload: ExportPayload, tier: string): void {
  try {
    const results = payload.chosen?.results?.slice(0, 12) ?? [];
    const batchKey = `${payload.date}:${payload.actorNameEn}`;
    fetch('/.netlify/functions/log-engagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'grid-export',
        batchKey,
        actor: payload.actorName,
        vibe: payload.vibeLabel,
        editionTier: tier,
        resultPositions: results.map((r, i) => ({
          position: i,
          thumbnail: r.thumbnail,
          source: r.source ?? null,
        })),
      }),
    }).catch(() => { /* fire-and-forget — never blocks card export */ });
  } catch {
    // Non-fatal: logging must never interfere with the export path
  }
}

export type ExportAction = 'share' | 'download';
export interface ShareCardResult {
  message: string;
  outcome: 'shared' | 'downloaded';
}

async function createAndLogExport(
  data: StarOfDayData,
  variant: ExportVariant,
): Promise<{ artifact: ExportArtifact; payload: ExportPayload; tier: string }> {
  const payload = buildExportPayload(data);
  const tier = classifyEditionTier(payload.chosen);
  const artifact = await createExportArtifact(data, variant);

  // Log the export now that we know the canvas rendered successfully.
  logGridExportFireAndForget(payload, tier);

  return { artifact, payload, tier };
}

function notifyExportBlob(onBlob: ((blob: Blob) => void) | undefined, blob: Blob): void {
  if (!onBlob) return;
  try {
    onBlob(blob);
  } catch {
    // Persistence hooks must never interfere with the export path.
  }
}

function tierMessage(tier: string): string {
  if (tier === 'misprint') return translate('Misprint exported', '已导出稀有错版');
  if (tier === 'legendary') return translate('Legendary export', '已导出传说级藏品');
  if (tier === 'legendary-misprint') return translate('Intentional Legendary Misprint exported', '已导出传说错版');
  return translate('Share card exported ✓', '分享卡已导出 ✓');
}


export async function prepareShareCard(
  data: StarOfDayData,
  variant: ExportVariant = 'full',
  onBlob?: (blob: Blob) => void,
): Promise<{ objectUrl: string; file: File; fileName: string; tier: string }> {
  const { artifact, tier } = await createAndLogExport(data, variant);
  notifyExportBlob(onBlob, artifact.blob);
  return { objectUrl: URL.createObjectURL(artifact.blob), file: artifact.file, fileName: artifact.fileName, tier };
}

export async function exportShareCard(
  data: StarOfDayData,
  variant: ExportVariant = 'full',
  onBlob?: (blob: Blob) => void,
): Promise<ShareCardResult> {
  const { artifact } = await createAndLogExport(data, variant);
  notifyExportBlob(onBlob, artifact.blob);
  const canShareFiles = typeof navigator !== 'undefined'
    && typeof navigator.share === 'function'
    && typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [artifact.file] });

  if (!canShareFiles) {
    downloadExportArtifact(artifact);
    return {
      message: translate(
        'Direct image sharing is unavailable on this device. The PNG was downloaded.',
        '此设备暂不支持直接分享图片，PNG 已下载。',
      ),
      outcome: 'downloaded',
    };
  }

  try {
    await navigator.share!({
      files: [artifact.file],
      title: translate('Vibe Atlas', '氛围图鉴'),
      text: translate('🔮 Star of the Day · Vibe Grid', '🔮 今日之星 · 氛围格子'),
    });
    return { message: translate('Shared ✓', '分享成功 ✓'), outcome: 'shared' };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(translate('Share cancelled; nothing was downloaded.', '分享已取消，没有下载文件。'));
    }
    throw new Error(translate(
      'Native sharing failed. Use “Download PNG” instead.',
      '系统分享失败，请改用“下载 PNG”。',
    ));
  }
}

export async function downloadShareCard(
  data: StarOfDayData,
  variant: ExportVariant = 'full',
  onBlob?: (blob: Blob) => void,
): Promise<string> {
  const { artifact, tier } = await createAndLogExport(data, variant);
  notifyExportBlob(onBlob, artifact.blob);
  downloadExportArtifact(artifact);
  return tierMessage(tier);
}

/**
 * Backward-compatible single-action entry point for older callers. New UI
 * should use exportShareCard or downloadShareCard so the choice is explicit.
 */
export async function saveShareCard(
  data: StarOfDayData,
  variant: ExportVariant = 'full',
  onBlob?: (blob: Blob) => void,
): Promise<string> {
  const { artifact } = await createAndLogExport(data, variant);
  const blob = artifact.blob;
  const canShareFiles = typeof navigator !== 'undefined'
    && typeof navigator.share === 'function'
    && typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [artifact.file] });
  if (onBlob) {
    try {
      onBlob(blob);
    } catch {
      // Persistence hooks must never interfere with the export path.
    }
  }
  if (canShareFiles) {
    await navigator.share!({
      files: [artifact.file],
      title: '今日氛围图鉴',
      text: '🔮 今日之星 · 氛围格子',
    });
    return '分享成功 ✓';
  }
  downloadExportArtifact(artifact);
  return '此设备不支持直接分享图片，PNG 已下载 · File sharing unavailable; PNG downloaded';
}
