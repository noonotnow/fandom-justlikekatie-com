/**
 * Collection Grid Builder — the "studio" verb.
 *
 * Pure proposal engine: saved collection material → lens → proposed 3×3
 * with a structured rationale. The rationale is not just explanatory UI;
 * it is the creative brief that travels with the packet to CREATE so
 * downstream copy stops sounding templated.
 */
import type { GridItemData } from '../types';
import type { CardRecord, GridRecord, GridMediaSnapshot } from './collectionDB';
import { detectEditorialSets } from './editorialDetection';

/** A normalized card in the builder pool (saved card or saved-grid image). */
export interface BuilderCard {
  /** Stable pool key (image URL). */
  key: string;
  imageUrl: string;
  sourceUrl: string;
  title: string;
  publisher?: string;
  actor: string;
  actorEn: string;
  actorId: string;
  actorAccentColor: string;
  vibe: string;
  vibeEn: string;
  vibeEmoji: string;
  vibeSubtitle: string;
  vibeSubtitleEn: string;
  batchKey?: string;
  capturedDate: string;
  savedAt?: string;
  resultId: string;
  origin: 'saved-card' | 'saved-grid';
  sourceGridId?: string;
  /** Visual family id assigned during pool build (editorial set or batch). */
  familyId: string;
  familyLabel: string;
}

export interface CollectionLens {
  actor?: string;   // actor display name
  vibe?: string;    // vibe (EN preferred) label
  familyId?: string;
}

export interface LensOption {
  value: string;
  label: string;
  count: number;
}

export interface GridRationale {
  /** One-line aesthetic read of the whole grid. */
  aestheticRead: string;
  /** Why these 9 belong together. */
  whyTogether: string;
  /** Dominant visual motifs / families present. */
  motifs: string[];
  /** Suggested posting stance for captioning downstream. */
  suggestedStance: string;
  /** Which lens shaped the selection. */
  lens: string;
  /** Per-slot reasons, index-aligned with the 9 slots. */
  slotReasons: string[];
  /** Slots the operator manually swapped in (filled by the UI). */
  manualSwaps: string[];
}

export interface GridProposal {
  slots: BuilderCard[];
  /** Ranked leftover candidates from the same lens, for slot swapping. */
  alternates: BuilderCard[];
  rationale: GridRationale;
}

// ── Pool construction ──────────────────────────────────────────────

function fromSavedCard(card: CardRecord): BuilderCard {
  return {
    key: card.imageUrl,
    imageUrl: card.thumbnailUrl || card.imageUrl,
    sourceUrl: card.sourceUrl || card.imageUrl,
    title: `${card.actor} · ${card.vibe}`,
    actor: card.actor,
    actorEn: card.actorEn,
    actorId: `saved-${slugify(card.actorEn || card.actor)}`,
    actorAccentColor: '#c9a96e',
    vibe: card.vibe,
    vibeEn: card.vibeEn,
    vibeEmoji: card.vibeEmoji,
    vibeSubtitle: '',
    vibeSubtitleEn: '',
    ...(card.gridContext?.batchKey ? { batchKey: card.gridContext.batchKey } : {}),
    capturedDate: card.capturedDate,
    ...(card.savedAt ? { savedAt: card.savedAt } : {}),
    resultId: card.resultId || card.imageUrl,
    origin: 'saved-card',
    familyId: '',
    familyLabel: '',
  };
}

function fromGridImage(grid: GridRecord, image: GridMediaSnapshot): BuilderCard {
  return {
    key: image.imageUrl,
    imageUrl: image.imageUrl,
    sourceUrl: image.sourceUrl,
    title: image.title,
    ...(image.publisher ? { publisher: image.publisher } : {}),
    actor: grid.actor,
    actorEn: grid.actorEn,
    actorId: grid.actorId,
    actorAccentColor: grid.actorAccentColor,
    vibe: grid.vibe,
    vibeEn: grid.vibeEn,
    vibeEmoji: grid.vibeEmoji,
    vibeSubtitle: grid.vibeSubtitle,
    vibeSubtitleEn: grid.vibeSubtitleEn,
    ...(image.batchKey || grid.searchSpell
      ? { batchKey: image.batchKey || grid.searchSpell }
      : {}),
    capturedDate: grid.capturedDate,
    savedAt: grid.savedAt,
    resultId: image.resultId,
    origin: 'saved-grid',
    sourceGridId: grid.id,
    familyId: '',
    familyLabel: '',
  };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}

