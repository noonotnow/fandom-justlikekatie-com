/**
 * Local working draft for the Middle-earth "Make reaction card" path.
 *
 * Same contract as the C-drama studio's draft (src/utils/cdramaForge.ts):
 * it lives in this browser's localStorage only. It is not a Collection
 * record, is never synced to an account or MEDIA, and never touches the
 * save path. Reworks and "Keep original" are deliberately out of scope:
 * they hold uploaded originals and linked-rework recipes that already have
 * their own Collection-backed restore (`?rework=`).
 */
import {
  aesthetics,
  artifactTypes,
  autoSteering,
  characterFilters,
  memeCardFormats,
  memeFlavors,
  memeTones,
} from '../data/middleEarthCreativeGrammar.ts';
import { referenceStillFamilies } from '../data/middleEarthReferenceStills.ts';
import type { MemeFormat, MemeFraming, MemeTextPlacement } from './memeCanvas.ts';
import { SHARE_COPY_CONTRACTS, SHARE_KIT_PLATFORMS, type SharePlatform } from '../../shared/meme-share-copy.js';

export const MIDDLE_EARTH_DRAFT_KEY = 'fandom-middle-earth-memeforge-draft-v1';
const MAX_DRAFT_CHARS = 1_000_000;
const MAX_RESULTS = 24;
const MAX_URL = 4000;

export interface MiddleEarthDraftAsset {
  id: string;
  title: string;
  thumbnail: string;
  url: string;
  publisher?: string;
  query: string;
  provider?: string;
  reactionQueryTier?: string;
  reactionEmotion?: string;
  reactionEmotions?: string[];
}

export interface MiddleEarthDraftCardText {
  format: string;
  line1: string;
  line2: string;
  footer: string;
}

/**
 * Post copy for one platform. `copy: null` means "follow the template" (it is
 * rebuilt from the card lines), so only edited or AI-written copy is stored.
 * `fingerprint` is set only when AI wrote the copy; it is what staleness is
 * measured against.
 */
export interface MiddleEarthShareSlot {
  copy: { fields: Record<string, string>; tags: string[] } | null;
  fingerprint: string;
}
export type MiddleEarthShareCopy = Record<SharePlatform, MiddleEarthShareSlot>;

export function emptyShareCopy(): MiddleEarthShareCopy {
  return {
    rednote: { copy: null, fingerprint: '' },
    tiktok: { copy: null, fingerprint: '' },
    instagram: { copy: null, fingerprint: '' },
  };
}

export interface MiddleEarthWorkingDraft {
  /** v2 replaced the Rednote-only fields with per-platform share copy; v1 drafts migrate on restore. */
  version: 2;
  moment: string;
  query: string;
  searchedQuery: string;
  character: string;
  memeFlavor: string;
  aesthetic: string;
  artifactType: string;
  creativeDirection: string;
  /** Opaque translation result; shape-checked on restore. */
  translation: Record<string, unknown> | null;
  referenceStillFamily: string | null;
  angles: MiddleEarthDraftCardText[];
  selectedAngle: number;
  title: string;
  text: string;
  secondaryText: string;
  cardFormat: string | null;
  tone: string;
  memeFrame: {
    format: MemeFormat;
    framing: MemeFraming;
    focusX: number;
    focusY: number;
    textPlacement: MemeTextPlacement;
  };
  selected: MiddleEarthDraftAsset | null;
  results: MiddleEarthDraftAsset[];
  visualGeneration: { provider: 'xai'; generatedAt: string; model?: string } | null;
  sharePlatform: SharePlatform;
  shareCopy: MiddleEarthShareCopy;
}

// Every list comes from the same data module the workspace renders from, so a
// new character, tone or format can never be offered on screen but rejected
// on restore.
const AUTO = autoSteering;
const CHARACTERS: readonly string[] = characterFilters;
const TONES: readonly string[] = memeTones;
const FLAVORS: readonly string[] = [AUTO, ...memeFlavors.map((flavor) => flavor.name)];
const AESTHETICS: readonly string[] = [AUTO, ...aesthetics.map((item) => item.name)];
const ARTIFACTS: readonly string[] = [AUTO, ...artifactTypes];
const FAMILIES: readonly string[] = referenceStillFamilies.map((family) => family.id);
const CARD_FORMATS: readonly string[] = memeCardFormats;

export function emptyMiddleEarthDraft(): MiddleEarthWorkingDraft {
  return {
    version: 2,
    moment: '', query: '', searchedQuery: '',
    character: AUTO, memeFlavor: AUTO, aesthetic: AUTO, artifactType: AUTO, creativeDirection: '',
    translation: null, referenceStillFamily: null,
    angles: [], selectedAngle: 0,
    title: '', text: '', secondaryText: '', cardFormat: null, tone: TONES[0],
    memeFrame: { format: 'instagram', framing: 'cover', focusX: 50, focusY: 0, textPlacement: 'top-bottom' },
    selected: null, results: [], visualGeneration: null,
    sharePlatform: 'rednote', shareCopy: emptyShareCopy(),
  };
}

