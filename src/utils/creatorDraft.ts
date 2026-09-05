import { dbSaveGrid, type GridRecord } from './collectionDB';
import { persistGridImagesToMedia, type CollectionGridMediaFailure } from './collectionMedia';
import { completeWorkstationHandoff, type WorkstationReceipt } from './workstationHandoffClient';
import { getPublicSession, syncPublicGrid } from './publicAccount';
import {
  classifyGridProvenance,
  type ClassifiedBoardProvenance,
} from './approvedBoardProvenance';

export const CREATOR_DRAFT_SOURCE_SCHEMA = 'fandom.creator-draft-source.v1';
export const CREATOR_PLATFORMS = ['rednote', 'weibo', 'instagram'] as const;
export type CreatorPlatform = typeof CREATOR_PLATFORMS[number];

export interface CreatorDraftSource {
  schema: typeof CREATOR_DRAFT_SOURCE_SCHEMA;
  kind: 'ordered-grid';
  sourceId: string;
  sourceVersion: string;
  idempotencyKey: string;
  platforms: CreatorPlatform[];
  boardProvenance: ClassifiedBoardProvenance;
  actor: {
    id: string;
    name: string;
    nameEn: string;
  };
  creativeContext: {
    vibe: string;
    vibeEn: string;
    brief: string;
    captionSeed?: string;
    editorialMode?: 'event' | 'compiled';
    compositionSize?: 9 | 12;
    arrangement?: 'automatic' | 'creator-arranged';
    primaryFamily?: string;
    evidenceBasis?: 'persisted-event' | 'batch';
  };
  orderedImages: Array<{
    position: number;
    resultId: string;
    sourceUrl: string;
    title: string;
    publisher?: string;
    batchKey?: string;
    familyId?: string;
    familyLabel?: string;
    familyEvidence?: 'persisted-event' | 'batch' | 'publisher' | 'fallback';
  }>;
}

export interface CreatorDraftResult {
  source: CreatorDraftSource;
  receipt: WorkstationReceipt;
}

export type CreatorDraftProgress =
  | { phase: 'preparing-media' }
  | { phase: 'syncing-collection'; copiedCount: number }
  | { phase: 'creating-draft' };

export class CreatorMediaReadinessError extends Error {
  readonly failures: CollectionGridMediaFailure[];

  constructor(failures: CollectionGridMediaFailure[]) {
    super(`${failures.length} grid ${failures.length === 1 ? 'image is' : 'images are'} not durably available in MEDIA.`);
    this.name = 'CreatorMediaReadinessError';
    this.failures = failures;
  }
}

/** Future-facing source contract; no arbitrary client URL is sent to Workstation from it. */
export async function creatorDraftSourceFromGrid(
  grid: GridRecord,
  platforms: CreatorPlatform[] = ['rednote'],
): Promise<CreatorDraftSource> {
  const normalizedPlatforms = normalizeCreatorPlatforms(platforms);
  const orderedImages = [...grid.images].sort((a, b) => a.gridPosition - b.gridPosition);
  const boardProvenance = await classifyGridProvenance(grid);
  const sourceId = grid.artifactId || grid.id;
  const sourceVersion = `sha256:${await sha256(canonicalJson(sourceVersionMaterial(grid)))}`;
  return {
    schema: CREATOR_DRAFT_SOURCE_SCHEMA,
    kind: 'ordered-grid',
    sourceId,
    sourceVersion,
    idempotencyKey: `grid:${sourceId}:${stableHash(sourceVersion)}:${normalizedPlatforms.join('+')}`,
    platforms: normalizedPlatforms,
    boardProvenance,
    actor: {
      id: grid.actorId,
      name: grid.actor,
      nameEn: grid.actorEn,
    },
    creativeContext: {
      vibe: grid.vibe,
      vibeEn: grid.vibeEn,
      brief: grid.generationPrompt || '',
      ...(grid.ctaSeed ? { captionSeed: grid.ctaSeed } : {}),
      ...(grid.editorial ? {
        editorialMode: grid.editorial.mode,
        compositionSize: grid.editorial.compositionSize,
        arrangement: grid.editorial.arrangement,
        ...(grid.editorial.primaryFamilyLabel ? { primaryFamily: grid.editorial.primaryFamilyLabel } : {}),
        ...(grid.editorial.evidenceBasis ? { evidenceBasis: grid.editorial.evidenceBasis } : {}),
      } : {}),
    },
    orderedImages: orderedImages
      .map(image => ({
        position: image.gridPosition,
        resultId: image.resultId,
        sourceUrl: image.sourceUrl,
        title: image.title,
        ...(image.publisher ? { publisher: image.publisher } : {}),
        ...(image.batchKey ? { batchKey: image.batchKey } : {}),
        ...(image.familyId ? { familyId: image.familyId } : {}),
        ...(image.familyLabel ? { familyLabel: image.familyLabel } : {}),
        ...(image.familyEvidence ? { familyEvidence: image.familyEvidence } : {}),
      })),
  };
}