/**
 * Extract the actor identity a search spell testifies to. Spells are built as
 * "<actor name> <vibe words>" so the first token is the canonical identity of
 * whoever the images were actually fetched for. Only a plausible CJK name
 * (2–4 han characters) counts as evidence; anything else returns undefined.
 */
function actorEvidenceFromSpell(batchKey: string | undefined): string | undefined {
  if (!batchKey) return undefined;
  const first = batchKey.trim().split(/\s+/)[0];
  return first && /^[\u4e00-\u9fff]{2,4}$/.test(first) ? first : undefined;
}

/**
 * Identity purification: a card's `actor` metadata is inherited from the saved
 * record and can drift (e.g. a grid record labeled 王以纶 holding images fetched
 * with an 敖瑞鹏 spell). The spell is primary evidence — when it names a
 * different person than the metadata, the spell wins. This must happen before
 * any lens filtering so "star: X" can never seat a separate human man.
 */
function reconcileIdentity(card: BuilderCard): BuilderCard {
  const evidence = actorEvidenceFromSpell(card.batchKey);
  if (!evidence || evidence === card.actor) return card;
  return {
    ...card,
    actor: evidence,
    actorEn: '',
    actorId: `spell-${slugify(evidence)}`,
    title: card.origin === 'saved-card' ? `${evidence} · ${card.vibe}` : card.title,
  };
}

/**
 * Build the deduplicated builder pool from saved cards + saved-grid images,
 * and assign a crude visual family to every card:
 * editorialDetection sets where possible, batch/spell key otherwise.
 */
export function buildPool(cards: CardRecord[], grids: GridRecord[]): BuilderCard[] {
  const seen = new Set<string>();
  const pool: BuilderCard[] = [];
  for (const card of cards) {
    const built = reconcileIdentity(fromSavedCard(card));
    if (seen.has(built.key)) continue;
    seen.add(built.key);
    pool.push(built);
  }
  for (const grid of grids) {
    for (const image of grid.images) {
      const built = reconcileIdentity(fromGridImage(grid, image));
      if (seen.has(built.key)) continue;
      seen.add(built.key);
      pool.push(built);
    }
  }

  // Editorial detection over items that carry publisher/title signal.
  const detectable: GridItemData[] = pool.map(card => ({
    id: card.key,
    title: card.title,
    thumbnail: card.imageUrl,
    ...(card.publisher ? { publisher: card.publisher } : {}),
    url: card.sourceUrl,
    ...(card.batchKey ? { batchKey: card.batchKey } : {}),
  }));
  const { items } = detectEditorialSets(detectable);
  const setById = new Map(items.map(item => [item.id, item.editorialSetId]));

  return pool.map(card => {
    const editorial = setById.get(card.key);
    if (editorial) {
      return { ...card, familyId: editorial, familyLabel: card.publisher || editorial.replace(/^editorial-/, '') };
    }
    const batch = card.batchKey ? `batch-${slugify(card.batchKey)}` : `vibe-${slugify(card.vibeEn || card.vibe)}`;
    return { ...card, familyId: batch, familyLabel: card.batchKey || card.vibeEn || card.vibe };
  });
}

// ── Lens options ───────────────────────────────────────────────────

