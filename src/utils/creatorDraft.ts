import { dbSaveGrid, type GridRecord } from './collectionDB';
import { completeCreatorDraftHandoff, type CreateReceipt } from './createHandoffClient';
import { getPublicSession, syncPublicGrid } from './publicAccount';

export const CREATOR_DRAFT_SOURCE_SCHEMA = 'fandom.creator-draft-source.v1';
export const CREATOR_PLATFORMS = ['rednote', 'weibo'] as const;
export type CreatorPlatform = typeof CREATOR_PLATFORMS[number];

export interface CreatorDraftSource {
  schema: typeof CREATOR_DRAFT_SOURCE_SCHEMA;
  kind: 'ordered-grid';
  sourceId: string;
  sourceVersion: string;
  idempotencyKey: string;
  platforms: CreatorPlatform[];
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
  };
  orderedImages: Array<{
    position: number;
    resultId: string;
    sourceUrl: string;
    title: string;
    publisher?: string;
    batchKey?: string;
  }>;
}

export interface CreatorDraftResult {
  source: CreatorDraftSource;
  receipt: CreateReceipt;
}

/** Future-facing source contract; no arbitrary client URL is sent to CREATE from it. */
export async function creatorDraftSourceFromGrid(
  grid: GridRecord,
  platforms: CreatorPlatform[] = ['rednote'],
): Promise<CreatorDraftSource> {
  const normalizedPlatforms = normalizeCreatorPlatforms(platforms);
  const orderedImages = [...grid.images].sort((a, b) => a.gridPosition - b.gridPosition);
  const sourceVersion = `sha256:${await sha256(canonicalJson(sourceVersionMaterial(grid)))}`;
  return {
    schema: CREATOR_DRAFT_SOURCE_SCHEMA,
    kind: 'ordered-grid',
    sourceId: grid.id,
    sourceVersion,
    idempotencyKey: `grid:${grid.id}:${stableHash(sourceVersion)}:${normalizedPlatforms.join('+')}`,
    platforms: normalizedPlatforms,
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
    },
    orderedImages: orderedImages
      .map(image => ({
        position: image.gridPosition,
        resultId: image.resultId,
        sourceUrl: image.sourceUrl,
        title: image.title,
        ...(image.publisher ? { publisher: image.publisher } : {}),
        ...(image.batchKey ? { batchKey: image.batchKey } : {}),
      })),
  };
}

/** Send the saved grid source directly to Workstation; no Idea Packet is created. */
export async function makeCreatorPostFromGrid(
  grid: GridRecord,
  platforms: CreatorPlatform[] = ['rednote'],
): Promise<CreatorDraftResult> {
  await dbSaveGrid(grid);
  const user = await getPublicSession();
  if (!user) throw new Error('Sign in before creating a Workstation post.');
  await syncPublicGrid(user, grid.id);
  const source = await creatorDraftSourceFromGrid(grid, platforms);
  const receipt = await completeCreatorDraftHandoff(source);
  return { source, receipt };
}

export function normalizeCreatorPlatforms(value: readonly CreatorPlatform[]): CreatorPlatform[] {
  const unique = new Set(value);
  if (unique.size === 0 || unique.size !== value.length || [...unique].some(platform => !CREATOR_PLATFORMS.includes(platform))) {
    throw new Error('Select Rednote, Weibo, or both before continuing.');
  }
  return CREATOR_PLATFORMS.filter(platform => unique.has(platform));
}

function sourceVersionMaterial(grid: GridRecord) {
  const orderedImages = [...grid.images].sort((a, b) => a.gridPosition - b.gridPosition);
  return {
    schemaVersion: grid.schemaVersion,
    rendererVersion: grid.rendererVersion,
    sourceId: grid.id,
    actorId: grid.actorId,
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
    capturedDate: grid.capturedDate,
    generatedAt: grid.generatedAt,
    sourceRoute: grid.sourceRoute || '/vibe-atlas',
    images: orderedImages.map(image => ({
      position: image.gridPosition,
      resultId: image.resultId,
      imageUrl: image.imageUrl,
      sourceUrl: image.sourceUrl,
      title: image.title,
      publisher: image.publisher || '',
      batchKey: image.batchKey || '',
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