/** True when nothing worth keeping is in the draft (so the key can be removed). */
export function isEmptyMiddleEarthDraft(draft: MiddleEarthWorkingDraft): boolean {
  return !draft.moment.trim() && !draft.text.trim() && !draft.secondaryText.trim()
    && !draft.translation && !draft.selected && !draft.angles.length
    && !SHARE_KIT_PLATFORMS.some((platform) => draft.shareCopy[platform].copy !== null)
    && !draft.creativeDirection.trim();
}

const str = (value: unknown, max: number, fallback = ''): string =>
  typeof value === 'string' && value.length <= max ? value : fallback;
const oneOf = (value: unknown, allowed: readonly string[], fallback: string): string =>
  typeof value === 'string' && allowed.includes(value) ? value : fallback;
const percent = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback;

function asset(value: unknown): MiddleEarthDraftAsset | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const thumbnail = str(v.thumbnail, MAX_URL);
  const url = str(v.url, MAX_URL);
  // Inline uploads (data: URLs) belong to the rework/original paths, never this draft.
  if (!thumbnail || !url || thumbnail.startsWith('data:') || url.startsWith('data:')) return null;
  const emotions = Array.isArray(v.reactionEmotions)
    ? v.reactionEmotions.filter((item): item is string => typeof item === 'string' && item.length <= 60).slice(0, 6)
    : undefined;
  return {
    id: str(v.id, MAX_URL) || url,
    title: str(v.title, 400),
    thumbnail,
    url,
    query: str(v.query, 300),
    ...(typeof v.publisher === 'string' ? { publisher: str(v.publisher, 200) } : {}),
    ...(typeof v.provider === 'string' ? { provider: str(v.provider, 80) } : {}),
    ...(typeof v.reactionQueryTier === 'string' ? { reactionQueryTier: str(v.reactionQueryTier, 60) } : {}),
    ...(typeof v.reactionEmotion === 'string' ? { reactionEmotion: str(v.reactionEmotion, 60) } : {}),
    ...(emotions?.length ? { reactionEmotions: emotions } : {}),
  };
}

function cardText(value: unknown): MiddleEarthDraftCardText | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!CARD_FORMATS.includes(v.format as string)) return null;
  const line1 = str(v.line1, 125), line2 = str(v.line2, 125);
  if (!line1 && !line2) return null;
  return { format: v.format as string, line1, line2, footer: str(v.footer, 60) };
}

const stringList = (value: unknown, max: number) =>
  Array.isArray(value) && value.length <= max && value.every((item) => typeof item === 'string');

function translationShape(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const brief = v.reactionImageBrief as Record<string, unknown> | undefined;
  const ok = typeof v.translatedMoment === 'string'
    && typeof v.scene === 'string'
    && typeof v.memeFlavor === 'string'
    && typeof v.comicMechanism === 'string'
    && typeof v.tone === 'string'
    && cardText(v.cardText) !== null
    && Boolean(brief) && typeof brief?.socialUseQuery === 'string' && typeof brief?.visualRole === 'string'
    && stringList(brief?.characterEmotionQueries, 6) && stringList(brief?.iconicSceneQueries, 6)
    && stringList(brief?.broadFallbackQueries, 6) && stringList(brief?.performedEmotion, 6);
  return ok ? v : null;
}

const tagList = (value: unknown, max: number): string[] =>
  Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === 'string' && tag.length <= 50).slice(0, max)
    : [];

function restoreShareSlot(platform: SharePlatform, value: unknown): MiddleEarthShareSlot {
  const contract = SHARE_COPY_CONTRACTS[platform];
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const fingerprint = str(v.fingerprint, 20_000);
  const raw = v.copy && typeof v.copy === 'object' ? v.copy as Record<string, unknown> : null;
  if (!raw) return { copy: null, fingerprint: '' };
  const rawFields = (raw.fields && typeof raw.fields === 'object' ? raw.fields : {}) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const field of contract.fields) fields[field.key] = str(rawFields[field.key], field.maxLength);
  // Allow a few more tags than the platform's limit so an over-long edit is shown, not silently lost.
  return { copy: { fields, tags: tagList(raw.tags, contract.tags.max + 12) }, fingerprint };
}

function restoreShareCopy(value: unknown): MiddleEarthShareCopy {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const result = emptyShareCopy();
  for (const platform of SHARE_KIT_PLATFORMS) result[platform] = restoreShareSlot(platform, v[platform]);
  return result;
}