function countBy(pool: BuilderCard[], key: (card: BuilderCard) => string | undefined, label: (card: BuilderCard) => string): LensOption[] {
  const counts = new Map<string, LensOption>();
  for (const card of pool) {
    const value = key(card);
    if (!value) continue;
    const existing = counts.get(value);
    if (existing) existing.count += 1;
    else counts.set(value, { value, label: label(card), count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

export function lensOptions(pool: BuilderCard[]): {
  actors: LensOption[];
  vibes: LensOption[];
  families: LensOption[];
} {
  return {
    actors: countBy(pool, card => card.actor, card => card.actor),
    vibes: countBy(pool, card => card.vibeEn || card.vibe, card => `${card.vibeEmoji} ${card.vibeEn || card.vibe}`),
    families: countBy(pool, card => card.familyId, card => card.familyLabel).filter(option => option.count >= 2),
  };
}

export function applyLens(pool: BuilderCard[], lens: CollectionLens): BuilderCard[] {
  return pool.filter(card =>
    (!lens.actor || card.actor === lens.actor)
    && (!lens.vibe || (card.vibeEn || card.vibe) === lens.vibe)
    && (!lens.familyId || card.familyId === lens.familyId));
}

// ── Proposal engine ────────────────────────────────────────────────

const MAX_PER_FAMILY = 3;
const MAX_PER_PUBLISHER = 4;

function rankPool(pool: BuilderCard[]): BuilderCard[] {
  const familySizes = new Map<string, number>();
  for (const card of pool) {
    familySizes.set(card.familyId, (familySizes.get(card.familyId) || 0) + 1);
  }
  return [...pool].sort((a, b) => {
    // Larger cohesive families first (capped later), then recency.
    const familyDelta = (familySizes.get(b.familyId) || 0) - (familySizes.get(a.familyId) || 0);
    if (familyDelta !== 0) return familyDelta;
    return (b.savedAt || b.capturedDate).localeCompare(a.savedAt || a.capturedDate);
  });
}

/** Propose a 3×3 from the lensed pool with anti-clustering constraints. */
export function proposeGrid(pool: BuilderCard[], lens: CollectionLens): GridProposal {
  const ranked = rankPool(applyLens(pool, lens));
  const slots: BuilderCard[] = [];
  const rest: BuilderCard[] = [];
  const familyCounts = new Map<string, number>();
  const publisherCounts = new Map<string, number>();

  for (const card of ranked) {
    const familyCount = familyCounts.get(card.familyId) || 0;
    const publisherKey = card.publisher || '';
    const publisherCount = publisherKey ? (publisherCounts.get(publisherKey) || 0) : 0;
    if (slots.length < 9 && familyCount < MAX_PER_FAMILY && publisherCount < MAX_PER_PUBLISHER) {
      slots.push(card);
      familyCounts.set(card.familyId, familyCount + 1);
      if (publisherKey) publisherCounts.set(publisherKey, publisherCount + 1);
    } else {
      rest.push(card);
    }
  }
  // Backfill if constraints starved the grid.
  while (slots.length < 9 && rest.length > 0) slots.push(rest.shift()!);

  return { slots, alternates: rest, rationale: buildRationale(slots, lens) };
}

// ── Rationale ──────────────────────────────────────────────────────

const STANCES: Array<{ test: (context: { vibes: string[]; familyCount: number }) => boolean; stance: string }> = [
  { test: ({ vibes }) => /wedding|bridal|red|婚/i.test(vibes.join(' ')), stance: 'Poetic micro-essay — theme-forward, richer language' },
  { test: ({ vibes }) => /moon|night|dark|ink|月|夜/i.test(vibes.join(' ')), stance: 'Soft cinematic — dreamy, observational, image-led' },
  { test: ({ vibes }) => /smile|off.?duty|casual|street|笑/i.test(vibes.join(' ')), stance: 'Rednote casual — native-feeling, lighter, less formal' },
  { test: ({ familyCount }) => familyCount === 1, stance: 'Character study — one shoot, one emotional read of the actor' },
  { test: ({ familyCount }) => familyCount >= 4, stance: 'Aesthetic archive — a curated visual collection across shoots' },
];

/**
 * Recompute the rationale for the current slots (after a manual swap),
 * preserving the operator's manual-swap record.
 */
export function rebuildRationale(
  slots: BuilderCard[],
  lens: CollectionLens,
  manualSwaps: string[],
): GridRationale {
  return { ...buildRationale(slots, lens), manualSwaps };
}

function buildRationale(slots: BuilderCard[], lens: CollectionLens): GridRationale {
  const families = new Map<string, BuilderCard[]>();
  for (const card of slots) {
    const group = families.get(card.familyId) || [];
    group.push(card);
    families.set(card.familyId, group);
  }
  const familyList = [...families.values()].sort((a, b) => b.length - a.length);
  const actors = [...new Set(slots.map(card => card.actor))];
  const vibes = [...new Set(slots.map(card => card.vibeEn || card.vibe))];
  const motifs = familyList.map(group => `${group[0].familyLabel} (${group.length})`);

  const lensParts = [
    lens.actor ? `star: ${lens.actor}` : '',
    lens.vibe ? `vibe: ${lens.vibe}` : '',
    lens.familyId ? `visual family: ${familyList.find(g => g[0].familyId === lens.familyId)?.[0].familyLabel || lens.familyId}` : '',
  ].filter(Boolean);
  const lensLabel = lensParts.length ? lensParts.join(' · ') : 'whole saved collection';

  const aestheticRead = `${actors.join(' / ')} across ${vibes.length === 1 ? `one vibe (${vibes[0]})` : `${vibes.length} vibes (${vibes.join(', ')})`}, drawn from ${familyList.length === 1 ? 'a single visual family' : `${familyList.length} visual families`}.`;

  const whyTogether = familyList.length === 1
    ? `All nine frames come from the same visual family (${familyList[0][0].familyLabel}) — the grid reads as one cohesive editorial issue.`
    : `The grid balances ${familyList.length} families — anchored by ${familyList[0][0].familyLabel} (${familyList[0].length} frames) with contrast from ${familyList.slice(1).map(g => g[0].familyLabel).join(', ')} — so it reads curated, not scraped.`;

  const stance = STANCES.find(({ test }) => test({ vibes, familyCount: familyList.length }))?.stance
    ?? 'Aesthetic archive — a curated visual collection';

  const slotReasons = slots.map(card => {
    const size = families.get(card.familyId)?.length || 1;
    return size > 1
      ? `${card.familyLabel} set (${size} in grid)`
      : `standalone · ${card.vibeEn || card.vibe}`;
  });

  return {
    aestheticRead,
    whyTogether,
    motifs,
    suggestedStance: stance,
    lens: lensLabel,
    slotReasons,
    manualSwaps: [],
  };
}

/** Render the rationale as the creative brief text that travels to CREATE. */
export function rationaleBrief(rationale: GridRationale): string {
  return [
    `Lens: ${rationale.lens}`,
    `Aesthetic read: ${rationale.aestheticRead}`,
    `Why these belong together: ${rationale.whyTogether}`,
    `Visual motifs: ${rationale.motifs.join('; ')}`,
    rationale.manualSwaps.length
      ? `Deliberately swapped in by the operator: ${rationale.manualSwaps.join('; ')}`
      : '',
    `Suggested posting stance: ${rationale.suggestedStance}`,
  ].filter(Boolean).join('\n');
}

// ── GridRecord assembly ────────────────────────────────────────────

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Build a GridRecord from the chosen 9 slots. The rationale brief is stored
 * in `generationPrompt` so it survives into packets and the CREATE handoff
 * without touching the rendered card.
 */
export function gridRecordFromProposal(
  slots: BuilderCard[],
  rationale: GridRationale,
  now = new Date(),
): GridRecord {
  if (slots.length !== 9) throw new Error(`A grid needs exactly 9 slots (got ${slots.length}).`);
  const date = now.toISOString().slice(0, 10);
  const anchor = slots[0];
  const vibes = [...new Set(slots.map(card => card.vibe))];
  const id = `builder-${date}-${stableHash(slots.map(card => card.key).join('|'))}`;
  return {
    kind: 'grid',
    schemaVersion: 1,
    rendererVersion: 'vibe-atlas-v1',
    id,
    actorId: anchor.actorId,
    actor: anchor.actor,
    actorEn: anchor.actorEn,
    actorAccentColor: anchor.actorAccentColor,
    vibe: vibes.length === 1 ? anchor.vibe : `${anchor.vibe} +`,
    vibeEn: vibes.length === 1 ? anchor.vibeEn : `${anchor.vibeEn} + ${vibes.length - 1} more`,
    vibeEmoji: anchor.vibeEmoji,
    vibeSubtitle: anchor.vibeSubtitle,
    vibeSubtitleEn: anchor.vibeSubtitleEn,
    searchSpell: rationale.lens,
    generationPrompt: rationaleBrief(rationale),
    edition: { provider: 'collection-grid-builder', misprint: false, legendary: false },
    capturedDate: date,
    generatedAt: now.toISOString(),
    savedAt: now.toISOString(),
    sourceRoute: '/admin#grid-builder',
    images: slots.map((card, gridPosition) => ({
      resultId: card.resultId,
      imageUrl: card.imageUrl,
      sourceUrl: card.sourceUrl,
      title: card.title,
      ...(card.publisher ? { publisher: card.publisher } : {}),
      ...(card.batchKey ? { batchKey: card.batchKey } : {}),
      gridPosition,
    })),
  };
}