/** Send the saved grid source directly to Workstation; no Idea Packet is created. */
export async function makeCreatorPostFromGrid(
  grid: GridRecord,
  platforms: CreatorPlatform[] = ['rednote'],
  onProgress?: (progress: CreatorDraftProgress) => void,
): Promise<CreatorDraftResult> {
  if ((await classifyGridProvenance(grid)).classification === 'unverified-saved-grid') {
    throw new Error('Unverified saved grids cannot be handed off to Workstation.');
  }
  await dbSaveGrid(grid);
  const user = await getPublicSession();
  if (!user) throw new Error('Sign in before creating a Workstation post.');
  onProgress?.({ phase: 'preparing-media' });
  const persistence = await persistGridImagesToMedia(grid);
  if (persistence.failures.length > 0) {
    throw new CreatorMediaReadinessError(persistence.failures);
  }
  onProgress?.({ phase: 'syncing-collection', copiedCount: persistence.copiedCount });
  await syncPublicGrid(user, persistence.record.id);
  const source = await creatorDraftSourceFromGrid(persistence.record, platforms);
  onProgress?.({ phase: 'creating-draft' });
  const receipt = await completeWorkstationHandoff(source);
  return { source, receipt };
}

export function normalizeCreatorPlatforms(value: readonly CreatorPlatform[]): CreatorPlatform[] {
  const unique = new Set(value);
  if (unique.size === 0 || unique.size !== value.length || [...unique].some(platform => !CREATOR_PLATFORMS.includes(platform))) {
    throw new Error('Select Rednote, Weibo, Instagram, or any combination before continuing.');
  }
  return CREATOR_PLATFORMS.filter(platform => unique.has(platform));
}

function sourceVersionMaterial(grid: GridRecord) {
  const orderedImages = [...grid.images].sort((a, b) => a.gridPosition - b.gridPosition);
  return {
    schemaVersion: grid.schemaVersion,
    rendererVersion: grid.rendererVersion,
    sourceId: grid.artifactId || grid.id,
    actorId: grid.actorId,
    vibeKey: grid.vibeKey || null,
    actor: grid.actor,
    actorEn: grid.actorEn,
    actorAccentColor: grid.actorAccentColor,
    vibe: grid.vibe,
    vibeEn: grid.vibeEn,
    vibeEmoji: grid.vibeEmoji,
    vibeSubtitle: grid.vibeSubtitle,
    searchSpell: grid.searchSpell,
    generationPrompt: grid.generationPrompt || '',
    ctaSeed: grid.ctaSeed || '',
    edition: {
      provider: grid.edition?.provider ?? null,
      misprint: Boolean(grid.edition?.misprint),
      legendary: Boolean(grid.edition?.legendary),
    },
    editorial: grid.editorial || null,
    capturedDate: grid.capturedDate,
    generatedAt: grid.generatedAt,
    sourceRoute: grid.sourceRoute || '/vibe-atlas',
    releaseCandidateProvenance: grid.releaseCandidateProvenance || null,
    images: orderedImages.map(image => ({
      position: image.gridPosition,
      resultId: image.resultId,
      imageUrl: image.imageUrl,
      sourceUrl: image.sourceUrl,
      title: image.title,
      publisher: image.publisher || '',
      batchKey: image.batchKey || '',
      familyId: image.familyId || '',
      familyLabel: image.familyLabel || '',
      familyEvidence: image.familyEvidence || '',
      batchRank: image.batchRank ?? null,
      mediaRecoverySourceUrl: image.mediaRecovery?.sourceUrl || '',
      media: image.media || null,
    })),
  };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}