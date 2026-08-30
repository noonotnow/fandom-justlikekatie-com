import type { GridRecord } from './collectionDB';
import { completeCreatorDraftHandoff, completeIdeaPacketHandoff } from './createHandoffClient';
import { renderPacketOutputs } from './createHandoff';
import {
  createIdeaPacket,
  mutateIdeaPacket,
  type CreateReceipt,
  type IdeaPacket,
} from './ideaPackets';

export const CREATOR_DRAFT_SOURCE_SCHEMA = 'fandom.creator-draft-source.v1';

export interface CreatorDraftSource {
  schema: typeof CREATOR_DRAFT_SOURCE_SCHEMA;
  kind: 'ordered-grid';
  sourceId: string;
  sourceVersion: string;
  idempotencyKey: string;
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
export function creatorDraftSourceFromGrid(grid: GridRecord): CreatorDraftSource {
  const orderedImages = [...grid.images].sort((a, b) => a.gridPosition - b.gridPosition);
  const sourceVersion = `${grid.schemaVersion}:${grid.generatedAt}:${orderedImages.map(image => image.resultId).join('|')}`;
  return {
    schema: CREATOR_DRAFT_SOURCE_SCHEMA,
    kind: 'ordered-grid',
    sourceId: grid.id,
    sourceVersion,
    idempotencyKey: `grid:${grid.id}:${stableHash(sourceVersion)}`,
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

/** Send the saved grid source directly to Creator OS; no Idea Packet is created. */
export async function makeCreatorPostFromGrid(grid: GridRecord): Promise<CreatorDraftResult> {
  const source = creatorDraftSourceFromGrid(grid);
  const receipt = await completeCreatorDraftHandoff(source);
  return { source, receipt };
}

export async function makeCreatorPostFromPacket(
  packet: IdeaPacket,
): Promise<{ compatibilityPacket: IdeaPacket; receipt: CreateReceipt }> {
  const created = await createIdeaPacket(packet);
  const compiled = await mutateIdeaPacket(created, { type: 'set_state', state: 'media_compiled' });
  const receipt = await completeIdeaPacketHandoff(compiled, renderPacketOutputs);
  return { compatibilityPacket: compiled, receipt };
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}