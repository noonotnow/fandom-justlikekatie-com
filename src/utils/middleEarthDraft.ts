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
import { aesthetics, artifactTypes, memeFlavors } from '../data/middleEarthCreativeGrammar.ts';
import { referenceStillFamilies } from '../data/middleEarthReferenceStills.ts';
import type { MemeFormat, MemeFraming, MemeTextPlacement } from './memeCanvas.ts';

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

export interface MiddleEarthWorkingDraft {
  version: 1;
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
  rednoteTitle: string;
  rednoteCaption: string;
  rednoteTags: string[];
  rednoteGroundingFingerprint: string;
}

const AUTO = 'Auto / surprise me';
const CHARACTERS = [AUTO, 'Boromir', 'Gandalf', 'Éowyn', 'Frodo', 'Samwise', 'Aragorn', 'Galadriel', 'Legolas', 'Gimli', 'Bilbo', 'Gollum', 'The Fellowship'];
const TONES = ['Deadpan', 'Tender', 'Chaotic', 'Dramatic'];
const FLAVORS: readonly string[] = [AUTO, ...memeFlavors.map((flavor) => flavor.name)];
const AESTHETICS: readonly string[] = [AUTO, ...aesthetics.map((item) => item.name)];
const ARTIFACTS: readonly string[] = [AUTO, ...artifactTypes];
const FAMILIES: readonly string[] = referenceStillFamilies.map((family) => family.id);
const CARD_FORMATS = ['Reaction Card', 'Dialogue Card', 'Proverb Card', 'Boundary Card', 'Internal Debate Card'];

export function emptyMiddleEarthDraft(): MiddleEarthWorkingDraft {
  return {
    version: 1,
    moment: '', query: '', searchedQuery: '',
    character: AUTO, memeFlavor: AUTO, aesthetic: AUTO, artifactType: AUTO, creativeDirection: '',
    translation: null, referenceStillFamily: null,
    angles: [], selectedAngle: 0,
    title: '', text: '', secondaryText: '', cardFormat: null, tone: TONES[0],
    memeFrame: { format: 'instagram', framing: 'cover', focusX: 50, focusY: 0, textPlacement: 'top-bottom' },
    selected: null, results: [], visualGeneration: null,
    rednoteTitle: '', rednoteCaption: '', rednoteTags: [], rednoteGroundingFingerprint: '',
  };
}

/** True when nothing worth keeping is in the draft (so the key can be removed). */
export function isEmptyMiddleEarthDraft(draft: MiddleEarthWorkingDraft): boolean {
  return !draft.moment.trim() && !draft.text.trim() && !draft.secondaryText.trim()
    && !draft.translation && !draft.selected && !draft.angles.length
    && !draft.rednoteTitle.trim() && !draft.rednoteCaption.trim() && !draft.creativeDirection.trim();
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

export function restoreMiddleEarthDraft(storage: Pick<Storage, 'getItem'>): MiddleEarthWorkingDraft {
  const empty = emptyMiddleEarthDraft();
  try {
    const raw = storage.getItem(MIDDLE_EARTH_DRAFT_KEY);
    if (!raw || raw.length > MAX_DRAFT_CHARS) return empty;
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || data.version !== 1) return empty;
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
      version: 1,
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
      rednoteTitle: str(data.rednoteTitle, 120),
      rednoteCaption: str(data.rednoteCaption, 2200),
      rednoteTags: Array.isArray(data.rednoteTags)
        ? data.rednoteTags.filter((tag): tag is string => typeof tag === 'string' && tag.length <= 50).slice(0, 12)
        : [],
      rednoteGroundingFingerprint: str(data.rednoteGroundingFingerprint, 20_000),
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