/** v1 stored Rednote copy only; empty v1 fields mean the Rednote slot follows the template. */
function migrateV1ShareCopy(data: Record<string, unknown>): MiddleEarthShareCopy {
  const result = emptyShareCopy();
  const title = str(data.rednoteTitle, 120);
  const caption = str(data.rednoteCaption, 2200);
  const tags = tagList(data.rednoteTags, 12);
  if (title.trim() || caption.trim() || tags.length) {
    result.rednote = {
      copy: { fields: { title, caption }, tags },
      fingerprint: str(data.rednoteGroundingFingerprint, 20_000),
    };
  }
  return result;
}

export function restoreMiddleEarthDraft(storage: Pick<Storage, 'getItem'>): MiddleEarthWorkingDraft {
  const empty = emptyMiddleEarthDraft();
  try {
    const raw = storage.getItem(MIDDLE_EARTH_DRAFT_KEY);
    if (!raw || raw.length > MAX_DRAFT_CHARS) return empty;
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || (data.version !== 1 && data.version !== 2)) return empty;
    const angles = Array.isArray(data.angles)
      ? data.angles.slice(0, 3).map(cardText).filter((item): item is MiddleEarthDraftCardText => item !== null)
      : [];
    const selectedAngle = Number.isInteger(data.selectedAngle)
      && (data.selectedAngle as number) >= 0 && (data.selectedAngle as number) < angles.length
      ? data.selectedAngle as number : 0;
    const frame = (data.memeFrame ?? {}) as Record<string, unknown>;
    const generation = data.visualGeneration as Record<string, unknown> | null | undefined;
    const results = Array.isArray(data.results)
      ? data.results.slice(0, MAX_RESULTS).map(asset).filter((item): item is MiddleEarthDraftAsset => item !== null)
      : [];
    return {
      version: 2,
      moment: str(data.moment, 500),
      query: str(data.query, 200),
      searchedQuery: str(data.searchedQuery, 200),
      character: oneOf(data.character, CHARACTERS, AUTO),
      memeFlavor: oneOf(data.memeFlavor, FLAVORS, AUTO),
      aesthetic: oneOf(data.aesthetic, AESTHETICS, AUTO),
      artifactType: oneOf(data.artifactType, ARTIFACTS, AUTO),
      creativeDirection: str(data.creativeDirection, 500),
      translation: translationShape(data.translation),
      referenceStillFamily: typeof data.referenceStillFamily === 'string' && FAMILIES.includes(data.referenceStillFamily)
        ? data.referenceStillFamily : null,
      angles,
      selectedAngle,
      title: str(data.title, 60),
      text: str(data.text, 125),
      secondaryText: str(data.secondaryText, 125),
      cardFormat: typeof data.cardFormat === 'string' && CARD_FORMATS.includes(data.cardFormat) ? data.cardFormat : null,
      tone: oneOf(data.tone, TONES, TONES[0]),
      memeFrame: {
        format: frame.format === 'tiktok' ? 'tiktok' : 'instagram',
        framing: frame.framing === 'contain' ? 'contain' : 'cover',
        focusX: percent(frame.focusX, 50),
        focusY: percent(frame.focusY, 0),
        textPlacement: oneOf(frame.textPlacement, ['top-bottom', 'single-top', 'single-bottom', 'subtitle'], 'top-bottom') as MemeTextPlacement,
      },
      selected: asset(data.selected),
      results,
      visualGeneration: generation && generation.provider === 'xai' && typeof generation.generatedAt === 'string'
        ? { provider: 'xai', generatedAt: generation.generatedAt, ...(typeof generation.model === 'string' ? { model: generation.model } : {}) }
        : null,
      sharePlatform: oneOf(data.sharePlatform, SHARE_KIT_PLATFORMS, 'rednote') as SharePlatform,
      shareCopy: data.version === 1 ? migrateV1ShareCopy(data) : restoreShareCopy(data.shareCopy),
    };
  } catch {
    return empty;
  }
}

export type DraftWriteResult = 'saved' | 'removed' | 'failed';

/**
 * Writes the draft, or removes the key when the draft is empty. On any write
 * failure the older copy is removed rather than left pretending to be current.
 */
export function writeMiddleEarthDraft(
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  draft: MiddleEarthWorkingDraft,
): DraftWriteResult {
  try {
    if (isEmptyMiddleEarthDraft(draft)) {
      storage.removeItem(MIDDLE_EARTH_DRAFT_KEY);
      return 'removed';
    }
    const value = JSON.stringify({ ...draft, results: draft.results.slice(0, MAX_RESULTS) });
    if (value.length > MAX_DRAFT_CHARS) throw new Error('Draft too large');
    storage.setItem(MIDDLE_EARTH_DRAFT_KEY, value);
    return 'saved';
  } catch {
    try { storage.removeItem(MIDDLE_EARTH_DRAFT_KEY); } catch { /* storage blocked */ }
    return 'failed';
  }
}
